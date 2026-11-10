#!/bin/bash
# Empaqueta app/ como .ipk sin ares-cli y, con "install", lo instala en la tele por SSH.
# Con APP_DIR=control empaqueta el centro de control (otra app: flota sobre lo que se esté viendo).
# Uso: [APP_DIR=control] ./build.sh [install]
set -euo pipefail

# IP de la tele: en el fichero tv-ip (o en la variable TV_IP).
TV_IP="${TV_IP:-$(cat "$(dirname "$0")/tv-ip")}"
KEY="${KEY:-$HOME/.ssh/lgtv}"

cd "$(dirname "$0")"
APP_DIR="${APP_DIR:-app}"
APP_ID=$(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["id"])' "$APP_DIR/appinfo.json")
VERSION=$(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$APP_DIR/appinfo.json")
IPK="${APP_ID}_${VERSION}_all.ipk"

[ -f "$APP_DIR/icon.png" ] || python3 -I tools/make_icon.py "$APP_DIR/icon.png"

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/data/usr/palm/applications/$APP_ID" "$work/control"
cp -r "$APP_DIR"/. "$work/data/usr/palm/applications/$APP_ID/"
# Ficheros que comparte con el menú (shared.txt: rutas dentro de app/, una por línea).
if [ -f "$APP_DIR/shared.txt" ]; then
  while read -r f; do
    [ -n "$f" ] || continue
    mkdir -p "$(dirname "$work/data/usr/palm/applications/$APP_ID/$f")"
    cp "app/$f" "$work/data/usr/palm/applications/$APP_ID/$f"
  done < "$APP_DIR/shared.txt"
  rm "$work/data/usr/palm/applications/$APP_ID/shared.txt"
fi
python3 -I tools/bundle.py "$work/data/usr/palm/applications/$APP_ID"
cat > "$work/control/control" <<EOF
Package: $APP_ID
Version: $VERSION
Section: misc
Priority: optional
Architecture: all
Installed-Size: $(du -sk "$work/data" | cut -f1)
Maintainer: Mi Menú
Description: $(python3 -I -c 'import json,sys;print(json.load(open(sys.argv[1]))["title"])' "$APP_DIR/appinfo.json")
webOS-Package-Format-Version: 2
webOS-Packager-Version: x.y.x
EOF
echo "2.0" > "$work/debian-binary"
tar --owner=0 --group=0 -czf "$work/control.tar.gz" -C "$work/control" .
tar --owner=0 --group=0 -czf "$work/data.tar.gz" -C "$work/data" .
rm -f "$IPK"
(cd "$work" && ar rc "$OLDPWD/$IPK" debian-binary control.tar.gz data.tar.gz)
echo "Creado $IPK"

[ "${1:-}" = "install" ] || exit 0

SSH="ssh -i $KEY -o BatchMode=yes root@$TV_IP"
$SSH "cat > /tmp/$IPK" < "$IPK"
# En esta tele luna-send solo devuelve salida con TTY y redirigida a fichero.
ssh -tt -i "$KEY" -o BatchMode=yes "root@$TV_IP" \
  "luna-send -i -w 30000 luna://com.webos.appInstallService/dev/install '{\"id\":\"$APP_ID\",\"ipkUrl\":\"/tmp/$IPK\",\"subscribe\":true}' > /tmp/install.log 2>&1" \
  >/dev/null 2>&1 || true
$SSH "cat /tmp/install.log; rm -f /tmp/install.log /tmp/$IPK" 2>/dev/null \
  | grep -o -e '"state":"[^"]*"' -e '"errorText":"[^"]*"' | uniq
MENU_DIR=/media/developer/apps/usr/palm/applications/org.mimenu.tvmenu
if [ "$APP_DIR" = control ]; then
  # Instalar borra la carpeta de la app y, con ella, su copia de la clave del vigilante (token.js).
  $SSH "[ -f $MENU_DIR/token.sh ] && sh $MENU_DIR/token.sh" 2>/dev/null || true
  # Cargado y oculto, como al arrancar la tele (autostart.sh): la primera vez sale al instante.
  tools/luna.sh luna://com.webos.applicationManager/launch \
    '{"id":"org.mimenu.tvmenu.control","params":{"action":"preload"}}' >/dev/null
  echo "centro de control precargado"
fi
[ "$APP_DIR" = app ] || exit 0

# El vigilante y la copia del menú como Home del sistema siguen con la versión anterior hasta que
# se reinician: el vigilante se reinicia siempre; la copia, si está montada (reiniciar SAM cierra
# las apps abiertas).
DIR=$MENU_DIR
$SSH "sh $DIR/homekey.sh; echo 'vigilante reiniciado'
  if grep -q ' /usr/palm/applications/com.webos.app.home ' /proc/mounts; then
    sh $DIR/as-home.sh && echo 'copia del menú como Home actualizada'
  fi" 2>/dev/null
# Reiniciar SAM (as-home.sh) cierra también el centro de control: se vuelve a cargar oculto.
tools/luna.sh luna://com.webos.applicationManager/launch \
  '{"id":"org.mimenu.tvmenu.control","params":{"action":"preload"}}' >/dev/null
echo "centro de control precargado"
