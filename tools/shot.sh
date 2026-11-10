#!/bin/bash
# Captura lo que muestra la tele (1920x1080 JPEG) y lo guarda en el PC.
# Uso: tools/shot.sh salida.jpg
set -euo pipefail

# IP de la tele: en el fichero tv-ip de la raíz del proyecto (o en la variable TV_IP).
TV_IP="${TV_IP:-$(cat "$(dirname "$0")/../tv-ip")}"
KEY="${KEY:-$HOME/.ssh/lgtv}"
OUT=${1:-shot.jpg}

ssh -i "$KEY" -o BatchMode=yes "root@$TV_IP" '
script -qc "luna-send -n 1 -w 8000 luna://com.webos.service.capture/executeOneShot '"'"'{\"path\":\"/tmp/tvmenu-shot.jpg\",\"method\":\"DISPLAY\",\"width\":1920,\"height\":1080,\"format\":\"JPEG\"}'"'"'" /dev/null >/dev/null
cat /tmp/tvmenu-shot.jpg && rm -f /tmp/tvmenu-shot.jpg' 2>/dev/null > "$OUT"
echo "$OUT"
