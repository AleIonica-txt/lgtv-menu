# Descarga las fotos del salvapantallas desde Wikimedia Commons (imágenes destacadas, licencia
# libre) a app/photos/ a 1920x1080, y genera app/js/photos.js con el lugar, el autor y la licencia.
# Uso: python3 -I tools/fetch_photos.py   (para cambiar la selección, edita PLACES)
import html
import io
import json
import os
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request

from PIL import Image

# Fichero exacto en Commons -> lugar que se muestra. Elegidos a mano: buscar por nombre devolvía a
# veces cuadros, mapas o aviones.
PLACES = [
    ("File:Patio de los Arrayanes detail Alhambra Granada Spain.jpg", "Patio de los Arrayanes, La Alhambra (Granada)"),
    ("File:Sagrada Familia March 2015-10a.jpg", "Bóvedas de la Sagrada Familia, Barcelona"),
    ("File:Puente de San Martín. Toledo, Spain.jpg", "Puente de San Martín, Toledo"),
    ("File:Roque Cinchado und Teide.jpg", "Roque Cinchado y el Teide, Tenerife"),
    ("File:View from Balcón de Europa in Nerja 2014.jpg", "Balcón de Europa, Nerja (Málaga)"),
    ("File:Lofoten, Norway (Unsplash).jpg", "Islas Lofoten, Noruega"),
    ("File:Matterhorn, March 2019 (01).jpg", "Cervino, Suiza"),
    ("File:1000 Three domes of Oia in Santorini Photo by Giles Laurent.jpg", "Oía, Santorini (Grecia)"),
    ("File:Tramonto su San Marco Venezia 2.jpg", "San Marcos, Venecia"),
    ("File:Paris - The Eiffel Tower in spring - 2307.jpg", "Torre Eiffel, París"),
    ("File:Dubrovnik as seen from Srđ - September 2017.jpg", "Dubrovnik, Croacia"),
    ("File:Bled Island 05.jpg", "Lago Bled, Eslovenia"),
    ("File:Drei Zinnen Tre Cime di Lavaredo Dolomites.jpg", "Tre Cime di Lavaredo, Dolomitas"),
    ("File:Kirkjufell, Iceland, 20240714 1631 0713.jpg", "Kirkjufell, Islandia"),
    ("File:Prague 07-2016 View from Petrinska Tower img2.jpg", "Puente de Carlos, Praga"),
    ("File:Moraine Lake 17092005.jpg", "Lago Moraine, Canadá"),
    ("File:Grand Canyon Hopi Point with rainbow 2013.jpg", "Gran Cañón, Arizona"),
    ("File:Golden Gate Bridge as seen from Marshall’s Beach, March 2018.jpg", "Golden Gate, San Francisco"),
    ("File:Lower Manhattan from Jersey City November 2016 002.jpg", "Manhattan, Nueva York"),
    ("File:Tokyo Tower, Minato City.jpg", "Torre de Tokio, Japón"),
    ("File:International Commerce Centre on Victoria Harbour.jpg", "Bahía Victoria, Hong Kong"),
    ("File:Machu Picchu, Perú, 2015-07-30, DD 47.JPG", "Machu Picchu, Perú"),
    ("File:Sydney Opera House - Dec 2008.jpg", "Ópera de Sídney, Australia"),
    ("File:Cappadocia Aerial View Landscape.jpg", "Capadocia, Turquía"),
    ("File:Taj Mahal, Agra, India edit2.jpg", "Taj Mahal, Agra (India)"),
    ("File:Cuernos del Paine in Torres del Paine National Park.jpg", "Torres del Paine, Chile"),
]

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "app")
API = "https://commons.wikimedia.org/w/api.php?"
UA = {"User-Agent": "tvmenu/1.0 (salvapantallas personal para una tele)"}


# Commons limita el ritmo de peticiones: pausa entre llamadas y, si responde 429, esperar lo que
# indique (o cada vez más) y reintentar.
def get(url):
    for attempt in range(6):
        time.sleep(1)
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except urllib.error.HTTPError as e:
            if e.code != 429:
                raise
            wait = int(e.headers.get("Retry-After") or 0) or 10 * 2 ** attempt
            print(f"  Commons pide esperar {wait} s")
            time.sleep(wait)
    raise RuntimeError("Commons sigue rechazando las peticiones: " + url)


# Metadatos y miniatura de 1920 px de todos los ficheros en una sola consulta.
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
    target = 16 / 9
    if w / h > target:  # recortar los lados
        new_w = int(h * target)
        image = image.crop(((w - new_w) // 2, 0, (w + new_w) // 2, h))
    else:  # recortar arriba y abajo
        new_h = int(w / target)
        image = image.crop((0, (h - new_h) // 2, w, (h + new_h) // 2))
    return image.resize((1920, 1080), Image.LANCZOS)


def main():
    # Se descargan a una carpeta aparte y solo al final sustituyen a las anteriores: si la descarga
    # falla a medias, el salvapantallas conserva las fotos que tenía.
    final, work = os.path.join(ROOT, "photos"), os.path.join(ROOT, "photos.new")
    shutil.rmtree(work, ignore_errors=True)
    os.makedirs(work)
    infos = image_info([title for title, _ in PLACES])
    photos = []
    for title, place in PLACES:
        page = infos.get(title)
        if not page or "imageinfo" not in page:
            print("no encontrado:", title)
            continue
        info = page["imageinfo"][0]
        meta = info.get("extmetadata", {})
        image = to_16_9(Image.open(io.BytesIO(get(info["thumburl"]))).convert("RGB"))
        name = f"photos/{len(photos) + 1:02d}.jpg"
        # JPEG normal (no progresivo): la tele lo decodifica antes y con menos memoria intermedia.
        image.save(os.path.join(work, os.path.basename(name)), quality=80, optimize=True)
        photos.append({
            "src": name,
            "place": place,
            "author": clean(meta.get("Artist", {}).get("value")) or "Autor desconocido",
            "license": clean(meta.get("LicenseShortName", {}).get("value")),
            "source": title,
        })
        print(name, place, "|", photos[-1]["author"][:40], "|", photos[-1]["license"])
    if not photos:
        raise SystemExit("no se ha descargado ninguna foto: se dejan las que había")
    shutil.rmtree(final, ignore_errors=True)
    os.rename(work, final)
    with open(os.path.join(ROOT, "js", "photos.js"), "w", encoding="utf-8") as f:
        f.write("// Generado por tools/fetch_photos.py: fotos del salvapantallas (Wikimedia Commons).\n")
        f.write(f"const PHOTOS = {json.dumps(photos, ensure_ascii=False, indent=2)};\n")


main()
