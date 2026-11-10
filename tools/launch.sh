#!/bin/bash
# Abre (o relanza) el menú en la tele con parámetros opcionales. Si as-home.sh lo ha montado como
# Home del sistema, abre esa copia (com.webos.app.home).
# Uso: tools/launch.sh ['{"focus":"netflix"}']
set -euo pipefail

# IP de la tele: en el fichero tv-ip de la raíz del proyecto (o en la variable TV_IP).
TV_IP="${TV_IP:-$(cat "$(dirname "$0")/../tv-ip")}"
KEY="${KEY:-$HOME/.ssh/lgtv}"
PARAMS=${1:-'{}'}

json=$(python3 -I -c 'import json,sys; print(json.dumps({"id":"@APP@","params":json.loads(sys.argv[1])}))' "$PARAMS")

# El JSON va por la entrada estándar: así no hay que escapar comillas a través de ssh y script.
echo "$json" | ssh -i "$KEY" -o BatchMode=yes "root@$TV_IP" '
  json=$(cat)
  app=org.mimenu.tvmenu
  grep -q " /usr/palm/applications/com.webos.app.home " /proc/mounts && app=com.webos.app.home
  json=$(echo "$json" | sed "s/@APP@/$app/")
  script -qc "luna-send -n 1 -w 5000 luna://com.webos.applicationManager/launch '"'"'$json'"'"'" /dev/null >/dev/null' 2>/dev/null
