#!/bin/bash
# Mide cuánto tarda una app en aparecer en pantalla desde que se lanza (la cierra antes para que
# sea un arranque en frío), según el registro del sistema (SAM lanza -> surface-manager visible).
# Uso: tools/launchtime.sh org.mimenu.tvmenu [netflix ...]
set -euo pipefail

# IP de la tele: en el fichero tv-ip de la raíz del proyecto (o en la variable TV_IP).
TV_IP="${TV_IP:-$(cat "$(dirname "$0")/../tv-ip")}"
KEY="${KEY:-$HOME/.ssh/lgtv}"

ssh -i "$KEY" -o BatchMode=yes "root@$TV_IP" 'cat > /tmp/launchtime.sh' 2>/dev/null <<'EOF'
app=$1
L() { script -qc "luna-send -n 1 -w 8000 $1 '$2'" /dev/null >/dev/null; }
uptime_s() { cut -d' ' -f1 /proc/uptime; }
L luna://com.webos.applicationManager/closeByAppId "{\"id\":\"$app\"}"
sleep 4
t0=$(uptime_s)
L luna://com.webos.applicationManager/launch "{\"id\":\"$app\"}"
for i in $(seq 1 120); do
  # Marca de tiempo del registro = segundos desde el arranque, entre corchetes.
  # El registro rota cada pocos minutos: también se mira el último trozo comprimido.
  shown=$( (zcat /var/log/messages.0.gz 2>/dev/null; cat /var/log/messages) | grep "\"app_id\":\"$app\",\"visible\":true" | tail -1 | sed 's/^[^[]*\[\([0-9.]*\)\].*/\1/')
  [ -n "$shown" ] && awk -v a="$shown" -v b="$t0" 'BEGIN { exit !(a > b) }' && break
  shown=""
  sleep 0.5
done
if [ -n "$shown" ]; then
  awk -v a="$t0" -v b="$shown" -v app="$app" 'BEGIN { printf "%s: %.1f s hasta verse\n", app, b - a }'
else
  echo "$app: no apareció en 60 s"
fi
EOF

for app in "$@"; do
  ssh -i "$KEY" -o BatchMode=yes "root@$TV_IP" "sh /tmp/launchtime.sh $app" 2>/dev/null
done
