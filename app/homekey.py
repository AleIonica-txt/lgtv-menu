# Vigilante de Mi Menú (se ejecuta en la tele como root; lo arranca homekey.sh desde init.d): ajustes
# del sistema que la app web no puede tocar, el botón de fuentes, la memoria y un servidor HTTP local
# para el menú y el centro de control. Lee el mando sin capturarlo (sin EVIOCGRAB). Si el menú no
# está montado como Home del sistema (as-home.sh), relanza el menú tras la tecla Home, como el
# servicio Home-key de zzeppieri/webos-custom-home (también en theboringhumane/theboringtv-lgwebos).
# Uso: python3 homekey.py [--debug]   (--debug registra el código de cada tecla)
#
# Servidor HTTP: solo escucha en 127.0.0.1, pero ahí lo alcanza cualquier página que la tele tenga
# abierta (el navegador, la publicidad de una app...). Por eso todas las peticiones llevan una clave
# (?t=...) que solo conocen el menú y el centro de control: token.sh la crea y la deja en sus
# carpetas (token.js). Sin clave válida responde 403. Los cuerpos JSON tienen un tamaño máximo.
#
# Ajuste "La tecla Home abre": si existe LG_HOME_FLAG, la tecla Home se deja al inicio de LG
# (y autostart.sh tampoco abre el menú al encender). El menú lo cambia desde sus ajustes:
#   GET /status -> {"menuIsHome": true|false};  POST /home/menu  y  POST /home/lg
#
# Arranque: "Inicio automático de Home" y la "última entrada" se dejan como los tiene LG (el menú ya es
# su Home y lo abre él solo). Antes se forzaba el menú como última entrada en cada apagado, pero LG
# la usa para reconectar la fuente de vídeo al encender: con una app web ahí (y el tipo "TDT"), a
# veces la TDT se quedaba en "Sin señal" y el vídeo de YouTube en negro. Los valores originales de
# entonces están en BOOT_ORIG y se restauran si aún quedan los forzados.
#
# Salvapantallas: con el menú en pantalla y su salvapantallas propio activado, saverveto.js veta el
# de LG. El menú dice si el suyo está activado con POST /saver/on y POST /saver/off, y este script
# lo guarda en SAVER_OFF_FLAG para que saverveto.js lo lea.
#
# Menú como Home del sistema (as-home.sh): webOS ya abre el menú con la tecla Home, así que este
# script deja de relanzarlo. Cambiar "La tecla Home abre" monta o desmonta esa copia.
#
# Preferencias (ajustes y orden de las tarjetas): GET /prefs y POST /prefs (cuerpo JSON). Se guardan
# aquí y no solo en el navegador porque el menú y su copia como Home tienen almacenamientos distintos.
#
# Botón de fuentes: abre el centro de control. Con el menú como inicio, este script pone keyfilter.js
# el primero de los filtros de teclas del gestor de ventanas (com.webos.surfacemanager.keyFilters,
# con setConfigs: no se guarda, cada arranque vuelve la lista de LG): el botón abre el panel y el
# selector de entradas de LG no llega a lanzarse. La lista original queda en KEYFILTERS_ORIG.
# Sin el filtro (p. ej. si no carga), el selector de LG se cierra en cuanto aparece (watch_picker).
#
# Memoria: algunas apps dejan un servicio pesado en marcha aunque no se usen (el servidor de Stremio
# ocupa ~120 MB). Si la app lleva IDLE_CLOSE_S sin estar delante, se cierran la app y su servicio;
# el sistema vuelve a arrancar el servicio en cuanto se abre la app. Las apps de HUNGRY_APPS
# (Stremio) entran en la lista EFS del gestor de memoria de LG (tune_memory) y, al ponerse delante,
# se cierran las demás apps de segundo plano (free_memory_for): si no, LG las reinicia al reproducir.
#
# Centro de control (app aparte, sin permiso para estas llamadas): GET /control (app que se está
# viendo y ajustes del menú), POST /control/sound {"output": "tv_speaker"} (solo SOUND_OUTPUTS), /control/power,
# /control/screenoff, /control/state {"open": true|false} (el panel avisa de si está abierto; con GET
# lo pregunta el panel, por si lo tapó una capa del sistema) y /control/key (pruebas: hace lo mismo
# que el botón de fuentes).
#
# Iconos de las apps para "Todas las apps": GET /icon?path=... (el motor web no deja a la página
# leer ficheros de otras apps). Solo imágenes dentro de las carpetas de apps (ICON_ROOTS).
#
# Caja negra (opcional, para investigar fallos): si existe BLACKBOX_FLAG, los registros de la tele se
# van copiando a la flash (ver archive_logs). Activar: touch /var/lib/webosbrew/tvmenu-blackbox
import json
import urllib.parse
import os
import select
import shutil
import signal
import struct
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

APP = "org.mimenu.tvmenu"
HOME_CODE = 773          # Home en los mandos LG (Magic Remote)
INPUT_CODE = 241         # botón de fuentes (KEY_INPUT)
CONTROL_APP = "org.mimenu.tvmenu.control"
PICKER = "com.webos.app.quickinputpicker"
PICKER_WINDOW = 3.0      # s tras la pulsación en los que se vigila el selector de LG
PICKER_TIMEOUT = 1.5     # si el selector no ha salido en este tiempo, el panel se abre igualmente
DELAYS = (0.4, 1.3)      # segundos tras la pulsación: el Home de LG tarda en aparecer
RESCAN = 5               # cada cuánto buscar mandos nuevos (p. ej. Bluetooth que se reconecta)
EV_KEY = 1
EVENT = struct.Struct("llHHi")  # struct input_event
DEBUG = "--debug" in sys.argv
LG_HOME_FLAG = "/var/lib/webosbrew/tvmenu-lg-home"
BOOT_ORIG = "/var/lib/webosbrew/tvmenu-boot.orig"
POWER_LOG = "/var/lib/webosbrew/tvmenu-power.log"  # persiste entre reinicios (para comprobar el apagado)
SAVER_OFF_FLAG = "/var/lib/webosbrew/tvmenu-saver-off"
PREFS = "/var/lib/webosbrew/tvmenu-prefs.json"
HEAVY_SERVICES = {"io.strem.tv": "io.strem.tv.server"}  # app -> servicio que deja en marcha
IDLE_CLOSE_S = 300
# Apps que necesitan toda la memoria posible: Stremio reproduce dentro de su página web (~330 MB)
# y su servidor crece mientras descarga; en una tele de 1,2 GB con 594 MB reservados para vídeo, LG
# la reinicia "para liberar memoria". Al ponerse delante se cierran las demás apps de segundo plano.
HUNGRY_APPS = {"io.strem.tv"}
# Caja negra: copia en la flash de los registros de la tele (ver archive_logs).
BLACKBOX_FLAG = "/var/lib/webosbrew/tvmenu-blackbox"
LOG_ARCHIVE = "/var/lib/webosbrew/tvmenu-logs"
LOG_ARCHIVE_KEEP = 40  # trozos rotados (~300 KB cada uno): unas 6 horas de registros
WATCHER_LOG = "/tmp/tvmenu-homekey.log"  # la salida de este script (ver homekey.sh)
HUNGRY_REQUIRED_MB = 450  # memoria que el gestor de LG libera antes de abrirlas (por defecto, 120)
TUNE_MEMORY_DELAY = 45  # s tras arrancar el vigilante: que el arranque de la tele se asiente antes
# Nunca se cierran: el menú (Home) y los ayudantes de la TDT que LG mantiene vivos a propósito.
NEVER_CLOSE = {"com.webos.app.home", "com.webos.app.livehbbtv", "com.webos.app.livedmost",
               "com.webos.app.liveibb"}
# Precargas de LG: el preloadmanager abre en segundo plano las apps de esta lista en cuanto hay
# memoria, y LG la va ampliando según el uso (Netflix, YouTube, Prime, las entradas HDMI...). Si se
# aplicó tools/tv-tune.sh (existe TUNE_ORIG), cada arranque se deja otra vez en PRELOAD_KEEP.
PRELOAD_CONF = "/var/preferences/webos-preload-manager-conf.json"
PRELOAD_KEEP = {"com.webos.app.home": True, "com.webos.app.livetv": True}
TUNE_ORIG = "/var/lib/webosbrew/tvmenu-tune.orig"
KEYFILTERS = "com.webos.surfacemanager.keyFilters"
KEYFILTERS_ORIG = "/var/lib/webosbrew/tvmenu-keyfilters.orig.json"
KEYFILTER_STAMP = "/tmp/tvmenu-keyfilter.stamp"  # versión de keyfilter.js ya cargada (se borra al reiniciar)
KEYFILTER = {"file": os.path.join(os.path.dirname(os.path.abspath(__file__)), "keyfilter.js"),
             "handler": "handleTvmenuInputKey"}
AS_HOME = os.path.join(os.path.dirname(os.path.abspath(__file__)), "as-home.sh")
HOME_DIR = "/usr/palm/applications/com.webos.app.home"
HTTP_PORT = 45710
TOKEN_FILE = "/var/lib/webosbrew/tvmenu-token"  # clave del servidor HTTP (la crea token.sh)
MAX_BODY = 65536         # bytes de un cuerpo JSON (las preferencias ocupan ~2 KB)
MAX_ICON = 2 * 1024 * 1024
SOUND_OUTPUTS = ("tv_speaker", "external_optical", "external_arc", "bt_soundbar")
ICON_ROOTS = ("/usr/palm/applications/", "/media/cryptofs/apps/", "/media/system/apps/",
              "/media/developer/apps/", "/mnt/otncabi/")
ICON_TYPES = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp",
              ".svg": "image/svg+xml"}


def log(msg):
    print("[%s] %s" % (time.strftime("%H:%M:%S"), msg), flush=True)


def power_log(msg):
    log(msg)
    try:
        if os.path.exists(POWER_LOG) and os.path.getsize(POWER_LOG) > 50000:
            os.remove(POWER_LOG)
        with open(POWER_LOG, "a") as f:
            f.write("%s %s\n" % (time.strftime("%Y-%m-%d %H:%M:%S"), msg))
    except OSError:
        pass


def menu_is_home():
    return not os.path.exists(LG_HOME_FLAG)


def menu_saver_on():
    return not os.path.exists(SAVER_OFF_FLAG)


def menu_replaces_home():
    with open("/proc/mounts") as f:
        return " %s " % HOME_DIR in f.read()


def run_as_home(*args):
    # El menú espera la respuesta HTTP: dársela antes de reiniciar SAM (que lo cierra).
    time.sleep(1)
    subprocess.run(["sh", AS_HOME, *args], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    set_required_memory()  # as-home.sh reinicia memchute, que olvida lo que se le había pedido


# luna-send solo escribe la respuesta si tiene un terminal. Se le da uno propio (un pty) y se ejecuta
# directamente, con sus argumentos en una lista: sin "script" ni intérprete de órdenes por medio (dos
# procesos menos por llamada y por suscripción, y ningún texto que escapar). Si así no respondiera en
# algún firmware, se vuelve a "script" (LUNA_MODE lo recuerda; ver luna()).
LUNA_MODE = [None]  # "pty", "script" o None (aún sin probar)


def spawn_luna(args, mode):
    if mode == "script":
        # Cada argumento entre comillas simples (y las suyas escapadas): la shell no interpreta nada.
        cmd = " ".join("'%s'" % a.replace("'", "'\\''") for a in ["luna-send", *args])
        proc = subprocess.Popen(["script", "-qc", cmd, "/dev/null"], stdout=subprocess.PIPE,
                                stderr=subprocess.DEVNULL)
        return proc, proc.stdout.fileno()
    master, slave = os.openpty()
    try:
        proc = subprocess.Popen(["luna-send", *args], stdin=slave, stdout=slave, stderr=slave,
                                start_new_session=True)
    finally:
        os.close(slave)
    proc.master = master  # se cierra en close_luna
    return proc, master


def close_luna(proc):
    if proc.poll() is None:
        proc.kill()
    proc.wait()
    if proc.stdout:
        proc.stdout.close()
    else:
        os.close(proc.master)


# Lee de fd lo que llegue hasta que el proceso termine (fin de fichero; en un pty, error de E/S).
def read_chunks(fd, timeout=None):
    end = None if timeout is None else time.monotonic() + timeout
    while True:
        left = None if end is None else end - time.monotonic()
        if left is not None and (left <= 0 or not select.select([fd], [], [], left)[0]):
            raise TimeoutError
        try:
            data = os.read(fd, 65536)
        except OSError:
            return
        if not data:
            return
        yield data


def luna_once(uri, payload, mode):
    proc, fd = spawn_luna(["-n", "1", "-w", "5000", uri, json.dumps(payload)], mode)
    try:
        out = b"".join(read_chunks(fd, 10))
    finally:
        close_luna(proc)
    return json.loads(out.decode(errors="replace").strip() or "{}")


def luna(uri, payload):
    # Sin modo elegido aún se prueban los dos: el primero que dé una respuesta queda elegido.
    for mode in ([LUNA_MODE[0]] if LUNA_MODE[0] else ["pty", "script"]):
        try:
            res = luna_once(uri, payload, mode)
        except TimeoutError:  # si no, la excepción mataría en silencio el hilo que llama
            log("luna-send sin respuesta: %s" % uri)
            res = {}
        except (ValueError, OSError):
            res = {}
        if not isinstance(res, dict):
            res = {}
        if res and not LUNA_MODE[0]:
            LUNA_MODE[0] = mode
            log("luna-send: modo %s" % mode)
        if res:
            break
    return res


def set_general(values):
    res = luna("luna://com.webos.settingsservice/setSystemSettings", {"category": "general", "settings": values})
    return bool(res.get("returnValue"))


def ours(keyfilter):
    return keyfilter.get("handler") == KEYFILTER["handler"]


# Pone o quita keyfilter.js al principio de los filtros de teclas del gestor de ventanas.
keyfilter_on = [False]


def set_keyfilter(on):
    res = luna("luna://com.webos.service.config/getConfigs", {"configNames": [KEYFILTERS]})
    current = res.get("configs", {}).get(KEYFILTERS)
    if not isinstance(current, list):
        log("filtro de teclas: no se pudo leer la lista (%s)" % res)
        return
    if not os.path.exists(KEYFILTERS_ORIG):
        with open(KEYFILTERS_ORIG, "w") as f:
            json.dump([k for k in current if not ours(k)], f)
    # Se reconoce por su función y no por su ruta: así sale también el de una carpeta anterior.
    wanted = [k for k in current if not ours(k)]
    stamp = ""
    if on and os.path.exists(KEYFILTER["file"]):
        st = os.stat(KEYFILTER["file"])
        stamp = "%d-%d" % (st.st_mtime, st.st_size)
        try:
            with open(KEYFILTER_STAMP) as f:
                loaded = f.read()
        except OSError:
            loaded = ""
        # Cada cambio de la lista hace que LG rehaga todos sus filtros de teclas: si ya está puesto,
        # solo se quita y se vuelve a poner cuando keyfilter.js ha cambiado (actualización del menú).
        if wanted != current and loaded != stamp:
            luna("luna://com.webos.service.config/setConfigs", {"configs": {KEYFILTERS: wanted}})
            time.sleep(1)
            current = wanted
        wanted = [KEYFILTER] + wanted
    if wanted != current:
        res = luna("luna://com.webos.service.config/setConfigs", {"configs": {KEYFILTERS: wanted}})
        if not res.get("returnValue"):
            log("filtro de teclas: error al cambiar la lista (%s)" % res)
            return
    keyfilter_on[0] = bool(wanted) and wanted[0] == KEYFILTER
    if keyfilter_on[0]:
        with open(KEYFILTER_STAMP, "w") as f:
            f.write(stamp)
    log("filtro de teclas del botón de fuentes: %s" % ("puesto" if keyfilter_on[0] else "quitado"))


# Deshace lo que forzaban versiones anteriores (Home automático apagado y el menú como última
# entrada), solo si aún está así: el resto del tiempo esos ajustes son cosa de LG.
def restore_lg_boot():
    orig = {"homeAutoLaunch": "on", "lastInputApp": "com.webos.app.livetv"}
    try:
        with open(BOOT_ORIG) as f:
            orig.update(json.load(f))
    except (OSError, ValueError):
        pass
    res = luna("luna://com.webos.settingsservice/getSystemSettings",
               {"category": "general", "keys": ["homeAutoLaunch", "lastInputApp"]})
    now = res.get("settings", {})
    fix = {}
    if now.get("homeAutoLaunch") == "off":
        fix["homeAutoLaunch"] = orig["homeAutoLaunch"]
    if now.get("lastInputApp") in (APP, "com.webos.app.home"):
        fix["lastInputApp"] = orig["lastInputApp"]
    if fix:
        ok = set_general(fix)
        power_log("ajustes de arranque de LG restaurados %s: %s" % (fix, "ok" if ok else "ERROR"))


def boot_into_menu():
    set_keyfilter(True)
    restore_lg_boot()


def boot_into_lg():
    set_keyfilter(False)
    restore_lg_boot()


def in_background(fn):
    threading.Thread(target=fn, daemon=True).start()


subscriptions = []  # procesos luna-send -i abiertos; se cierran con el vigilante (ver stop())


def stop(*_):
    for proc in list(subscriptions):
        proc.terminate()
    sys.exit(0)


# Mantiene abierta una suscripción luna-send y llama a on_message con cada respuesta JSON.
def subscribe(uri, payload, on_message):
    while True:
        if not LUNA_MODE[0]:  # una llamada cualquiera decide cómo hay que ejecutar luna-send
            luna("luna://com.webos.applicationManager/getForegroundAppInfo", {})
        proc, fd = spawn_luna(["-i", uri, json.dumps(payload)], LUNA_MODE[0] or "script")
        subscriptions.append(proc)
        buf = ""  # algunos servicios responden con JSON en varias líneas
        for chunk in read_chunks(fd):
            buf += chunk.decode(errors="replace")
            # Varias respuestas pueden llegar juntas: se van sacando de una en una.
            while buf.strip():
                try:
                    message, end = json.JSONDecoder().raw_decode(buf.lstrip())
                except ValueError:
                    if len(buf) > 65536:
                        buf = ""
                    break
                buf = buf.lstrip()[end:]
                try:
                    on_message(message)
                except Exception as e:
                    log("error en suscripción %s: %s" % (uri, e))
        close_luna(proc)
        subscriptions.remove(proc)
        time.sleep(5)


# Anota los cambios de energía (encendido, reposo, salvapantallas...) en POWER_LOG, que se conserva
# entre reinicios: sirve para relacionar fallos con encendidos.
def watch_power():
    last = ["Active"]

    def on_state(data):
        state = data.get("state")
        if not state or state == last[0]:
            return
        power_log("energía: %s -> %s" % (last[0], state))
        last[0] = state

    subscribe("luna://com.webos.service.tvpower/power/getPowerState", {"subscribe": True}, on_state)


# Clave del servidor HTTP. Sin ella (falta el fichero) se rechaza todo: mejor un menú sin ajustes que
# un servidor de root abierto a cualquier página.
def load_token():
    try:
        with open(TOKEN_FILE) as f:
            token = f.read().strip()
    except OSError:
        token = ""
    if len(token) < 16:
        log("sin clave para el servidor HTTP (%s): se rechazarán todas las peticiones" % TOKEN_FILE)
        return ""
    return token


TOKEN = [""]

# Preferencias del menú en memoria (el menú las pide cada vez que se vuelve a él).
prefs_cache = [None]


def load_prefs():
    if prefs_cache[0] is None:
        try:
            with open(PREFS) as f:
                prefs = json.load(f)
        except (OSError, ValueError):
            prefs = {}
        prefs_cache[0] = prefs if isinstance(prefs, dict) else {}
    return prefs_cache[0]


# Lo único que guarda el menú: {"settings": {nombre: valor simple}, "order": [[clave, ...], ...] o null}.
def valid_prefs(prefs):
    if not isinstance(prefs, dict) or "settings" not in prefs or not set(prefs) <= {"settings", "order"}:
        return False
    settings = prefs.get("settings", {})
    if not isinstance(settings, dict) or len(settings) > 32:
        return False
    if not all(isinstance(v, (bool, int, float, str)) and len(str(v)) <= 64 for v in settings.values()):
        return False
    order = prefs.get("order")
    if order is None:
        return True
    return (isinstance(order, list) and len(order) <= 16
            and all(isinstance(row, list) and all(isinstance(k, str) for k in row) for row in order))


class Handler(BaseHTTPRequestHandler):
    timeout = 10  # s: una conexión que no termina de mandar su petición no deja un hilo colgado

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")  # la app web se sirve desde file://
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.send_body(data)

    # El menú cancela las peticiones que tardan (1,5 s): escribir entonces daría BrokenPipeError.
    def send_body(self, data):
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    # Separa la ruta de sus parámetros y comprueba la clave; False (y 403 ya enviado) si no es válida.
    def authorized(self):
        url = urllib.parse.urlsplit(self.path)
        self.route = url.path
        self.query = urllib.parse.parse_qs(url.query)
        given = self.query.get("t", [""])[0]
        if TOKEN[0] and given == TOKEN[0]:
            return True
        self.reply(403, {"error": "clave no válida"})
        return False

    # Cuerpo JSON de la petición ({} si no trae); None si es demasiado grande o no es JSON.
    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if not 0 <= length <= MAX_BODY:
            return None
        try:
            return json.loads(self.rfile.read(length) or b"{}")
        except ValueError:
            return None

    def do_GET(self):
        if not self.authorized():
            return
        if self.route == "/status":
            self.reply(200, {"menuIsHome": menu_is_home()})
        elif self.route == "/prefs":
            self.reply(200, load_prefs())
        elif self.route == "/control/state":
            self.reply(200, {"open": control["open"]})
        elif self.route == "/control":
            app = foreground[0] or luna("luna://com.webos.applicationManager/getForegroundAppInfo", {}).get("appId", "")
            self.reply(200, {"foreground": app, "settings": load_prefs().get("settings", {})})
        elif self.route == "/icon":
            self.send_icon(self.query.get("path", [""])[0])
        else:
            self.reply(404, {"error": "not found"})

    def send_icon(self, path):
        real = os.path.realpath(path)
        kind = ICON_TYPES.get(os.path.splitext(real)[1].lower())
        try:
            ok = kind and real.startswith(ICON_ROOTS) and os.path.isfile(real) and os.path.getsize(real) <= MAX_ICON
            if ok:
                with open(real, "rb") as f:
                    data = f.read(MAX_ICON)
        except OSError:
            ok = False
        if not ok:
            self.reply(404, {"error": "not found"})
            return
        self.send_response(200)
        self.send_header("Content-Type", kind)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Access-Control-Allow-Origin", "*")  # el menú lee el color del icono (canvas)
        self.send_header("Cache-Control", "max-age=86400")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.send_body(data)

    def do_POST(self):
        if not self.authorized():
            return
        body = self.read_json()
        if body is None:
            self.reply(400, {"error": "JSON no válido"})
            return
        # Los ajustes de arranque y el cambio de Home van en segundo plano: luna-send tarda, SAM se
        # reinicia y el menú espera poco.
        if self.route == "/home/lg":
            open(LG_HOME_FLAG, "w").close()
            in_background(boot_into_lg)
            in_background(lambda: run_as_home("off"))
        elif self.route == "/home/menu":
            if os.path.exists(LG_HOME_FLAG):
                os.remove(LG_HOME_FLAG)
            in_background(boot_into_menu)
            in_background(run_as_home)
        elif self.route == "/prefs":
            if not valid_prefs(body):
                self.reply(400, {"error": "preferencias no válidas"})
                return
            with open(PREFS + ".tmp", "w") as f:  # escritura atómica
                json.dump(body, f)
            os.replace(PREFS + ".tmp", PREFS)
            prefs_cache[0] = body
            self.reply(200, {"saved": True})
            return
        elif self.route.startswith("/control/"):
            self.control(self.route[len("/control/"):], body if isinstance(body, dict) else {})
            return
        elif self.route in ("/saver/on", "/saver/off"):
            on = self.route == "/saver/on"
            if on and os.path.exists(SAVER_OFF_FLAG):
                os.remove(SAVER_OFF_FLAG)
            elif not on:
                open(SAVER_OFF_FLAG, "w").close()
            self.reply(200, {"saver": menu_saver_on()})
            return
        else:
            self.reply(404, {"error": "not found"})
            return
        log("la tecla Home abre %s" % ("el menú" if menu_is_home() else "el inicio de LG"))
        self.reply(200, {"menuIsHome": menu_is_home()})

    def control(self, action, body):
        if action == "key":  # pruebas: lo mismo que el botón de fuentes
            luna("luna://com.webos.service.systemUIManager/launch", {"appId": PICKER})
            in_background(on_input_key)
            self.reply(200, {})
            return
        if action == "state":
            control["open"] = bool(body.get("open"))
            self.reply(200, {"open": control["open"]})
            return
        if action == "sound" and body.get("output") in SOUND_OUTPUTS:
            res = luna("luna://com.webos.service.apiadapter/audio/changeSoundOutput", {"output": body["output"]})
        elif action == "screenoff":
            res = luna("luna://com.webos.service.tvpower/power/turnOffScreen", {})
        elif action == "power":
            res = luna("luna://com.webos.service.tvpower/power/powerOff", {"reason": "remoteKey"})
        else:
            self.reply(400, {"error": "acción no válida"})
            return
        self.reply(200, {"ok": bool(res.get("returnValue"))})

    def log_message(self, *args):
        pass


def serve_http():
    TOKEN[0] = load_token()
    server = ThreadingHTTPServer(("127.0.0.1", HTTP_PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()


def launch():
    luna("luna://com.webos.applicationManager/launch", {"id": APP})


# PIDs de un servicio por su nombre (el de los servicios node es su primer argumento).
def service_pids(name):
    pids = []
    for pid in os.listdir("/proc"):
        if pid.isdigit():
            try:
                with open("/proc/%s/cmdline" % pid, "rb") as f:
                    if f.read().split(b"\0")[0].decode(errors="replace") == name:
                        pids.append(int(pid))
            except OSError:
                pass
    return pids


# El gestor de memoria de LG (memchute) reinicia la app de delante cuando se queda sin memoria, salvo
# a las apps de su lista EFS: a esas antes les pasa a la flash lo que tiene comprimido en el swap
# (probado: Stremio aguantó con 87 MB libres). La lista está en la configuración del sistema
# (com.webos.memorymanager.EfsTarget, no se guarda: vuelve la de LG en cada arranque) y memchute solo
# la lee al arrancar, así que se amplía y se reinicia memchute (el swap no depende de él). Además se
# le pide que libere HUNGRY_REQUIRED_MB al abrirlas (también se pierde si memchute se reinicia).
def tune_memory():
    time.sleep(TUNE_MEMORY_DELAY)
    key = "com.webos.memorymanager.EfsTarget"
    targets = luna("luna://com.webos.service.config/getConfigs", {"configNames": [key]}).get("configs", {}).get(key)
    if not isinstance(targets, list):
        log("memoria: no se pudo leer la lista EFS")
        return
    missing = [app for app in sorted(HUNGRY_APPS) if app not in targets]
    if missing:
        luna("luna://com.webos.service.config/setConfigs", {"configs": {key: targets + missing}})
    seen = luna("luna://com.webos.memorymanager/getConfigs", {}).get("EfsTarget") or []
    if any(app not in seen for app in HUNGRY_APPS):
        subprocess.run(["systemctl", "restart", "memchute"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        time.sleep(3)
        seen = luna("luna://com.webos.memorymanager/getConfigs", {}).get("EfsTarget") or []
    set_required_memory()
    trim_preloads()
    ok = all(app in seen for app in HUNGRY_APPS)
    log("memoria: %s en la lista EFS de LG: %s" % (", ".join(sorted(HUNGRY_APPS)), "sí" if ok else "NO"))


# Devuelve la lista de precarga a la corta (solo el menú y la TDT) si LG la ha ampliado, y cierra las
# apps que había precargado por ella (salvo la que se esté viendo). Solo al arrancar el vigilante:
# LG reinicia la tele cada noche en reposo, así que se aplica a diario sin molestar mientras se usa.
def trim_preloads():
    if not os.path.isdir(TUNE_ORIG):
        return
    try:
        with open(PRELOAD_CONF) as f:
            conf = json.load(f)
    except (OSError, ValueError):
        return
    allowed = conf.get("allowedApps") if isinstance(conf, dict) else None
    if not isinstance(allowed, dict) or allowed == PRELOAD_KEEP:
        return
    extra = [app for app in allowed if app not in PRELOAD_KEEP]
    conf["allowedApps"] = dict(PRELOAD_KEEP)
    with open(PRELOAD_CONF + ".tmp", "w") as f:
        json.dump(conf, f)
    os.replace(PRELOAD_CONF + ".tmp", PRELOAD_CONF)
    subprocess.run(["systemctl", "restart", "preload-manager"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    fg = foreground[0] or luna("luna://com.webos.applicationManager/getForegroundAppInfo", {}).get("appId", "")
    running = {a.get("id") for a in luna("luna://com.webos.applicationManager/running", {}).get("running", [])}
    closed = [app for app in extra if app in running and app != fg
              and luna("luna://com.webos.applicationManager/closeByAppId", {"id": app}).get("returnValue")]
    log("precargas de LG recortadas (quitadas: %s; cerradas: %s)" % (", ".join(extra), ", ".join(closed) or "ninguna"))


def set_required_memory():
    for app in HUNGRY_APPS:
        luna("luna://com.webos.memorymanager/setRequiredMemory", {"appId": app, "requiredMemory": HUNGRY_REQUIRED_MB})


# Caja negra (solo si existe BLACKBOX_FLAG): los registros de la tele (/var/log) están en la RAM,
# rotan cada pocos minutos y se borran al reiniciar. Para poder ver qué pasó en un fallo, los trozos
# ya rotados se copian a la flash (y una copia del registro de este vigilante), conservando los
# últimos LOG_ARCHIVE_KEEP. Es opcional porque escribe en la flash sin parar (~100 MB al día).
def archive_logs():
    copied = {}
    while True:
        try:
            if os.path.exists(BLACKBOX_FLAG):
                archive_once(copied)
        except Exception as e:
            log("error guardando registros: %s" % e)
        time.sleep(120)


def archive_once(copied):
    os.makedirs(LOG_ARCHIVE, exist_ok=True)
    for src in ("/var/log/legacy-log.0.gz", "/var/log/messages.0.gz", WATCHER_LOG):
        try:
            st = os.stat(src)
        except OSError:
            continue
        version = (st.st_mtime, st.st_size)
        if copied.get(src) == version:  # sin cambios: no se vuelve a escribir en la flash
            continue
        copied[src] = version
        if src == WATCHER_LOG:
            shutil.copyfile(src, os.path.join(LOG_ARCHIVE, "vigilante.log"))
            continue
        stamp = time.strftime("%m%d-%H%M%S", time.localtime(st.st_mtime))
        dst = os.path.join(LOG_ARCHIVE, "%s-%s" % (stamp, os.path.basename(src)))
        if not os.path.exists(dst):
            shutil.copyfile(src, dst)
    rotated = sorted(f for f in os.listdir(LOG_ARCHIVE) if f.endswith(".gz"))
    for old in rotated[:-LOG_ARCHIVE_KEEP]:
        os.remove(os.path.join(LOG_ARCHIVE, old))


# Cierra las apps de segundo plano para dejarle memoria a `app` (una de HUNGRY_APPS).
def free_memory_for(app):
    running = luna("luna://com.webos.applicationManager/running", {}).get("running", [])
    closed = []
    for other in [a.get("id") for a in running]:
        if other and other != app and other not in NEVER_CLOSE:
            if luna("luna://com.webos.applicationManager/closeByAppId", {"id": other}).get("returnValue"):
                closed.append(other)
    if closed:
        log("memoria para %s: cerradas %s" % (app, ", ".join(closed)))


# Al cambiar la app de delante: dejar sitio a las apps que más memoria necesitan y, de vuelta en el
# menú, volver a cargar oculto el centro de control (cerrado para ellas o por el gestor de LG).
foreground = [""]  # app de delante, al día por la suscripción de watch_foreground


def watch_foreground():
    def on_foreground(data):
        app = data.get("appId")
        if not app or app == foreground[0]:
            return
        foreground[0] = app
        if app in HUNGRY_APPS:
            in_background(lambda: free_memory_for(app))
        elif app == "com.webos.app.home" and menu_is_home():
            in_background(preload_control)

    subscribe("luna://com.webos.applicationManager/getForegroundAppInfo", {"subscribe": True}, on_foreground)


def preload_control():
    running = luna("luna://com.webos.applicationManager/running", {}).get("running", [])
    if CONTROL_APP not in [a.get("id") for a in running]:
        launch_control("preload")


def watch_heavy_services():
    last_seen = {}  # app -> momento en que estaba delante por última vez
    while True:
        time.sleep(60)
        try:
            fg = foreground[0]
            now = time.monotonic()
            for app, service in HEAVY_SERVICES.items():
                if app == fg or app not in last_seen:
                    last_seen[app] = now
                    continue
                pids = service_pids(service)
                if not pids or now - last_seen[app] < IDLE_CLOSE_S:
                    continue
                luna("luna://com.webos.applicationManager/closeByAppId", {"id": app})
                for pid in pids:
                    os.kill(pid, signal.SIGTERM)
                log("memoria: %s sin usar %d min, cerrada con su servicio" % (app, IDLE_CLOSE_S // 60))
        except Exception as e:
            log("error vigilando servicios pesados: %s" % e)


# Estado del centro de control: si el panel está abierto (lo avisa él), si se espera a que se vaya el
# selector de LG para abrirlo, y cuándo se pulsó el botón.
control = {"open": False, "pressed": 0.0, "waiting": False, "picker_seen": False}
control_lock = threading.Lock()


def launch_control(action):
    luna("luna://com.webos.applicationManager/launch", {"id": CONTROL_APP, "params": {"action": action}})


def close_picker():
    luna("luna://com.webos.service.systemUIManager/closeByAppId", {"appId": PICKER})


# Botón de fuentes. LG abre a la vez su selector de entradas y, mientras se ve, webOS oculta el panel
# (una sola capa a la vez) y luego tarda ~0,8 s en volver a mostrarlo. Por eso el panel no se abre
# todavía: al selector se le pide ya que se cierre (la petición espera en su cola y se ejecuta en
# cuanto termina de cargar) y el panel se abre cuando el selector se ha ido (o si no llega a salir).
def on_input_key():
    if keyfilter_on[0]:
        # Lo atiende keyfilter.js en el gestor de ventanas y el selector de LG no debería salir; si
        # sale, el filtro no funciona y watch_picker hace lo de siempre (cerrarlo y abrir el panel).
        with control_lock:
            control["pressed"] = time.monotonic()
            control["picker_seen"] = False
            control["waiting"] = not control["open"]
        return
    with control_lock:
        control["pressed"] = time.monotonic()
        control["picker_seen"] = False
        control["waiting"] = not control["open"]
        closing = control["open"]
    if closing:
        launch_control("close")
    close_picker()
    time.sleep(PICKER_TIMEOUT)
    with control_lock:
        late = control["waiting"] and not control["picker_seen"]
        if late:
            control["waiting"] = False
    if late:
        launch_control("open")


def watch_picker():
    def on_foreground(data):
        apps = [a.get("appId") for a in data.get("foregroundAppInfo", [])]
        with control_lock:
            # Cualquier capa del sistema (ajustes rápidos, selector...) oculta el panel sin que su
            # página se entere: se apunta aquí para que el botón de fuentes lo vuelva a abrir.
            if apps and control["open"]:
                control["open"] = False
            if time.monotonic() - control["pressed"] > PICKER_WINDOW:
                return
            if PICKER in apps:
                first = not control["picker_seen"]
                control["picker_seen"] = True
            elif control["picker_seen"] and control["waiting"]:
                control["waiting"] = False
                first = None  # el selector se ha ido: abrir el panel
            else:
                return
        if first is None:
            launch_control("open")
        elif first:
            if keyfilter_on[0]:
                log("el selector de LG ha salido con el filtro de teclas puesto: el filtro no funciona")
            close_picker()  # por si la petición de antes llegó tarde (o no hay filtro)

    subscribe("luna://com.webos.service.systemUIManager/getForegroundAppInfo", {"subscribe": True}, on_foreground)


devices = {}  # fd -> ruta


def scan():
    known = set(devices.values())
    for name in os.listdir("/dev/input"):
        path = "/dev/input/" + name
        if name.startswith("event") and path not in known:
            try:
                devices[os.open(path, os.O_RDONLY | os.O_NONBLOCK)] = path
            except OSError:
                pass


def main():
    signal.signal(signal.SIGTERM, stop)  # homekey.sh lo reinicia con kill
    log("vigilando la tecla Home (%d)" % HOME_CODE)
    try:
        serve_http()
    except OSError as e:
        log("sin servidor HTTP (%s): el menú no podrá cambiar el ajuste" % e)
    if menu_is_home():
        in_background(boot_into_menu)
    in_background(watch_power)
    in_background(watch_picker)
    in_background(watch_heavy_services)
    in_background(watch_foreground)
    in_background(tune_memory)
    in_background(archive_logs)
    pending = []
    last_scan = 0.0
    while True:
        now = time.monotonic()
        if now - last_scan >= RESCAN:
            scan()
            last_scan = now
        timeout = RESCAN if not pending else max(0.0, min(pending) - now)
        ready, _, _ = select.select(list(devices), [], [], timeout)

        for fd in ready:
            try:
                data = os.read(fd, EVENT.size * 64)
            except OSError:  # el dispositivo ha desaparecido
                os.close(fd)
                del devices[fd]
                continue
            for _, _, kind, code, value in EVENT.iter_unpack(data[:len(data) - len(data) % EVENT.size]):
                if kind != EV_KEY or value != 1:
                    continue
                if DEBUG:
                    log("tecla %d en %s" % (code, devices[fd]))
                if code == INPUT_CODE and menu_is_home():
                    in_background(on_input_key)
                    continue
                if code == HOME_CODE:
                    if not menu_is_home():
                        log("Home pulsado (se deja al inicio de LG)")
                        continue
                    if menu_replaces_home():
                        continue  # webOS abre él mismo el menú como su Home
                    log("Home pulsado")
                    pressed = time.monotonic()
                    pending = [pressed + d for d in DELAYS]

        now = time.monotonic()
        if pending and min(pending) <= now:
            pending = [p for p in pending if p > now]
            try:
                launch()
                log("menú lanzado")
            except Exception as e:
                log("error al lanzar: %s" % e)


if __name__ == "__main__":
    main()
