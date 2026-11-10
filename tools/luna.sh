#!/bin/bash
# Llama a un servicio luna de la tele y muestra la respuesta (el JSON va por la entrada estándar:
# así no hay que escapar comillas a través de ssh y script).
# Uso: tools/luna.sh luna://com.webos.applicationManager/launch '{"id":"netflix"}'
set -euo pipefail

# IP de la tele: en el fichero tv-ip de la raíz del proyecto (o en la variable TV_IP).
TV_IP="${TV_IP:-$(cat "$(dirname "$0")/../tv-ip")}"
KEY="${KEY:-$HOME/.ssh/lgtv}"

echo "${2:-{\}}" | ssh -i "$KEY" -o BatchMode=yes "root@$TV_IP" "
  printf '%s' \"\$(cat)\" > /tmp/tvmenu-luna.json
  script -qc \"luna-send -n 1 -w 8000 $1 \\\"\\\$(cat /tmp/tvmenu-luna.json)\\\"\" /dev/null
  rm -f /tmp/tvmenu-luna.json" 2>/dev/null | tr -d '\r'
