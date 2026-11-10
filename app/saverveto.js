// Veta el salvapantallas de LG mientras Mi Menú está en pantalla con su salvapantallas propio
// activado (se ejecuta en la tele como root; lo arranca homekey.sh junto a homekey.py).
// tvpower pregunta a los clientes registrados antes de mostrar el suyo, pero solo atiende la
// respuesta si llega por la misma conexión que se registró: por eso va en Node con palmbus (una
// conexión fija) y no con luna-send (una conexión por llamada). La app web no puede hacerlo: no
// tiene permiso para responder a tvpower.
const fs = require('fs');
const palmbus = require('palmbus');

const APP = 'org.mimenu.tvmenu';
const HOME = 'com.webos.app.home';  // el menú, cuando as-home.sh lo monta como Home del sistema
const CLIENT = 'org.mimenu.tvmenu.saver';
const SAVER_OFF_FLAG = '/var/lib/webosbrew/tvmenu-saver-off';  // la crea homekey.py desde los ajustes

const menuReplacesHome = () => fs.readFileSync('/proc/mounts', 'utf8').includes(` /usr/palm/applications/${HOME} `);

const handle = new palmbus.Handle('', false);

function log(msg) {
  console.log(`[${new Date().toTimeString().slice(0, 8)}] ${msg}`);
}

function call(uri, payload) {
  return new Promise((resolve) => {
    handle.call(uri, JSON.stringify(payload)).addListener('response', (m) => resolve(JSON.parse(m.payload())));
  });
}

const request = handle.subscribe('luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
  JSON.stringify({ subscribe: true, clientName: CLIENT }));

request.addListener('response', async (m) => {
  const data = JSON.parse(m.payload());
  if (data.timestamp === undefined) return;
  const { appId } = await call('luna://com.webos.applicationManager/getForegroundAppInfo', {});
  const menuShown = appId === APP || (appId === HOME && menuReplacesHome());
  const veto = menuShown && !fs.existsSync(SAVER_OFF_FLAG);
  const res = await call('luna://com.webos.service.tvpower/power/responseScreenSaverRequest',
    { clientName: CLIENT, ack: !veto, timestamp: data.timestamp });
  log(`salvapantallas de LG ${veto ? 'vetado' : 'permitido'} (en pantalla: ${appId}): `
    + `${res.returnValue ? 'ok' : JSON.stringify(res)}`);
});

setInterval(() => {}, 1 << 30);  // mantener el proceso vivo
log('vigilando el salvapantallas de LG');
