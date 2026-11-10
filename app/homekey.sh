#!/bin/sh
# Arranca el vigilante (homekey.py) y el veto al salvapantallas de LG (saverveto.js), o los
# reinicia si ya estaban en marcha. Homebrew Channel lo ejecuta al encender desde
# /var/lib/webosbrew/init.d/80tvmenu-home (enlace simbólico a este fichero).
# Para desactivarlo: rm /var/lib/webosbrew/init.d/80tvmenu-home
#                    kill $(cat /tmp/tvmenu-homekey.pid) $(cat /tmp/tvmenu-saverveto.pid)

DIR=$(dirname "$(readlink -f "$0")")
PID=/tmp/tvmenu-homekey.pid
SAVER_PID=/tmp/tvmenu-saverveto.pid

# Para el proceso del fichero $1 solo si sigue siendo el script $2 (el número puede haberse
# reutilizado si el proceso murió).
stop() {
    [ -f "$1" ] || return
    pid=$(cat "$1")
    grep -q "$2" "/proc/$pid/cmdline" 2>/dev/null && kill "$pid"
}

# Clave del servidor local del vigilante, y su copia para el menú y el centro de control.
sh "$DIR/token.sh"

stop "$PID" homekey.py
nohup python3 "$DIR/homekey.py" "$@" </dev/null >/tmp/tvmenu-homekey.log 2>&1 &
echo $! >"$PID"

stop "$SAVER_PID" saverveto.js
NODE_PATH=/usr/lib/node_modules:/usr/lib/nodejs \
  nohup node "$DIR/saverveto.js" </dev/null >/tmp/tvmenu-saverveto.log 2>&1 &
echo $! >"$SAVER_PID"
