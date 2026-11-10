#!/bin/bash
# Mide la fluidez del menú justo al volver de una app: abre la app, espera, vuelve al menú con una
# medición corta y captura el resultado. Los parámetros extra (efectos de "debug", modos...) se
# aplican ya antes de salir del menú para que el cambio no cuente en la medición.
# Uso: tools/returnbench.sh salida.jpg ['"debug":["minimal"],"reduceMotion":true'] [netflix]
#   DELAY=ms  esperar tras volver antes de medir;  RENICE=1  bajar la prioridad de Netflix al volver
set -euo pipefail

OUT=${1:-return.jpg}
EXTRA=${2:-}
APP=${3:-netflix}
# IP de la tele: en el fichero tv-ip de la raíz del proyecto (o en la variable TV_IP).
TV_IP="${TV_IP:-$(cat "$(dirname "$0")/../tv-ip")}"
KEY="${KEY:-$HOME/.ssh/lgtv}"
DIR=$(dirname "$0")
SEP=${EXTRA:+,}

"$DIR/launch.sh" "{$EXTRA}"
sleep 4
ssh -i "$KEY" -o BatchMode=yes "root@$TV_IP" \
  "script -qc \"luna-send -n 1 -w 5000 luna://com.webos.applicationManager/launch '{\\\"id\\\":\\\"$APP\\\"}'\" /dev/null >/dev/null" 2>/dev/null
sleep 20
if [ "${RENICE:-0}" = 1 ]; then
  ssh -i "$KEY" -o BatchMode=yes "root@$TV_IP" 'for p in $(pidof netflix.bin); do renice -n 19 -p $p >/dev/null; done' 2>/dev/null
fi
DELAY=${DELAY:-0}
"$DIR/launch.sh" "{$EXTRA$SEP\"bench\":{\"moves\":6,\"interval\":220,\"delay\":$DELAY}}"
sleep $((3 + DELAY / 1000))
"$DIR/shot.sh" "$OUT"
