#!/bin/bash
# Elige el lugar del tiempo y del sol del menú (o lo quita). Busca el nombre en Open-Meteo desde el
# PC y guarda el lugar en las preferencias del menú, en la tele (solo el nombre y las coordenadas
# redondeadas a dos decimales, unos 1 km: basta un pueblo o una ciudad, nunca una dirección).
# Uso: tools/weather.sh "Granada"      (el primer resultado; añade el país si hay varios: "Granada, ES")
#      tools/weather.sh --off          (sin lugar: sin tiempo, y el paisaje va por la hora del reloj)
set -euo pipefail

# IP de la tele: en el fichero tv-ip de la raíz del proyecto (o en la variable TV_IP).
TV_IP="${TV_IP:-$(cat "$(dirname "$0")/../tv-ip")}"
KEY="${KEY:-$HOME/.ssh/lgtv}"
SSH="ssh -i $KEY -o BatchMode=yes root@$TV_IP"
[ $# -ge 1 ] || { sed -n '2,6p' "$0"; exit 1; }

# El vigilante (homekey.py) guarda las preferencias; se le habla desde la propia tele, con su clave.
API='T=$(cat /var/lib/webosbrew/tvmenu-token); curl -s -m 5'
prefs=$($SSH "$API \"http://127.0.0.1:45710/prefs?t=\$T\"" 2>/dev/null)

new=$(python3 -I - "$1" "$prefs" <<'PY'
import json, sys, urllib.parse, urllib.request
query, prefs = sys.argv[1], json.loads(sys.argv[2] or "{}")
settings = prefs.setdefault("settings", {})
if query == "--off":
    settings.update(weatherPlace="", weatherLat=0, weatherLon=0)
    print("sin lugar", file=sys.stderr)
else:
    name, _, country = [p.strip() for p in query.partition(",")]
    url = "https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(
        {"name": name, "count": 5, "language": "es", "format": "json", **({"countryCode": country.upper()} if country else {})})
    found = json.load(urllib.request.urlopen(url, timeout=15)).get("results") or []
    if not found:
        sys.exit("no se encuentra «%s»" % query)
    place = found[0]
    settings.update(weather=True, weatherPlace=place["name"][:40],
                    weatherLat=round(place["latitude"], 2), weatherLon=round(place["longitude"], 2))
    print("lugar: %s (%s, %s)" % (place["name"], place.get("admin1", ""), place.get("country", "")), file=sys.stderr)
    for other in found[1:]:
        print("  otros: %s (%s, %s)" % (other["name"], other.get("admin1", ""), other.get("country_code", "")), file=sys.stderr)
print(json.dumps(prefs))
PY
)
echo "$new" | $SSH "$API -X POST --data-binary @- \"http://127.0.0.1:45710/prefs?t=\$T\"" 2>/dev/null; echo
# El menú lee las preferencias al relanzarse.
"$(dirname "$0")/launch.sh" '{}'
