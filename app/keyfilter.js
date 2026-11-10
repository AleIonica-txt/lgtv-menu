// Filtro de teclas de Mi Menú para el gestor de ventanas de webOS (surface-manager). homekey.py lo
// pone el primero de la lista com.webos.surfacemanager.keyFilters:
//   - El botón de fuentes abre el centro de control y el selector de entradas de LG no se lanza.
//   - Home con el menú delante: LG no hace nada (el menú ya es el inicio), así que se relanza el
//     menú y este vuelve al principio del Dock.
// Cualquier otra tecla (o un error aquí dentro) sigue su camino normal hacia los filtros de LG: eso
// es NextPolicy (NotAccepted cortaría la cadena y la tecla iría directa a la app, sin Home ni Ajustes).
// Se quita (y todo vuelve a ser como en LG) eligiendo "inicio de LG" en el menú.

var MENU = "com.webos.app.home";

function init() {
}

function menuInFront() {
    return fullscreenView.appId === MENU && fullscreenView.activeFocus;
}

function handleTvmenuInputKey(key, pressed, autoRepeat) {
    try {
        if (key === WebOS.Key_webOS_InputSource) {
            if (pressed && !autoRepeat)
                applicationManager.launch("org.mimenu.tvmenu.control", JSON.stringify({"action": "toggle"}));
            return KeyPolicy.Accepted;
        }
        if ((key === Qt.Key_Super_L || key === Qt.Key_Meta) && menuInFront()) {
            if (!pressed)
                applicationManager.launch(MENU, JSON.stringify({"home": true}));
            return KeyPolicy.Accepted;
        }
        return KeyPolicy.NextPolicy;
    } catch (e) {
        console.warn("tvmenu keyfilter: " + e);
        return KeyPolicy.NextPolicy;
    }
}
