#!/bin/sh
# Abre Mi Menú al arrancar la tele. Homebrew Channel lo ejecuta desde
# /var/lib/webosbrew/init.d/90tvmenu (enlace simbólico a este fichero).
# Para desactivarlo: rm /var/lib/webosbrew/init.d/90tvmenu

APP=org.mimenu.tvmenu
LOG=/tmp/tvmenu-autostart.log

# Ajuste "La tecla Home abre: Inicio de LG" (lo crea homekey.py desde los ajustes del menú).
[ -f /var/lib/webosbrew/tvmenu-lg-home ] && exit 0

# Si as-home.sh ya ha montado el menú como Home del sistema, el menú es com.webos.app.home.
grep -q " /usr/palm/applications/com.webos.app.home " /proc/mounts && APP=com.webos.app.home

# luna-send pierde su salida si no hay TTY; "script" le da una.
luna() { script -qc "luna-send -n 1 -w 3000 $1 '$2'" /dev/null 2>/dev/null; }
foreground() { luna luna://com.webos.applicationManager/getForegroundAppInfo '{}'; }
launch() { luna luna://com.webos.applicationManager/launch "{\"id\":\"$APP\"}" >/dev/null; }
log() { echo "[$(cut -d' ' -f1 /proc/uptime)s] $*"; }

# Espera hasta $1 segundos a que el menú esté en primer plano.
wait_menu() {
    i=0
    while [ $i -lt "$1" ]; do
        case "$(foreground)" in *"\"appId\":\"$APP\""*) return 0 ;; esac
        sleep 1
        i=$((i + 1))
    done
    return 1
}

run() {
    log "inicio"

    # Esperar (máx. ~3 min) a que el sistema tenga una app en primer plano (Home, TV...).
    # Homebrew suele ejecutar init.d cuando Home ya está visible, así que normalmente no espera.
    i=0
    while [ $i -lt 180 ]; do
        case "$(foreground)" in
            *'"appId":""'*|'') ;;
            *'"appId":"'*) break ;;
        esac
        sleep 1
        i=$((i + 1))
    done
    log "sistema listo"

    # Lo normal ahora es que webOS ya haya abierto el menú como "última entrada" (homekey.py).
    case "$(foreground)" in
        *"\"appId\":\"$APP\""*) log "$APP ya estaba en pantalla"; return ;;
    esac

    # Durante el arranque la app tarda en cargar; solo se relanza si algo la tapa.
    for try in 1 2 3; do
        launch
        log "lanzado (intento $try)"
        if wait_menu 20; then
            log "$APP en pantalla"
            return
        fi
    done
    log "no se pudo dejar $APP en pantalla: $(foreground)"
}

# El centro de control (botón de fuentes) se carga ya, oculto: así la primera pulsación es inmediata.
preload_control() {
    sleep 5
    luna luna://com.webos.applicationManager/launch '{"id":"org.mimenu.tvmenu.control","params":{"action":"preload"}}' >/dev/null
    log "centro de control precargado"
}

# En segundo plano para no retrasar el resto del arranque (run-parts espera a cada script).
{ run; preload_control; } </dev/null >"$LOG" 2>&1 &
