#!/bin/bash
# Lanza el modo de medición del menú en la tele y captura la pantalla con el resultado.
# Uso: tools/bench.sh salida.jpg ['{"reduceTransparency":true}']   (parámetros extra para la app)
set -euo pipefail

OUT=${1:-bench.jpg}
EXTRA=${2:-'{}'}
DIR=$(dirname "$0")

"$DIR/launch.sh" "$(python3 -I -c 'import json,sys; p=json.loads(sys.argv[1]); p["bench"]={}; print(json.dumps(p))' "$EXTRA")"
sleep 14  # 24 movimientos x 450 ms + margen
"$DIR/shot.sh" "$OUT"
