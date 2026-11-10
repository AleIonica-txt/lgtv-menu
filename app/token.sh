#!/bin/sh
# Clave del servidor local del vigilante (homekey.py). El servidor solo escucha en 127.0.0.1, pero ahí
# lo alcanza cualquier página abierta en la tele (el navegador, la publicidad de una app...), y puede
# apagar la tele o cambiar el inicio. Por eso cada petición lleva esta clave, que solo conocen el menú
# y el centro de control: la leen de token.js, un fichero de su propia carpeta que una página de
# fuera no puede cargar.
# La clave se crea una sola vez (no cambia entre reinicios: las páginas ya abiertas siguen valiendo).
# Lo ejecutan homekey.sh (al encender y al instalar), as-home.sh y build.sh.

TOKEN_FILE=/var/lib/webosbrew/tvmenu-token
APPS=/media/developer/apps/usr/palm/applications

if [ ! -s "$TOKEN_FILE" ]; then
    (umask 077; cat /proc/sys/kernel/random/uuid >"$TOKEN_FILE")
fi
token=$(tr -cd 'a-f0-9-' <"$TOKEN_FILE")

# El menú, el centro de control y la copia del menú montada como Home del sistema (as-home.sh).
for dir in "$APPS/org.mimenu.tvmenu" "$APPS/org.mimenu.tvmenu.control" /tmp/tvmenu-as-home; do
    if [ -d "$dir" ]; then
        echo "window.TVMENU_TOKEN = '$token';" >"$dir/token.js"
    fi
done
exit 0
