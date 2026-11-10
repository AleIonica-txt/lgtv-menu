#!/bin/bash
# Ajustes de rendimiento de webOS para esta tele (todos reversibles):
#   - Quick Start+ activado: al apagar con el mando la tele queda en suspensión y al encender vuelve
#     en segundos a donde estaba (el menú), sin el arranque completo de más de un minuto.
#   - Precargas de LG solo para el menú y la TDT: LG vuelve a abrir en segundo plano las apps de su
#     lista en cuanto hay memoria libre (Netflix 68 MB, Prime Video 75, cada HDMI 30-56) y la tele
#     vivía siempre al borde del nivel de memoria "medio". Las entradas HDMI se restauran al instante
#     sin precarga (0,6 s) y Netflix y YouTube abren en ~1,1 s desde cero.
#   - Sin promociones ni vídeos promocionales de LG (Home de LG más ligero).
#   - Sin anuncios: el salvapantallas de LG (cuando no está Mi Menú delante) deja de mostrar
#     publicidad, sin avisos emergentes de la IA y sin cookie de publicidad personalizada.
#   - Sin recomendaciones de contenido de LG (se descargan en segundo plano para su inicio).
# Los valores originales se guardan una sola vez en la tele (ORIG) y "undo" los restaura.
# Uso: tools/tv-tune.sh apply | undo | status
set -euo pipefail

# IP de la tele: en el fichero tv-ip de la raíz del proyecto (o en la variable TV_IP).
TV_IP="${TV_IP:-$(cat "$(dirname "$0")/../tv-ip")}"
KEY="${KEY:-$HOME/.ssh/lgtv}"
MODE=${1:-status}

ssh -i "$KEY" -o BatchMode=yes "root@$TV_IP" "sh -s $MODE" 2>/dev/null <<'EOF'
MODE=$1
ORIG=/var/lib/webosbrew/tvmenu-tune.orig
PRELOAD=/var/preferences/webos-preload-manager-conf.json
OPTION_KEYS='["quickStartMode","livePromotion","webOSPromotionVideo"]'
GENERAL_KEYS='["homePromotion"]'
ADS_KEYS='["screenSaverAd","aiNudge","adCookie"]'
OTHER_KEYS='["contentRecommendation"]'

L() { script -qc "luna-send -n 1 -w 5000 $1 '$2'" /dev/null | tr -d '\r'; }
get() { L luna://com.webos.settingsservice/getSystemSettings "{\"category\":\"$1\",\"keys\":$2}"; }
set_() { L luna://com.webos.settingsservice/setSystemSettings "{\"category\":\"$1\",\"settings\":$2}" | grep -q '"returnValue":true' && echo "  $1 $2: ok" || echo "  $1 $2: ERROR"; }
settings_of() { python3 -c 'import json,sys; print(json.dumps(json.load(open(sys.argv[1]))["settings"]))' "$1"; }

case "$MODE" in
apply)
  if [ ! -d "$ORIG" ]; then
    mkdir -p "$ORIG"
    cp "$PRELOAD" "$ORIG/preload.json"
    get option "$OPTION_KEYS" > "$ORIG/option.json"
    get general "$GENERAL_KEYS" > "$ORIG/general.json"
    echo "originales guardados en $ORIG"
  fi
  # Añadido después: sus originales van aparte para no tocar los ya guardados.
  if [ ! -f "$ORIG/ads.json" ]; then
    get general "$ADS_KEYS" > "$ORIG/ads.json"
  fi
  if [ ! -f "$ORIG/other.json" ]; then
    get other "$OTHER_KEYS" > "$ORIG/other.json"
  fi
  set_ option '{"quickStartMode":"on","livePromotion":"off","webOSPromotionVideo":"off"}'
  set_ general '{"homePromotion":"off"}'
  set_ general '{"screenSaverAd":"off","aiNudge":"off","adCookie":"off"}'
  set_ other '{"contentRecommendation":"off"}'
  cat > "$PRELOAD" <<'JSON'
{"version":3,"allowedApps":{"com.webos.app.home":true,"com.webos.app.livetv":true}}
JSON
  systemctl restart preload-manager  # solo lee la lista al arrancar
  echo "  precargas: solo el menú (Home) y la TDT"
  # Cerrar las que ya estaban precargadas y ya no lo están (salvo la que se esté viendo).
  fg=$(L luna://com.webos.applicationManager/getForegroundAppInfo '{}')
  for app in netflix youtube.leanback.v4 amazon com.webos.app.hdmi1 com.webos.app.hdmi2 com.webos.app.hdmi3 \
             com.webos.app.lgchannels com.webos.app.browser com.webos.app.voice airplay com.webos.app.livemenu; do
    case "$fg" in *"\"appId\":\"$app\""*) continue ;; esac
    if L luna://com.webos.applicationManager/closeByAppId "{\"id\":\"$app\"}" | grep -q '"returnValue":true'; then
      echo "  cerrada: $app"
    fi
  done
  ;;
undo)
  [ -d "$ORIG" ] || { echo "no hay originales guardados: nada que deshacer"; exit 1; }
  set_ option "$(settings_of "$ORIG/option.json")"
  set_ general "$(settings_of "$ORIG/general.json")"
  [ -f "$ORIG/ads.json" ] && set_ general "$(settings_of "$ORIG/ads.json")"
  [ -f "$ORIG/other.json" ] && set_ other "$(settings_of "$ORIG/other.json")"
  cp "$ORIG/preload.json" "$PRELOAD" && systemctl restart preload-manager && echo "  precargas originales restauradas"
  rm -rf "$ORIG"
  ;;
status)
  get option "$OPTION_KEYS"; echo
  get general "$GENERAL_KEYS"; echo
  get general "$ADS_KEYS"; echo
  get other "$OTHER_KEYS"; echo
  cat "$PRELOAD"; echo
  grep -e MemAvailable -e SwapFree /proc/meminfo
  ;;
esac
EOF
