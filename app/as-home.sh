#!/bin/sh
# Convierte Mi Menú en el Home del sistema: copia la app en RAM con la identidad del Home de LG
# (com.webos.app.home), la monta encima del Home de LG y reinicia SAM para que la use. webOS la abre
# entonces él mismo al pulsar Home o al salir de una app, sin enseñar el Home de LG, y la mantiene
# viva como a su propio Home (vuelta en ~0,2 s). No cambia nada en disco: con un reinicio vuelve el
# Home de LG. Basado en as-home.sh de theboringhumane/theboringtv-lgwebos.
# Homebrew Channel lo ejecuta desde /var/lib/webosbrew/init.d/85tvmenu-as-home; homekey.py también
# lo usa al cambiar el ajuste "La tecla Home abre", y build.sh tras instalar una versión nueva.
# Uso: as-home.sh        monta (o vuelve a montar) el menú como Home
#      as-home.sh off    quita el montaje: vuelve el Home de LG
# Reiniciar SAM cierra las apps abiertas (y obliga a reiniciar más servicios: ver restart_sam).

SRC=/media/developer/apps/usr/palm/applications/org.mimenu.tvmenu
DST=/usr/palm/applications/com.webos.app.home
TMP=/tmp/tvmenu-as-home
LOG=/tmp/tvmenu-as-home.log
LG_HOME_FLAG=/var/lib/webosbrew/tvmenu-lg-home  # el usuario eligió el Home de LG (homekey.py)

mounted() { grep -q " $DST " /proc/mounts; }
log() { echo "[$(cut -d' ' -f1 /proc/uptime)s] $*" >>"$LOG"; }
launch_home() { script -qc "luna-send -n 1 -w 5000 luna://com.webos.applicationManager/launch '{\"id\":\"com.webos.app.home\"}'" /dev/null >/dev/null 2>&1; }
# Reiniciar SAM no cierra las páginas web: si el motor web (WAM) sigue teniendo abierta la versión
# anterior del Home, la reutilizaría al relanzarlo. Se cierra antes de cambiar el montaje.
close_home() { script -qc "luna-send -n 1 -w 5000 luna://com.palm.webappmanager/killApp '{\"appId\":\"com.webos.app.home\"}'" /dev/null >/dev/null 2>&1; }
media_follows_sam() { timeout 15 script -qc "ls-monitor -s" /dev/null 2>/dev/null | grep -q "com.webos.media.appobserver"; }

# Al reiniciar SAM, el servidor multimedia (umediaserver) pierde su suscripción a SAM y no la
# recupera: deja de saber qué app está delante y no conecta a la pantalla el vídeo de las apps
# nativas (la TDT dice "No hay señal" aunque la antena va bien, y HDMI y YouTube se ven en negro)
# hasta reiniciar la tele. Por eso se reinicia también, y después memchute (el gestor de memoria de
# LG), que pierde a su vez la suscripción al servidor multimedia; el servicio de capturas se para
# y el sistema lo vuelve a arrancar cuando haga falta. Reiniciar SAM ya ha cerrado todas las apps:
# no hay ningún vídeo en marcha que cortar. Visto el 7-nov: TDT en negro tras reiniciar SAM y de
# vuelta al reiniciar el servidor multimedia.
restart_sam() {
    systemctl restart sam
    systemctl restart umediaserver
    systemctl restart memchute
    killall captureservice 2>/dev/null
    # Comprobación en segundo plano (no retrasa el arranque): si aun así no ha vuelto a suscribirse,
    # se repite una vez.
    (
        sleep 20
        if media_follows_sam; then
            log "servidor multimedia al día con SAM"
        else
            log "servidor multimedia sin suscripción a SAM: se reinicia otra vez"
            systemctl restart umediaserver
            systemctl restart memchute
        fi
    ) </dev/null >/dev/null 2>&1 &
}

if [ "$1" = off ]; then
    close_home
    mounted && umount "$DST"
    restart_sam
    log "Home de LG restaurado"
    sleep 3
    launch_home
    exit 0
fi

[ -f "$LG_HOME_FLAG" ] && exit 0
[ -f "$SRC/index.html" ] || { log "Mi Menú no está instalado"; exit 0; }

sh "$SRC/token.sh"  # la copia se lleva token.js: la clave para hablar con el vigilante
close_home
mounted && umount "$DST"  # al instalar una versión nueva se vuelve a montar la copia
# mkdir sin -p: si otro proceso ha puesto algo en esa ruta de /tmp entre medias, falla en vez de
# montar como Home del sistema una carpeta que no es nuestra.
rm -rf "$TMP"
mkdir -m 755 "$TMP" || { log "no se pudo crear $TMP"; exit 0; }
for f in "$SRC"/*; do
    case $(basename "$f") in
        photos|logos|icons) ln -s "$f" "$TMP/" ;;  # lo pesado se enlaza: no ocupa RAM
        *) cp -a "$f" "$TMP/" ;;
    esac
done

# La copia toma el id, la categoría y los permisos del Home de LG (los de su appinfo original).
python3 - "$TMP/appinfo.json" "$DST/appinfo.json" <<'EOF' || { log "no se pudo preparar appinfo.json"; exit 0; }
import json, sys
mine, lg = json.load(open(sys.argv[1])), json.load(open(sys.argv[2]))
mine.update({"id": "com.webos.app.home", "title": "Home", "visible": False, "class": {"hidden": True},
             "noSplashOnLaunch": True, "appCategory": ["home"], "requiredPermissions": lg["requiredPermissions"]})
json.dump(mine, open(sys.argv[1], "w"), indent=4)
EOF

mount --bind "$TMP" "$DST" || { log "no se pudo montar"; exit 0; }
restart_sam
log "Mi Menú es el Home"
sleep 3
launch_home
