#!/bin/bash
# Registra en la tele, cada 2 s, la memoria del sistema y la de los procesos que más pesan, para ver
# qué crece mientras se usa una app (p. ej. al reproducir en Stremio).
# Uso: tools/memwatch.sh start [segundos]   (por defecto 900)
#      tools/memwatch.sh show               (resumen: mínimo de memoria disponible y quién crece)
#      tools/memwatch.sh stop
set -euo pipefail

# IP de la tele: en el fichero tv-ip de la raíz del proyecto (o en la variable TV_IP).
TV_IP="${TV_IP:-$(cat "$(dirname "$0")/../tv-ip")}"
KEY="${KEY:-$HOME/.ssh/lgtv}"
SSH="ssh -i $KEY -o BatchMode=yes root@$TV_IP"
LOG=/tmp/tvmenu-mem.log

case "${1:-show}" in
start)
  $SSH "cat > /tmp/tvmenu-memwatch.sh" 2>/dev/null <<'SCRIPT'
LOG=/tmp/tvmenu-mem.log
end=$(( $(cut -d. -f1 /proc/uptime) + $1 ))
: > $LOG
while [ "$(cut -d. -f1 /proc/uptime)" -lt "$end" ]; do
  m=$(awk '/^MemAvailable/{a=$2}/^SwapFree/{s=$2}/^Shmem:/{t=$2}END{printf "disp=%d swaplibre=%d tmpfs=%d", a/1024, s/1024, t/1024}' /proc/meminfo)
  # Un solo awk para todos los procesos (uno por proceso tardaba ~15 s por muestra): los de más de
  # 20 MB (RAM + swap), como nombre(pid)=MB.
  p=$(awk 'FNR==1{n="";r=0;pid=""} /^Name:/{n=$2} /^Pid:/{pid=$2} /^VmRSS:/{r=$2} /^VmSwap:/{if (r+$2 > 20480) printf "%s(%s)=%d ", n, pid, (r+$2)/1024}' /proc/[0-9]*/status 2>/dev/null)
  efs=$(cat /sys/kernel/mm/low_mem_notify/efs_shrink 2>/dev/null)
  echo "$(date +%H:%M:%S) $m efs=$efs | $p" >> $LOG
  sleep 2
done
SCRIPT
  $SSH "setsid sh /tmp/tvmenu-memwatch.sh ${2:-900} </dev/null >/dev/null 2>&1 &" 2>/dev/null
  echo "registrando memoria ${2:-900} s en la tele ($LOG)"
  ;;
show)
  $SSH "cat $LOG" 2>/dev/null | python3 -c '
import sys, re
rows = [l.rstrip() for l in sys.stdin if l.strip()]
if not rows:
    sys.exit("sin datos")
def disp(l): return int(re.search(r"disp=(\d+)", l).group(1))
low = min(rows, key=disp)
print("muestras:", len(rows), "| primera:", rows[0][:8], "| última:", rows[-1][:8])
print("memoria disponible: inicio %d MB, mínimo %d MB (%s), final %d MB" % (disp(rows[0]), disp(low), low[:8], disp(rows[-1])))
first = dict(re.findall(r"(\S+)=(\d+) ", rows[0].split("|")[1] + " "))
peak = {}
for l in rows:
    for k, v in re.findall(r"(\S+)=(\d+) ", l.split("|")[1] + " "):
        peak[k] = max(peak.get(k, 0), int(v))
print("procesos (MB, inicio -> máximo):")
for k, v in sorted(peak.items(), key=lambda kv: -kv[1]):
    print("  %-32s %5s -> %5d" % (k[:32], first.get(k, "-"), v))
print("en el mínimo:", low)
'
  ;;
stop)
  $SSH 'for p in /proc/[0-9]*; do grep -q "tvmenu-memwatc[h]" $p/cmdline 2>/dev/null && kill ${p#/proc/}; done; echo parado' 2>/dev/null
  ;;
esac
