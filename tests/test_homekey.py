# Pruebas del vigilante (app/homekey.py) en el PC, sin tele: un luna-send simulado que, como el de la
# tele, solo responde si tiene un terminal, y el servidor HTTP en un puerto libre.
# Uso: python3 -I tests/test_homekey.py
import importlib.util
import json
import os
import stat
import sys
import tempfile
import threading
import time
import unittest
import urllib.error
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
FAKE_LUNA = """#!/bin/sh
# luna-send simulado: sin terminal en la entrada no escribe nada (como en la tele).
[ -t 0 ] || exit 0
for last; do :; done
echo "$@" >>"$FAKE_LUNA_LOG"
case "$*" in
  *-i*) echo '{"appId":"netflix","returnValue":true}'; echo '{"appId":'; echo '"youtube"}{"appId":"x"}'; sleep 0.3 ;;
  *) printf '{"returnValue":true,"echo":%s}\\n' "$last" ;;
esac
"""


def load_watcher(tmp):
    spec = importlib.util.spec_from_file_location("homekey", os.path.join(ROOT, "app", "homekey.py"))
    hk = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(hk)
    for name in ("LG_HOME_FLAG", "BOOT_ORIG", "POWER_LOG", "SAVER_OFF_FLAG", "PREFS", "TOKEN_FILE",
                 "BLACKBOX_FLAG", "LOG_ARCHIVE", "KEYFILTERS_ORIG", "KEYFILTER_STAMP"):
        setattr(hk, name, os.path.join(tmp, os.path.basename(getattr(hk, name))))
    hk.log = lambda msg: None
    return hk


class WatcherTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp()
        fake = os.path.join(cls.tmp, "luna-send")
        with open(fake, "w") as f:
            f.write(FAKE_LUNA)
        os.chmod(fake, os.stat(fake).st_mode | stat.S_IEXEC)
        os.environ["PATH"] = cls.tmp + os.pathsep + os.environ["PATH"]
        os.environ["FAKE_LUNA_LOG"] = os.path.join(cls.tmp, "calls.log")
        cls.hk = load_watcher(cls.tmp)
        with open(cls.hk.TOKEN_FILE, "w") as f:
            f.write("0123456789abcdef-clave\n")
        cls.hk.HTTP_PORT = 45799
        cls.hk.run_as_home = lambda *args: None  # no hay SAM que reiniciar
        cls.hk.boot_into_lg = cls.hk.boot_into_menu = lambda: None
        cls.hk.serve_http()

    def request(self, path, body=None, token="0123456789abcdef-clave", raw=None):
        sep = "&" if "?" in path else "?"
        url = "http://127.0.0.1:%d%s%st=%s" % (self.hk.HTTP_PORT, path, sep, token)
        data = raw if raw is not None else (None if body is None else json.dumps(body).encode())
        try:
            with urllib.request.urlopen(urllib.request.Request(url, data=data), timeout=5) as res:
                return res.status, json.loads(res.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    def test_luna_sin_shell(self):
        # Comillas y símbolos de la shell llegan tal cual a luna-send, en cualquiera de los dos modos.
        payload = {"id": "a'b; touch %s/pwned $(id) `id`" % self.tmp}
        for mode in ("pty", "script"):
            res = self.hk.luna_once("luna://prueba/eco", payload, mode)
            self.assertEqual(res.get("echo"), payload, mode)
        self.assertFalse(os.path.exists(os.path.join(self.tmp, "pwned")))

    def test_luna_elige_modo(self):
        self.hk.LUNA_MODE[0] = None
        self.assertTrue(self.hk.luna("luna://prueba/eco", {}).get("returnValue"))
        self.assertEqual(self.hk.LUNA_MODE[0], "pty")

    def test_suscripcion(self):
        seen = []
        threading.Thread(target=self.hk.subscribe, daemon=True,
                         args=("luna://prueba/sub", {"subscribe": True}, lambda m: seen.append(m["appId"]))).start()
        time.sleep(1.5)
        self.assertEqual(seen[:3], ["netflix", "youtube", "x"])  # JSON partido en líneas y pegado

    def test_clave(self):
        self.assertEqual(self.request("/status", token="")[0], 403)
        self.assertEqual(self.request("/status", token="otra")[0], 403)
        self.assertEqual(self.request("/control/power", {}, token="")[0], 403)
        self.assertEqual(self.request("/icon?path=/etc/passwd", token="")[0], 403)
        self.assertEqual(self.request("/status"), (200, {"menuIsHome": True}))

    def test_sin_clave_configurada_se_rechaza_todo(self):
        saved, self.hk.TOKEN[0] = self.hk.TOKEN[0], ""
        try:
            self.assertEqual(self.request("/status", token="")[0], 403)
        finally:
            self.hk.TOKEN[0] = saved

    def test_prefs(self):
        good = {"settings": {"sounds": False, "saverMinutes": 5}, "order": [["tv", "lp:a\"b"], ["netflix"]]}
        self.assertEqual(self.request("/prefs", good)[0], 200)
        self.assertEqual(self.request("/prefs"), (200, good))
        self.assertEqual(self.request("/control")[1]["settings"], good["settings"])
        for bad in ({}, {"order": []}, {"settings": {}, "order": "x"}, {"settings": {}, "order": [["a", 1]]},
                    {"settings": {"a": {"b": 1}}}, {"settings": {}, "extra": 1}, [1], "x"):
            self.assertEqual(self.request("/prefs", bad)[0], 400, bad)
        self.assertEqual(self.request("/prefs", raw=b"{" + b" " * 70000 + b"}")[0], 400)  # demasiado grande
        self.assertEqual(self.request("/prefs", raw=b"no es json")[0], 400)
        self.assertEqual(self.request("/prefs"), (200, good))  # nada de lo anterior lo ha tocado

    def test_control(self):
        self.assertEqual(self.request("/control/state", {"open": True}), (200, {"open": True}))
        self.assertEqual(self.request("/control/state"), (200, {"open": True}))
        self.assertEqual(self.request("/control/sound", {"output": "tv_speaker"}), (200, {"ok": True}))
        self.assertEqual(self.request("/control/sound", {"output": "x'; reboot"})[0], 400)
        self.assertEqual(self.request("/control/otra", {})[0], 400)

    def test_iconos_solo_de_las_carpetas_de_apps(self):
        for path in ("/etc/passwd", "/etc/shadow.png", "/usr/palm/applications/../../../etc/passwd", ""):
            self.assertEqual(self.request("/icon?path=" + urllib.request.quote(path))[0], 404, path)

    def test_ajustes(self):
        self.assertEqual(self.request("/saver/off", {}), (200, {"saver": False}))
        self.assertEqual(self.request("/saver/on", {}), (200, {"saver": True}))
        self.assertEqual(self.request("/home/lg", {}), (200, {"menuIsHome": False}))
        self.assertEqual(self.request("/home/menu", {}), (200, {"menuIsHome": True}))
        self.assertEqual(self.request("/nada", {})[0], 404)

    def test_caja_negra_opcional(self):
        copied = {}
        self.hk.WATCHER_LOG = os.path.join(self.tmp, "vigilante-origen.log")
        with open(self.hk.WATCHER_LOG, "w") as f:
            f.write("hola\n")
        self.hk.archive_once(copied)
        dst = os.path.join(self.hk.LOG_ARCHIVE, "vigilante.log")
        first = os.stat(dst).st_mtime_ns
        time.sleep(0.05)
        self.hk.archive_once(copied)
        self.assertEqual(os.stat(dst).st_mtime_ns, first)  # sin cambios no se reescribe


if __name__ == "__main__":
    unittest.main(verbosity=2)
