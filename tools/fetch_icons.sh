#!/bin/bash
# Copia de la tele los iconos grandes de las apps del menú a app/icons/ (uso personal).
# Uso: tools/fetch_icons.sh   (vuelve a ejecutarlo si una app cambia su icono)
set -euo pipefail

# IP de la tele: en el fichero tv-ip de la raíz del proyecto (o en la variable TV_IP).
TV_IP="${TV_IP:-$(cat "$(dirname "$0")/../tv-ip")}"
KEY="${KEY:-$HOME/.ssh/lgtv}"
cd "$(dirname "$0")/.."
mkdir -p app/icons

# nombre en el menú -> ruta del icono en la tele
declare -A ICONS=(
  [netflix]=/media/cryptofs/apps/usr/palm/applications/netflix/LARGE_APP_ICON.png
  [hbomax]=/media/cryptofs/apps/usr/palm/applications/com.wbd.stream/largeIcon.png
  [disney]=/media/cryptofs/apps/usr/palm/applications/com.disney.disneyplus-prod/largeIcon.png
  [prime]=/media/cryptofs/apps/usr/palm/applications/amazon/aiv_white_130x130.png
  [crunchyroll]=/media/cryptofs/apps/usr/palm/applications/com.crunchyroll.webapp/appIcon-150x150.png
  [youtube]=/media/cryptofs/apps/usr/palm/applications/youtube.leanback.v4/yt_lg_130x130.png
  [appletv]=/media/cryptofs/apps/usr/palm/applications/com.apple.appletv/AppleTV_130x130.png
  [twitch]=/media/cryptofs/apps/usr/palm/applications/tv.twitch.tv.starshot.lg/TWITCH_APP_ICON.png
  [stremio]=/media/cryptofs/apps/usr/palm/applications/io.strem.tv/120988860158891519_38151694_192x192_webos.png
  [homebrew]=/media/developer/apps/usr/palm/applications/org.webosbrew.hbchannel/assets/icon130.png
  [browser]=/mnt/otncabi/usr/palm/applications/com.webos.app.browser/assets/hd1080/webbrowser_large_icon.png
)

for name in "${!ICONS[@]}"; do
  # Si la app no está instalada, sin icono: el menú muestra la tarjeta con su color y su nombre.
  if ssh -i "$KEY" -o BatchMode=yes "root@$TV_IP" "cat '${ICONS[$name]}'" 2>/dev/null > "app/icons/$name.png"; then
    echo "$name: $(file -b "app/icons/$name.png" | cut -d, -f1-2)"
  else
    rm -f "app/icons/$name.png"
    echo "$name: no está en la tele (¿app no instalada?)"
  fi
done
