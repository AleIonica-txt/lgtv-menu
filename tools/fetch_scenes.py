# Descarga los paisajes del menú desde Wikimedia Commons (fotos destacadas, licencia libre) y los
# prepara en app/scenes/: la foto a 1920x1080, una copia desenfocada y clara (el "cristal" con que se
# rellena la hora) y el recorte de su relieve sin el cielo, que se dibuja por delante de la hora.
# También genera app/js/scenes.js: dónde va la hora en cada foto, el lugar, el autor y la licencia.
# Las fotos no van en el repositorio (sus licencias piden citar al autor): cada cual las descarga.
# Uso: python3 -I tools/fetch_scenes.py [carpeta para las comprobaciones]
#   Para cambiar la selección, edita SCENES. Con una carpeta, deja ahí <id>-check.jpg: el recorte
#   sobre magenta y la zona de la hora, para ver de un vistazo si el relieve está bien cortado.
import html
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageFilter, ImageStat

W, H = 1920, 1080
# Cada paisaje: momento del día (night, dawn, day, grey = día cubierto, golden = atardecer), fichero
# en Commons, lugar que se muestra y pistas para encontrar su horizonte: "from" es la altura (parte
# del alto) desde la que se busca hacia abajo, por encima solo hay cielo; "jump" es cuánto tiene que
# cambiar el color respecto al cielo de encima para que deje de ser cielo (más bajo = más sensible);
# "blur" suaviza más la copia en la que se busca (para que las estrellas no cuenten como relieve).
SCENES = [
    ("night1", "night", "File:Milky Way over the valley of Marukha River, Arkhyz, Russiа.jpg", "Valle del Marukha, Cáucaso", {"from": 0.62, "jump": 50, "blur": 5}),
    ("night2", "night", "File:018 Human looking at the stars during Perseids with the Milky Way in the background Photo by Giles Laurent.jpg", "Perseidas y Vía Láctea, Suiza", {"from": 0.30, "jump": 70, "blur": 4}),
    ("dawn1", "dawn", "File:Lake Sylvester during the sunrise, Kahurangi, New Zealand.jpg", "Lago Sylvester, Nueva Zelanda", {"from": 0.30, "jump": 26}),
    ("dawn2", "dawn", "File:Sunrise in Pieniny, Poland 02.jpg", "Amanecer en Pieniny, Polonia", {"from": 0.42, "jump": 30}),
    ("day1", "day", "File:View of Kaikoura Ranges, New Zealand.jpg", "Montes Kaikoura, Nueva Zelanda", {"from": 0.20, "jump": 40}),
    ("day2", "day", "File:Mount Lorette panorama.jpg", "Monte Lorette, Canadá", {"from": 0.14, "jump": 60}),
    ("grey1", "grey", "File:Upper Salmon River6.jpg", "Río Upper Salmon, Canadá", {"from": 0.25, "jump": 34}),
    ("grey2", "grey", "File:Forested hills in Lysekil in fog - B&W.jpg", "Colinas de Lysekil, Suecia", {"from": 0.15, "jump": 26}),
    ("golden1", "golden", "File:Schenna (IT), Abenddämmerung -- 2026 -- 4135.jpg", "Anochecer en Schenna, Tirol del Sur", {"from": 0.60, "jump": 40}),
    ("golden2", "golden", "File:Taal Volcano eruption on January 12, 2020.jpg", "Lago Taal, Filipinas", {"from": 0.50, "jump": 40}),
]

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
API = "https://commons.wikimedia.org/w/api.php?"
UA = {"User-Agent": "tvmenu/1.0 (fondos para el menu de una tele; uso personal)"}


# Commons limita el ritmo de peticiones: pausa entre llamadas y, si responde 429, esperar y reintentar.
def get(url):
    for attempt in range(6):
        time.sleep(1)
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90).read()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            time.sleep(int(e.headers.get("Retry-After") or 0) or 10 * 2 ** attempt)
    raise RuntimeError("Commons sigue rechazando las peticiones: " + url)


def image_info(titles):
    query = urllib.parse.urlencode({"action": "query", "titles": "|".join(titles), "prop": "imageinfo",
                                    "iiprop": "url|size|extmetadata", "iiurlwidth": 1920, "format": "json"})
    res = json.loads(get(API + query))
    normalized = {n["from"]: n["to"] for n in res["query"].get("normalized", [])}
    by_title = {p["title"]: p for p in res["query"]["pages"].values()}
    return {t: by_title.get(normalized.get(t, t)) for t in titles}


def clean(text):
    return html.unescape(re.sub(r"<[^>]+>", "", text or "")).strip()


def to_16_9(image):
    w, h = image.size
    if w / h > 16 / 9:
        new_w = int(h * 16 / 9)
        image = image.crop(((w - new_w) // 2, 0, (w + new_w) // 2, h))
    else:
        new_h = int(w * 9 / 16)
        image = image.crop((0, (h - new_h) // 2, w, (h + new_h) // 2))
    return image.resize((W, H), Image.LANCZOS)


# Horizonte: en una copia pequeña y suavizada, cada columna se recorre hacia abajo desde "from";
# mientras el color se parezca al del cielo de encima (que se va siguiendo: un cielo degradado sigue
# siendo cielo), es cielo. El primer cambio brusco que se mantiene tres filas es el relieve.
# Devuelve la fila del horizonte (en px de 1080) para cada columna de 1920.
def skyline(photo, hint):
    sw, sh = 480, 270
    small = photo.resize((sw, sh), Image.LANCZOS).filter(ImageFilter.GaussianBlur(hint.get("blur", 2)))
    px = small.load()
    start = int(sh * hint["from"])
    jump = hint["jump"]
    rows = []
    for x in range(sw):
        ref = [sum(px[x, y][c] for y in range(max(0, start - 6), start + 1)) / (start + 1 - max(0, start - 6)) for c in range(3)]
        found, run = sh, 0
        for y in range(start, sh):
            p = px[x, y]
            dist = abs(p[0] - ref[0]) + abs(p[1] - ref[1]) + abs(p[2] - ref[2])
            if dist > jump:
                run += 1
                if run == 3:
                    found = y - 2
                    break
            else:
                run = 0
                ref = [ref[c] * 0.85 + p[c] * 0.15 for c in range(3)]
        rows.append(found)
    # Columnas sin horizonte (relieve tan oscuro como el cielo): el de la columna válida más cercana.
    valid = [x for x in range(sw) if rows[x] < sh - 2]
    if valid:
        rows = [rows[x] if rows[x] < sh - 2 else rows[min(valid, key=lambda v: abs(v - x))] for x in range(sw)]
    # Mediana de 7 columnas (quita picos sueltos) y vuelta al tamaño real.
    smooth = [sorted(rows[max(0, x - 3):x + 4])[len(rows[max(0, x - 3):x + 4]) // 2] for x in range(sw)]
    return [smooth[min(sw - 1, x * sw // W)] * H / sh for x in range(W)]


def cutout(photo, line):
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon([(0, H)] + [(x, line[x]) for x in range(0, W, 4)] + [(W - 1, line[W - 1]), (W, H)], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(1.5))
    fg = photo.convert("RGBA")
    fg.putalpha(mask)
    return fg


# Dónde va la hora: centrada o a la izquierda, donde haya más cielo, con el pie de los dígitos
# hundido un poco detrás del punto más alto del relieve en esa zona; si hay poco cielo, la hora se
# hace más pequeña para que quepa entera. La línea base de los dígitos es top + 0,92·size.
def place_clock(photo, line):
    def high(xs):  # el relieve más alto de la zona (sin contar picos sueltos)
        return sorted(xs)[len(xs) // 10]
    spots = {"center": high(line[520:1400]), "left": high(line[96:1000])}
    side = max(spots, key=spots.get)
    hi = spots[side]
    size = int(max(220, min(400, (hi - 118) / 0.77)))
    top = int(max(118, min(hi - 0.77 * size, 420)))
    x0 = 110 if side == "left" else 560
    box = photo.crop((x0, top, x0 + 800, min(H, int(top + 0.9 * size))))
    dark = ImageStat.Stat(box.convert("L")).mean[0] > 150  # cielo claro: hora oscura
    out = {"top": top, "size": size, "dark": dark}
    if side == "left":
        out["left"] = 96
    return out


def main():
    check = sys.argv[1] if len(sys.argv) > 1 else None
    out = os.path.join(ROOT, "scenes")
    os.makedirs(out, exist_ok=True)
    infos = image_info([title for _, _, title, _, _ in SCENES])
    scenes = []
    for sid, phase, title, place, hint in SCENES:
        page = infos.get(title)
        if not page or "imageinfo" not in page:
            print("no encontrado:", title)
            continue
        info = page["imageinfo"][0]
        meta = info.get("extmetadata", {})
        photo = to_16_9(Image.open(io.BytesIO(get(info["thumburl"]))).convert("RGB"))
        line = skyline(photo, hint)
        fg = cutout(photo, line)
        clock = place_clock(photo, line)
        # JPEG normal (no progresivo): la tele lo decodifica antes y con menos memoria intermedia.
        photo.save(os.path.join(out, f"scene-{sid}.jpg"), quality=84, optimize=True)
        glass = ImageEnhance.Brightness(photo.resize((480, 270)).filter(ImageFilter.GaussianBlur(7))).enhance(1.3)
        glass.save(os.path.join(out, f"scene-{sid}-glass.jpg"), quality=80)
        fg.save(os.path.join(out, f"scene-{sid}-fg.webp"), quality=86, method=4)
        scenes.append({"id": sid, "phase": phase, **clock, "place": place,
                       "author": clean(meta.get("Artist", {}).get("value")) or "Autor desconocido",
                       "license": clean(meta.get("LicenseShortName", {}).get("value")), "source": title})
        print(sid, clock, "|", scenes[-1]["author"][:30], "|", scenes[-1]["license"])
        if check:
            os.makedirs(check, exist_ok=True)
            view = Image.new("RGB", (W, H), (255, 0, 255))
            view.paste(fg, (0, 0), fg)
            d = ImageDraw.Draw(view)
            x0 = clock.get("left", 560)
            d.rectangle((x0, clock["top"] + 0.05 * clock["size"], x0 + 2.0 * clock["size"], clock["top"] + 0.92 * clock["size"]), outline=(255, 255, 0), width=6)
            view.resize((640, 360)).save(os.path.join(check, f"{sid}-check.jpg"), quality=80)
    with open(os.path.join(ROOT, "js", "scenes.js"), "w", encoding="utf-8") as f:
        f.write("// Generado por tools/fetch_scenes.py: los paisajes del fondo (Wikimedia Commons), dónde va la\n"
                "// hora en cada uno y a quién citar. phase: night, dawn, day, grey (día cubierto) o golden.\n")
        f.write(f"const SCENES = {json.dumps(scenes, ensure_ascii=False, indent=2)};\n")


main()
