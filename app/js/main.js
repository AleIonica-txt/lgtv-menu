// Pantalla principal de Mi Menú.

const SCRIPT_START_MS = performance.now();  // para la medición del arranque ({"timing": true})

const SVG = (body) => '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3" '
  + `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = {
  tv: SVG('<rect x="7" y="17" width="50" height="33" rx="6"/><path d="M23 6l9 10 9-10"/><path d="M24 57h16"/>'),
  firestick: SVG('<rect x="6" y="22" width="40" height="20" rx="5"/><path d="M46 27h10v10H46"/><path d="M15 32h14"/>'),
  gamepad: SVG('<path d="M20 20h24a12 12 0 0 1 11.6 9l3.3 12.4A6 6 0 0 1 48.6 46L42 38H22l-6.6 8a6 6 0 0 1-10.3-4.6L8.4 29A12 12 0 0 1 20 20z"/>'
    + '<path d="M20 26v9M15.5 30.5h9"/><circle cx="42" cy="27" r="1.6"/><circle cx="47" cy="32" r="1.6"/>'),
  toggles: SVG('<rect x="8" y="12" width="48" height="16" rx="8"/><circle cx="48" cy="20" r="4"/>'
    + '<rect x="8" y="36" width="48" height="16" rx="8"/><circle cx="16" cy="44" r="4"/>'),
  gear: SVG('<circle cx="32" cy="32" r="9"/><path d="M32 7v8M32 49v8M7 32h8M49 32h8M14.3 14.3l5.7 5.7M44 44l5.7 5.7M14.3 49.7l5.7-5.7M44 20l5.7-5.7"/>'),
  apps: SVG('<rect x="10" y="10" width="18" height="18" rx="4"/><rect x="36" y="10" width="18" height="18" rx="4"/>'
    + '<rect x="10" y="36" width="18" height="18" rx="4"/><rect x="36" y="36" width="18" height="18" rx="4"/>'),
  sliders: SVG('<path d="M10 18h28M50 18h4M10 32h8M30 32h24M10 46h20M42 46h12"/>'
    + '<circle cx="44" cy="18" r="5"/><circle cx="24" cy="32" r="5"/><circle cx="36" cy="46" r="5"/>'),
};

// Cada acceso: app que abre (o "command" interno), nombre y aspecto de su tarjeta. Con "icon" la
// tarjeta es un degradado de "colors" con un icono dibujado; con "image" es el icono de la app
// (copiado de la tele con tools/fetch_icons.sh) sobre su color de fondo ("tile").
const SECTIONS = {
  tv: { app: 'com.webos.app.livetv', label: 'Ver TV', title: 'TV en directo', subtitle: 'TDT',
    icon: ICONS.tv, colors: ['#2563eb', '#0891b2'] },
  firestick: { app: 'com.webos.app.hdmi2', label: 'Fire Stick', title: 'Fire Stick', subtitle: 'HDMI 2',
    icon: ICONS.firestick, colors: ['#ea580c', '#d97706'] },

  netflix: { app: 'netflix', label: 'Netflix', title: 'Netflix', subtitle: 'Streaming',
    image: 'icons/netflix.png', tile: '#ffffff', colors: ['#e50914', '#7f1d1d'] },
  hbomax: { app: 'com.wbd.stream', label: 'HBO Max', title: 'HBO Max', subtitle: 'Streaming',
    image: 'icons/hbomax.png', tile: '#00030c', colors: ['#4f46e5', '#1d4ed8'] },
  disney: { app: 'com.disney.disneyplus-prod', label: 'Disney+', title: 'Disney+', subtitle: 'Streaming',
    image: 'icons/disney.png', tile: '#054553', colors: ['#0e7490', '#1e40af'] },
  prime: { app: 'amazon', label: 'Prime Video', title: 'Prime Video', subtitle: 'Streaming',
    image: 'icons/prime.png', tile: '#0578ff', colors: ['#0578ff', '#0e7490'] },
  crunchyroll: { app: 'com.crunchyroll.webapp', label: 'Crunchyroll', title: 'Crunchyroll', subtitle: 'Streaming',
    image: 'icons/crunchyroll.png', tile: '#ff5e00', colors: ['#ff5e00', '#b45309'] },
  youtube: { app: 'youtube.leanback.v4', label: 'YouTube', title: 'YouTube', subtitle: 'Streaming',
    image: 'icons/youtube.png', tile: '#ffffff', colors: ['#dc2626', '#7f1d1d'] },
  appletv: { app: 'com.apple.appletv', label: 'Apple TV', title: 'Apple TV', subtitle: 'Streaming',
    image: 'icons/appletv.png', tile: '#000000', colors: ['#6b7280', '#1f2937'] },
  twitch: { app: 'tv.twitch.tv.starshot.lg', label: 'Twitch', title: 'Twitch', subtitle: 'Streaming',
    image: 'icons/twitch.png', tile: '#9146ff', colors: ['#9146ff', '#5b21b6'] },
  stremio: { app: 'io.strem.tv', label: 'Stremio', title: 'Stremio', subtitle: 'Películas y series',
    image: 'icons/stremio.png', tile: '#0f0e1c', colors: ['#7f5af0', '#1d4ed8'] },

  // El centro de control es otra app: flota sobre lo que se esté viendo (también se abrirá con el
  // botón de fuentes del mando).
  control: { app: 'org.mimenu.tvmenu.control', label: 'Control', title: 'Centro de control',
    subtitle: 'Fuentes, audio, apagar…', icon: ICONS.toggles, colors: ['#0ea5e9', '#475569'] },
  menusettings: { command: 'settings', label: 'Ajustes', title: 'Ajustes del menú',
    subtitle: 'Orden, sonidos, salvapantallas…', icon: ICONS.sliders, colors: ['#6366f1', '#475569'] },
  tvsettings: { app: 'com.palm.app.settings', label: 'Ajustes TV', title: 'Ajustes de la tele',
    subtitle: 'Imagen, sonido, red…', icon: ICONS.gear, colors: ['#64748b', '#334155'] },
  // Solo sin el menú como Home del sistema: entonces la cuadrícula ya muestra todas las apps.
  lghome: { app: 'com.webos.app.home', label: 'Apps de LG', title: 'Inicio de LG',
    subtitle: 'Todas las apps de la tele', icon: ICONS.apps, colors: ['#be123c', '#6b7280'] },
  homebrew: { app: 'org.webosbrew.hbchannel', label: 'Homebrew', title: 'Homebrew Channel', subtitle: 'Extras',
    image: 'icons/homebrew.png', tile: '#cf0652', colors: ['#cf0652', '#7e22ce'] },
  browser: { app: 'com.webos.app.browser', label: 'Navegador', title: 'Navegador web', subtitle: 'Extras',
    image: 'icons/browser.png', tile: '#5c75b8', colors: ['#5c75b8', '#334e9b'] },
};

// Orden por defecto: el Dock (sobre el cristal, bajo la franja superior) y, debajo, una cuadrícula
// como la de Apple TV con estos accesos seguidos de todas las demás apps instaladas (de LG y las
// que se instalen; claves "lp:<launchPointId>"). El usuario puede mover cualquiera entre los dos.
// Lo que no esté en el orden guardado se añade al final: los accesos nuevos del Dock, al Dock; las
// apps recién instaladas, a la cuadrícula.
const DOCK_DEFAULT = ['tv', 'firestick', 'appletv', 'twitch', 'stremio'];
const GRID_DEFAULT = ['control', 'netflix', 'hbomax', 'disney', 'prime', 'crunchyroll', 'youtube',
  'menusettings', 'tvsettings', 'lghome', 'homebrew', 'browser'];
const GRID_COLUMNS = 9;
// Apps que no se muestran: el propio menú y las que no se pueden desinstalar pero no se quieren.
const HIDDEN_APPS = new Set(['com.webos.app.home', 'org.mimenu.tvmenu', 'com.webos.app.lifeonscreen']);
// Las entradas (HDMI, AV…) tampoco: solo el Fire Stick tiene tarjeta propia.
const INPUT_APP = /^com\.webos\.app\.(hdmi|av|comp|scart)\d*$/;

const KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461 };
const DIR_KEYS = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
const REPEAT_MS = 140;  // ritmo máximo al mantener una flecha pulsada
const SAVER_OPTIONS = [3, 5, 10, 0];  // minutos sin usar el mando hasta esconder el menú (0 = nunca)
// as-home.sh monta una copia del menú como Home del sistema (com.webos.app.home).
const AS_HOME = location.pathname.includes('/com.webos.app.home/');

const root = document.documentElement;
const dock = document.getElementById('dock');
const reducedMotion = () => root.classList.contains('reduce-motion');
let debug = new Set();  // variantes en prueba ({"debug": ["minimal"]}): clases dbg-* en la página

function animate(el, keyframes, ms) {
  if (!reducedMotion()) el.animate(keyframes, { duration: ms, easing: EASE });
}

// localStorage puede fallar o venir vacío: el menú funciona igual con los valores por defecto.
const Store = {
  get(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* sin almacenamiento: el cambio dura hasta cerrar el menú */ }
  },
};

// Ajustes y orden de las tarjetas. Se guardan en la tele (vigilante homekey.py) porque el menú y su
// copia como Home tienen almacenamientos distintos; localStorage es solo una copia para arrancar
// sin esperar. Prefs.sync() trae la versión de la tele.
// Lo guardado puede venir estropeado (fichero editado a mano, versión antigua...): se queda solo lo
// que tiene la forma esperada, para que un dato raro no deje el menú sin dibujar.
function cleanPrefs(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    settings: d.settings && typeof d.settings === 'object' && !Array.isArray(d.settings) ? d.settings : {},
    order: Array.isArray(d.order)
      ? d.order.map((row) => (Array.isArray(row) ? row.filter((k) => typeof k === 'string') : []))
      : null,
  };
}

const Prefs = {
  data: cleanPrefs(Store.get('tvmenu.prefs', null)
    || { settings: Store.get('tvmenu.settings', {}), order: Store.get('tvmenu.order', null) }),
  // Hay algo guardado de verdad (y no solo valores por defecto) que merezca subirse a la tele.
  local: !!(Store.get('tvmenu.prefs', null) || Store.get('tvmenu.order', null) || Store.get('tvmenu.settings', null)),

  save() {
    this.local = true;
    Store.set('tvmenu.prefs', this.data);
    Watcher.post('/prefs', this.data).catch(() => {});
  },

  // Si la tele tiene preferencias distintas, se adoptan y se llama a onChange; si no tiene ninguna
  // (primera vez), se le mandan las locales, si las hay: unos valores por defecto nunca pisan los
  // de la otra copia del menú. Reintenta mientras el vigilante no responda (arranque).
  async sync(onChange, tries = 10) {
    try {
      const res = await Watcher.get('/prefs');
      const remote = cleanPrefs(res);
      if (!res.settings) {
        if (this.local) this.save();
      } else if (JSON.stringify(remote) !== JSON.stringify(this.data)) {
        this.data = remote;
        Store.set('tvmenu.prefs', remote);
        onChange();
      }
    } catch (e) {
      if (tries > 1) setTimeout(() => this.sync(onChange, tries - 1), 3000);
    }
  },
};

// weatherPlace/Lat/Lon: el lugar del tiempo; lo guarda tools/weather.sh desde el PC.
const DEFAULT_SETTINGS = { reduceMotion: false, sounds: true, saverMinutes: 3,
  weather: true, weatherPlace: '', weatherLat: 0, weatherLon: 0 };

// Los ajustes guardados que son del tipo que toca; el resto, por defecto.
function cleanSettings(saved) {
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (typeof saved[key] === typeof DEFAULT_SETTINGS[key]) out[key] = saved[key];
  }
  if (!SAVER_OPTIONS.includes(out.saverMinutes)) out.saverMinutes = DEFAULT_SETTINGS.saverMinutes;
  if (!(Math.abs(out.weatherLat) <= 90 && Math.abs(out.weatherLon) <= 180)) out.weatherPlace = '';
  return out;
}

const settings = cleanSettings(Prefs.data.settings);

// Los parámetros de lanzamiento (pruebas) mandan sobre los ajustes guardados.
function applySettings(overrides = {}) {
  root.classList.toggle('reduce-motion', overrides.reduceMotion ?? settings.reduceMotion);
  Sound.setEnabled(settings.sounds && !overrides.mute);
  Saver.setMinutes(settings.saverMinutes);
  const place = settings.weatherPlace ? { lat: settings.weatherLat, lon: settings.weatherLon } : null;
  Scene.configure({ place, weather: settings.weather });
}

// ---- Todas las apps instaladas (launch points de webOS) ----

// El motor web no deja leer ficheros de otras apps: los iconos los sirve el vigilante.
const iconUrl = (path) => (path ? Watcher.url(`/icon?path=${encodeURIComponent(path)}`) : '');

// Apps del sistema para la cuadrícula (las que no son ya un acceso propio de SECTIONS). Solo la
// copia del menú que hace de Home tiene permiso para pedir la lista; se guarda en localStorage para
// dibujar la cuadrícula sin esperar y webOS avisa de los cambios (Apps.watch).
const Apps = (() => {
  let list = Store.get('tvmenu.apps', []);  // [{key, id, title, icon, params}]
  const colors = Store.get('tvmenu.iconColors', {});  // icono -> color de su borde (muestreado)
  const curatedApps = new Set(Object.values(SECTIONS).map((s) => s.app).filter(Boolean));

  function apply(points) {
    const next = points
      .filter((lp) => lp && typeof lp.id === 'string' && !HIDDEN_APPS.has(lp.id) && !INPUT_APP.test(lp.id) && !curatedApps.has(lp.id))
      .map((lp) => ({ key: `lp:${lp.launchPointId || lp.id}`, id: lp.id, title: lp.title,
        icon: lp.largeIcon || lp.mediumIcon || lp.icon, params: lp.params || null }));
    if (JSON.stringify(next) === JSON.stringify(list)) return false;
    list = next;
    Store.set('tvmenu.apps', list);
    return true;
  }

  // Suscripción a la lista de apps: webOS avisa cuando se instala o se quita una, así que al
  // volver al menú no hay nada que pedir. Llama a onChange cuando la lista cambia.
  function watch(onChange) {
    if (!AS_HOME) return;
    const uri = 'luna://com.webos.applicationManager/listLaunchPoints';
    const update = (res) => {
      if (res.returnValue && Array.isArray(res.launchPoints) && apply(res.launchPoints)) onChange();
    };
    Luna.subscribe(uri, { subscribe: true }, (res) => {
      if (res.launchPoints) update(res);
      else Luna.call(uri, {}, update);  // aviso de un cambio: se vuelve a leer la lista entera
    });
  }

  // El icono va sobre el color de su propio borde, para que no se note su cuadrado. El color se lee del icono la primera vez y se guarda.
  function paintTile(app, slot, img) {
    if (colors[app.icon]) {
      slot.style.setProperty('--tile-bg', colors[app.icon]);
      return;
    }
    img.addEventListener('load', () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const g = canvas.getContext('2d');
        g.drawImage(img, 1, 1, 1, 1, 0, 0, 1, 1);  // un píxel junto a la esquina
        const [r, gr, b, a] = g.getImageData(0, 0, 1, 1).data;
        if (a < 200) return;  // icono con fondo transparente: queda el color neutro
        colors[app.icon] = `rgb(${r}, ${gr}, ${b})`;
        Store.set('tvmenu.iconColors', colors);
        slot.style.setProperty('--tile-bg', colors[app.icon]);
      } catch (e) { /* sin acceso al píxel: queda el color neutro */ }
    }, { once: true });
  }

  return {
    watch,
    paintTile,
    get: (key) => list.find((a) => a.key === key),
    keys: () => list.map((a) => a.key),
  };
})();

// ---- Tarjetas, Dock y cuadrícula ----

const dockTrack = () => dock.querySelector('.track');
const gridTrack = () => document.querySelector('#grid .track');

// Tarjeta de un acceso de SECTIONS o de una app del sistema ("lp:..."); null si ya no existe.
function buildSlot(key) {
  const section = SECTIONS[key];
  const app = section ? null : Apps.get(key);
  if (!section && !app) return null;
  const slot = document.createElement('div');
  slot.className = 'slot';
  slot.dataset.focusable = '';
  slot.dataset.action = key;
  let art = '<img alt="">';
  if (app) {
    slot.style.setProperty('--tile-bg', '#2a2f3a');
  } else if (section.image) {
    slot.style.setProperty('--tile-bg', section.tile);
  } else {
    const [c1, c2] = section.colors;
    slot.style.setProperty('--tile-bg', `linear-gradient(135deg, ${c1}, ${c2})`);
    art = section.icon;
  }
  slot.innerHTML = `<div class="tile"><div class="tile-face"><div class="tile-art">${art}</div></div></div>`
    + '<div class="tile-label"></div>';
  slot.querySelector('.tile-label').textContent = section ? section.label : app.title;
  const img = slot.querySelector('.tile-art img');
  // Sin el icono (app/icons sale de tools/fetch_icons.sh), la tarjeta queda con su color y su nombre.
  if (img) {
    img.decoding = 'async';  // decodificar decenas de iconos no retiene el primer fotograma
    img.onerror = () => img.remove();
  }
  if (app) {
    img.crossOrigin = 'anonymous';  // para poder leer el color de su borde
    img.src = iconUrl(app.icon);
    Apps.paintTile(app, slot, img);
  } else if (section.image) {
    img.src = section.image;
  }
  return slot;
}

// Accesos que existen ahora (el de "Apps de LG" sobra cuando el menú es el Home del sistema).
function availableKeys() {
  const own = Object.keys(SECTIONS).filter((k) => !(AS_HOME && SECTIONS[k].app === 'com.webos.app.home'));
  return [...own, ...Apps.keys()];
}

// Orden guardado [Dock, cuadrícula]; en el formato antiguo (Dock y varias filas debajo) todas
// las filas de debajo forman la cuadrícula.
function savedRows() {
  const order = Prefs.data.order || [];
  return [order[0] || [], order.slice(1).flat()];
}

// El orden guardado y, al final, lo que no estuviera en él: los accesos de DOCK_DEFAULT al Dock;
// el resto (y las apps recién instaladas), a la cuadrícula. El Dock nunca queda vacío.
function layoutRows() {
  const available = new Set(availableKeys());
  const seen = new Set();
  const take = (k) => available.has(k) && !seen.has(k) && seen.add(k);
  const rows = savedRows().map((keys) => keys.filter(take));
  DOCK_DEFAULT.filter(take).forEach((k) => rows[0].push(k));
  [...GRID_DEFAULT, ...available].filter(take).forEach((k) => rows[1].push(k));
  if (!rows[0].length) rows[0] = rows[1].splice(0, 1);
  return rows;
}

function saveOrder() {
  const rows = [dockTrack(), gridTrack()].map((t) => Array.from(t.children, (slot) => slot.dataset.action));
  // Las apps que ahora no se muestran (desinstaladas, o lista aún sin cargar) conservan su sitio.
  const shown = new Set(rows.flat());
  savedRows().forEach((keys, i) => keys.forEach((k) => {
    if (!shown.has(k)) rows[i].push(k);
  }));
  Prefs.data.order = rows;
  Prefs.save();
}

function buildRows() {
  const [dockKeys, gridKeys] = layoutRows();
  for (const [track, keys] of [[dockTrack(), dockKeys], [gridTrack(), gridKeys]]) {
    for (const key of keys) {
      const slot = buildSlot(key);
      if (slot) track.appendChild(slot);
    }
  }
  // La página (capa que se desplaza) tiene que abarcar toda la cuadrícula.
  const grid = document.getElementById('grid');
  document.getElementById('page').style.height = `${grid.offsetTop + grid.offsetHeight + 200}px`;
}

// La tarjeta de una clave (las de las apps del sistema pueden llevar cualquier carácter).
const slotOf = (key) => (typeof key === 'string' ? document.querySelector(`[data-action="${CSS.escape(key)}"]`) : null);

// Reconstruye el Dock y la cuadrícula (al llegar el orden de la tele, al cambiar las apps
// instaladas o al restablecer el orden), manteniendo el foco en el mismo acceso si sigue existiendo.
function rebuildRows() {
  const focused = Focus.current() && Focus.current().dataset.action;
  dockTrack().replaceChildren();
  gridTrack().replaceChildren();
  setTrackX(dockTrack(), 0);
  lastDockSlot = null;
  buildRows();
  Focus.set(slotOf(focused) || dock.querySelector('[data-focusable]'));
}

// Vuelve al orden por defecto.
function resetOrder() {
  Prefs.data.order = null;
  Prefs.save();
  rebuildRows();
}

// Ancho visible de una fila (el Dock tiene margen interior dentro del cristal).
function rowView(track) {
  const row = track.parentElement;
  const style = getComputedStyle(row);
  return row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
}

function setTrackX(track, x) {
  if (String(x) === (track.dataset.x || '0')) return;
  track.dataset.x = x;
  track.style.translate = `${x}px 0`;
}

// Desplazamiento horizontal de una fila para que la tarjeta enfocada quede dentro de los márgenes.
function revealInRow(slot) {
  const track = slot.parentElement;
  const view = rowView(track);
  const left = slot.offsetLeft;
  const right = left + slot.offsetWidth;
  let x = Number(track.dataset.x || 0);
  if (left + x < 0) x = -left;
  else if (right + x > view) x = view - right;
  setTrackX(track, x);
}

// Tras sacar una tarjeta de una fila desplazada, que no quede un hueco al final.
function clampRow(track) {
  const last = track.lastElementChild;
  const content = last ? last.offsetLeft + last.offsetWidth : 0;
  const min = Math.min(0, rowView(track) - content);
  if (Number(track.dataset.x || 0) < min) setTrackX(track, min);
}

// La página sube para mostrar la cuadrícula cuando el foco sale del Dock.
function setPageMode(inDock) {
  root.classList.toggle('in-grid', !inDock);
}

// Desplazamiento vertical de la página: 0 con el foco en el Dock; en la cuadrícula, lo justo para
// que la fila enfocada se vea entera (como al bajar por las apps de Apple TV).
const GRID_TOP = 120;     // px desde arriba donde queda la primera fila al bajar del Dock
const GRID_BOTTOM = 80;   // margen inferior
let pageY = 0;

function setPageY(y) {
  if (y === pageY) return;
  pageY = y;
  document.getElementById('page').style.translate = `0 ${y}px`;
}

function revealInGrid(slot) {
  const top = document.getElementById('grid').offsetTop + slot.offsetTop;
  const bottom = top + slot.offsetHeight + 40;  // con la etiqueta
  let y = pageY || GRID_TOP - document.getElementById('grid').offsetTop;
  if (top + y < GRID_TOP) y = GRID_TOP - top;
  else if (bottom + y > 1080 - GRID_BOTTOM) y = 1080 - GRID_BOTTOM - bottom;
  setPageY(y);
}

function reveal(slot) {
  if (dock.contains(slot)) {
    setPageY(0);
    revealInRow(slot);
  } else {
    revealInGrid(slot);
  }
}

// ---- Efectos de foco ----

// Rebote en el borde: no hay nada en esa dirección y el foco se queda donde está.
function bump(el, [dx, dy]) {
  animate(el.querySelector('.tile') || el,
    [{ translate: '0 0' }, { translate: `${dx * 14}px ${dy * 14}px`, offset: 0.35 }, { translate: '0 0' }], 280);
  Sound.play('bump');
}

function press(el) {
  const target = el.querySelector('.tile') || el;
  const scale = getComputedStyle(target).scale;
  animate(target, [{ scale }, { scale: 0.95, offset: 0.4 }, { scale }], 240);
}

let toastTimer;
function toast(text) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('on'), 4000);
}

// ---- Capas superpuestas: Atrás cierra la de arriba ----

const Overlay = (() => {
  const stack = [];

  function open(el, initial) {
    el.classList.add('open');
    stack.push(el);
    Focus.pushScope(el, initial);
    Sound.play('open');
  }

  function close(silent = false) {
    const el = stack.pop();
    if (!el) return false;
    el.classList.remove('open');
    Focus.popScope();
    if (!silent) Sound.play('close');
    return true;
  }

  function closeAll() {
    while (close(true));
  }

  return { open, close, closeAll };
})();

// ---- Ajustes del menú ----

// El vigilante veta el salvapantallas de LG solo si el nuestro está activado: se lo decimos.
function syncSaver() {
  Watcher.post(`/saver/${settings.saverMinutes ? 'on' : 'off'}`).catch(() => { /* lo guarda de antes */ });
}

const SettingsPanel = (() => {
  const panel = document.getElementById('settings');
  const confirm = document.getElementById('confirm');
  let menuIsHome = null;  // null: el vigilante no responde

  const value = (command) => panel.querySelector(`[data-command="${command}"] .value`);
  const yesNo = (on) => (on ? 'Sí' : 'No');

  function render() {
    value('sounds').textContent = yesNo(settings.sounds);
    value('saver').textContent = settings.saverMinutes ? `${settings.saverMinutes} min` : 'Nunca';
    value('reduceMotion').textContent = yesNo(settings.reduceMotion);
    value('weather').textContent = !settings.weatherPlace ? 'Sin lugar'
      : settings.weather ? settings.weatherPlace : 'No';
    value('home').textContent = menuIsHome === null ? 'No disponible' : menuIsHome ? 'Mi Menú' : 'Inicio de LG';
  }

  async function refreshHome() {
    try {
      menuIsHome = (await Watcher.get('/status')).menuIsHome;
    } catch (e) {
      menuIsHome = null;
    }
    render();
  }

  function open() {
    render();
    Overlay.open(panel);
    refreshHome();
  }

  function save(on) {
    Prefs.data.settings = { ...settings };
    Prefs.save();
    applySettings();
    syncSaver();
    render();
    Sound.play(on ? 'on' : 'off');
  }

  function toggle(name) {
    settings[name] = !settings[name];
    save(settings[name]);
  }

  function cycleSaver() {
    const i = SAVER_OPTIONS.indexOf(settings.saverMinutes);
    settings.saverMinutes = SAVER_OPTIONS[(i + 1) % SAVER_OPTIONS.length];
    save(settings.saverMinutes > 0);
  }

  // El lugar se elige desde el PC (hace falta un teclado para buscarlo); aquí se enciende o apaga.
  function toggleWeather() {
    if (settings.weatherPlace) toggle('weather');
    else toast('Elige el lugar desde el PC: tools/weather.sh "tu ciudad"');
  }

  // "La tecla Home abre": volver a Mi Menú es inmediato; pasar al inicio de LG pide confirmación
  // (con el foco en Cancelar).
  function home() {
    if (menuIsHome === false) setHome(true);
    else Overlay.open(confirm, confirm.querySelector('[data-command="cancel"]'));
  }

  async function setHome(menu) {
    try {
      menuIsHome = (await Watcher.post(menu ? '/home/menu' : '/home/lg')).menuIsHome;
      render();
    } catch (e) {
      if (menu) {
        toast('El vigilante de la tecla Home no responde');
        return;
      }
      toast('No se pudo guardar: el inicio de LG se abre solo esta vez');
    }
    if (menu) {
      Sound.play('on');
      toast('La tecla Home vuelve a abrir Mi Menú');
      return;
    }
    Overlay.closeAll();
    Sound.play('select');
    // Si el menú es el Home del sistema, el vigilante lo desmonta y abre él el de LG.
    if (!AS_HOME) Luna.launch('com.webos.app.home');
  }

  return { open, toggle, cycleSaver, toggleWeather, home, setHome };
})();

// ---- Modo reordenar: OK coge/suelta una tarjeta y las flechas la mueven por su fila o a otra ----

const Reorder = (() => {
  const banner = document.getElementById('banner');
  const HINT = 'Elige un acceso y pulsa OK para moverlo · Atrás para terminar';
  let active = false;
  let holding = null;

  function say(text) {
    banner.textContent = text;
    banner.classList.toggle('on', !!text);
  }

  function start() {
    active = true;
    root.classList.add('reordering');
    say(HINT);
  }

  function drop() {
    holding.classList.remove('holding');
    holding = null;
    saveOrder();
    say(HINT);
    Sound.play('drop');
  }

  function exit() {
    if (!active) return false;
    if (holding) drop();
    active = false;
    root.classList.remove('reordering');
    say('');
    return true;
  }

  function toggleHold(slot) {
    if (holding) {
      drop();
      return;
    }
    holding = slot;
    slot.classList.add('holding');
    say('Flechas para moverlo, también a otra fila · OK para soltar');
    Sound.play('pick');
  }

  // Cambia el DOM y anima las tarjetas afectadas desde donde estaban (FLIP).
  function flip(slots, mutate) {
    const before = new Map(slots.map((s) => [s, s.getBoundingClientRect()]));
    mutate();
    for (const s of slots) {
      const a = before.get(s);
      const b = s.getBoundingClientRect();
      const dx = a.left - b.left;
      const dy = a.top - b.top;
      if (dx || dy) animate(s, [{ translate: `${dx}px ${dy}px` }, { translate: '0 0' }], 280);
    }
  }

  function edge(dir) {
    bump(holding, Focus.VEC[dir]);
    return true;
  }

  // Dónde entra la tarjeta cogida al cambiar entre el Dock y la cuadrícula: en la columna más
  // cercana (antes de la primera tarjeta cuyo centro no quede más de media tarjeta a su
  // izquierda). En la cuadrícula, solo dentro de su primera fila.
  function insertionPoint(container) {
    const center = (el) => {
      const r = el.getBoundingClientRect();
      return r.left + r.width / 2;
    };
    const x = center(holding) - holding.offsetWidth / 2;
    const all = Array.from(container.children).filter((s) => s !== holding);
    const pool = container === gridTrack() ? all.slice(0, GRID_COLUMNS) : all;
    return pool.find((s) => center(s) > x) || all[pool.length] || null;
  }

  // ←/→ intercambia con la vecina. ↑/↓: en la cuadrícula sube o baja una fila (de GRID_COLUMNS
  // en GRID_COLUMNS); desde su primera fila sube al Dock, y desde el Dock baja a esa fila.
  // Ni el Dock ni la cuadrícula pueden quedarse vacíos.
  function move(dir) {
    if (!holding) return false;
    const track = holding.parentElement;
    const inGrid = track === gridTrack();
    let target = track;
    let before;
    if (dir === 'left' || dir === 'right') {
      const neighbour = dir === 'left' ? holding.previousElementSibling : holding.nextElementSibling;
      if (!neighbour) return edge(dir);
      before = dir === 'left' ? neighbour : neighbour.nextElementSibling;
    } else if (!inGrid) {
      if (dir === 'up' || track.children.length === 1) return edge(dir);
      target = gridTrack();
      before = insertionPoint(target);
    } else {
      const rest = Array.from(track.children).filter((s) => s !== holding);
      const index = Array.from(track.children).indexOf(holding);
      if (dir === 'up' && index < GRID_COLUMNS) {
        if (!rest.length) return edge(dir);
        target = dockTrack();
        before = insertionPoint(target);
      } else {
        // Posición de destino en la cuadrícula; sin la tarjeta cogida, entra antes de rest[to].
        const to = index + (dir === 'up' ? -GRID_COLUMNS : GRID_COLUMNS);
        if (to < 0 || to >= track.children.length) return edge(dir);
        before = rest[to] || null;
      }
    }
    const slots = target === track ? [...track.children] : [...track.children, ...target.children];
    flip(slots, () => {
      target.insertBefore(holding, before);
      setPageMode(dock.contains(holding));
      clampRow(dockTrack());
      reveal(holding);
    });
    Sound.play('shift');
    return true;
  }

  // Atrás: suelta la tarjeta cogida o, si no hay ninguna, sale del modo.
  function back() {
    if (!active) return false;
    if (holding) {
      drop();
    } else {
      exit();
      Sound.play('back');
    }
    return true;
  }

  return { start, exit, toggleHold, move, back, active: () => active };
})();

// ---- Acciones ----

const COMMANDS = {
  settings: () => SettingsPanel.open(),
  reorder: () => {
    Overlay.close(true);
    Reorder.start();
    Sound.play('select');
  },
  sounds: () => SettingsPanel.toggle('sounds'),
  saver: () => SettingsPanel.cycleSaver(),
  reduceMotion: () => SettingsPanel.toggle('reduceMotion'),
  weather: () => SettingsPanel.toggleWeather(),
  home: () => SettingsPanel.home(),
  lgHome: () => SettingsPanel.setHome(false),
  cancel: () => Overlay.close(),
};

function activate(el) {
  if (!el) return;
  if (Reorder.active()) {
    if (el.dataset.action) Reorder.toggleHold(el);
    return;
  }
  const section = SECTIONS[el.dataset.action];
  const app = section ? null : Apps.get(el.dataset.action);
  const command = el.dataset.command || (section && section.command);
  press(el);
  if (command) {
    COMMANDS[command](el);
  } else if (section || app) {
    Sound.play('select');
    const request = section ? { id: section.app } : { id: app.id, ...(app.params ? { params: app.params } : {}) };
    Luna.call('luna://com.webos.applicationManager/launch', request, (res) => {
      if (!res.returnValue) {
        toast(`No se pudo abrir ${section ? section.label : app.title}: ${res.errorText || res.errorCode}`);
      }
    });
  }
}

function step(dir) {
  if (Focus.move(dir)) Sound.play('move');
  else bump(Focus.current(), Focus.VEC[dir]);
}

let lastDockSlot = null;

// Vuelve a la pantalla principal (Home, o Atrás desde la cuadrícula): cierra overlays, sale del
// modo reordenar y deja el foco en el Dock donde estaba.
function goHome() {
  Overlay.closeAll();
  Reorder.exit();
  Focus.reset();
  if (!dock.contains(Focus.current())) {
    Focus.set(dock.contains(lastDockSlot) ? lastDockSlot : dock.querySelector('[data-focusable]'));
  }
}

// Home con el menú ya en pantalla: al principio, la primera tarjeta del Dock (como en Apple TV).
function goToStart() {
  const first = dock.querySelector('[data-focusable]');
  const moved = Focus.current() !== first;
  goHome();
  Focus.set(first);
  if (moved) Sound.play('back');
}

// Atrás retrocede un nivel: overlay → modo reordenar → cuadrícula → Dock.
function back() {
  if (Overlay.close() || Reorder.back()) return;
  if (dock.contains(Focus.current())) {
    bump(Focus.current(), Focus.VEC.up);  // ya en la pantalla principal: no hay más atrás
    return;
  }
  goHome();
  Sound.play('back');
}

Focus.onChange((el) => {
  if (!el.classList.contains('slot')) return;  // filas de los ajustes: sin efectos de tarjeta
  const inDock = dock.contains(el);
  if (inDock) lastDockSlot = el;
  setPageMode(inDock);
  reveal(el);
});

let lastMove = 0;

// Gestiona una tecla del mando; devuelve true si la ha usado.
function handleKey(code, repeat = false) {
  const dir = DIR_KEYS[code];
  if (dir) {
    const now = performance.now();
    if (repeat && now - lastMove < REPEAT_MS) return true;
    lastMove = now;
    if (!Reorder.move(dir)) step(dir);
  } else if (code === KEY.OK) {
    activate(Focus.current());
  } else if (code === KEY.BACK) {
    back();
  } else {
    return false;
  }
  return true;
}

document.addEventListener('keydown', (e) => {
  if (handleKey(e.keyCode, e.repeat)) e.preventDefault();
});

// Puntero del Magic Remote: pasar por encima enfoca (sigue siendo foco discreto), clic activa;
// un clic en la zona oscura alrededor de un panel lo cierra. Las filas que no están a la vista no
// se pueden señalar: la rueda y los bordes superior/inferior de la pantalla cambian de fila.
const POINTER_EDGE = 40;  // px desde el borde de la pantalla
let lastPointerStep = 0;

function pointerStep(dir) {
  const now = performance.now();
  if (now - lastPointerStep < 600) return;  // un paso por gesto
  lastPointerStep = now;
  handleKey(dir === 'up' ? KEY.UP : KEY.DOWN);
}

document.addEventListener('wheel', (e) => {
  if (e.deltaY) pointerStep(e.deltaY > 0 ? 'down' : 'up');
}, { passive: true });

document.addEventListener('mousemove', (e) => {
  const inGrid = root.classList.contains('in-grid');
  if (!inGrid && e.clientY > 1080 - POINTER_EDGE) pointerStep('down');
  else if (inGrid && e.clientY < POINTER_EDGE) pointerStep('up');
});

document.addEventListener('mouseover', (e) => {
  const el = e.target.closest('[data-focusable]');
  if (el) Focus.set(el);
});
document.addEventListener('click', (e) => {
  if (e.target.classList.contains('overlay')) {
    Overlay.close();
    return;
  }
  const el = e.target.closest('[data-focusable]');
  if (!el) return;
  Focus.set(el);
  activate(el);
});

// ---- Modo de prueba: recorre el foco solo y mide los fotogramas ----

const Bench = (() => {
  // Recorrido por las tres filas, con desplazamientos laterales, cambios de fila y rebotes.
  const TOUR = ['right', 'right', 'right', 'right', 'down', 'right', 'right', 'right', 'right', 'right',
    'down', 'left', 'left', 'up', 'left', 'left', 'left', 'left', 'up', 'left', 'left', 'left', 'up', 'left'];
  const panel = document.getElementById('bench');

  // opts.delay: esperar antes de medir (p. ej. para medir un rato después de volver de una app).
  function run(opts) {
    if (opts.delay) {
      setTimeout(() => run({ ...opts, delay: 0 }), opts.delay);
      return;
    }
    const moves = opts.moves || TOUR.length;
    const interval = opts.interval || 450;
    const frames = [];
    const latency = [];  // ms desde cada pulsación hasta que su fotograma está en pantalla
    let last = 0;
    let running = true;
    let i = 0;

    goHome();
    Focus.set(dock.querySelector('[data-focusable]'));
    panel.hidden = false;
    panel.textContent = 'Midiendo…';
    requestAnimationFrame(function tick(t) {
      if (last) frames.push(t - last);
      last = t;
      if (running) requestAnimationFrame(tick);
    });

    const timer = setInterval(() => {
      const t0 = performance.now();
      step(TOUR[i % TOUR.length]);
      requestAnimationFrame(() => requestAnimationFrame(() => latency.push(performance.now() - t0)));
      if (++i >= moves) {
        clearInterval(timer);
        setTimeout(finish, 700);
      }
    }, interval);

    function finish() {
      running = false;
      frames.sort((a, b) => a - b);
      const avg = frames.reduce((s, f) => s + f, 0) / frames.length;
      const result = {
        fps: +(1000 / avg).toFixed(1),
        p95: +frames[Math.floor(frames.length * 0.95)].toFixed(1),
        worst: +frames[frames.length - 1].toFixed(1),
        janky: frames.filter((f) => f > 25).length,
        frames: frames.length,
      };
      const mean = latency.reduce((s, f) => s + f, 0) / (latency.length || 1);
      panel.textContent = `${reducedMotion() ? 'Sin' : 'Con'} animaciones`
        + `${debug.size ? ` · ${[...debug].join(', ')}` : ''}\n`
        + `${result.fps} fps de media\n`
        + `p95 ${result.p95} ms · peor ${result.worst} ms\n`
        + `${result.janky} de ${result.frames} fotogramas > 25 ms\n`
        + `tecla → pantalla: ${Math.round(mean)} ms de media · peor ${Math.round(Math.max(0, ...latency))} ms`;
    }
  }

  return { run, hide: () => { panel.hidden = true; } };
})();

// ---- Arranque y relanzamiento ----

// Parámetros de lanzamiento (para pruebas por SSH, ver tools/launch.sh):
//   {"action": "tv"} pulsa ese acceso; {"focus": "netflix"} solo lo enfoca;
//   {"keys": ["down", "ok", "back"]} simula teclas del mando (las teclas inyectadas no llegan a la app);
//   {"saver": true} esconde el menú como en reposo; {"resetOrder": true} vuelve al orden por defecto;
//   {"bench": {}} mide; {"reduceMotion": true} fuerza ese modo;
//   {"debug": ["minimal"]} activa variantes de prueba (clases dbg-* en la página).
// Con "keys" o "bench" el menú no suena (son pruebas).
const KEY_NAMES = { left: KEY.LEFT, up: KEY.UP, right: KEY.RIGHT, down: KEY.DOWN, ok: KEY.OK, back: KEY.BACK };

// Cualquier app puede lanzar el menú con los parámetros que quiera: todo lo que no tenga la forma
// esperada se ignora.
function launchParams() {
  try {
    const params = JSON.parse((window.PalmSystem && PalmSystem.launchParams) || '{}');
    return params && typeof params === 'object' && !Array.isArray(params) ? params : {};
  } catch (e) {
    return {};
  }
}

function applyParams(params) {
  if (params.resetOrder) resetOrder();
  applySettings({ ...params, mute: !!(params.keys || params.bench) });
  for (const name of debug) root.classList.remove(`dbg-${name}`);
  debug = new Set((Array.isArray(params.debug) ? params.debug : []).filter((name) => /^[\w-]+$/.test(name)));
  for (const name of debug) root.classList.add(`dbg-${name}`);
  Bench.hide();
  const target = params.action || params.focus;
  const el = slotOf(target);
  if (el) {
    Focus.set(el);
    if (params.action) activate(el);
  }
  if (params.bench) Bench.run(typeof params.bench === 'object' ? params.bench : {});
  if (params.saver) Saver.start();
  (Array.isArray(params.keys) ? params.keys : []).forEach((name, i) => setTimeout(() => handleKey(KEY_NAMES[name]), 400 * (i + 1)));
}

let shownSince = performance.now();  // desde cuándo se ve el menú (Home con él delante: ir al principio)
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) shownSince = performance.now();
});

// Preferencias guardadas en la tele: si difieren de las locales, se aplican y se rehacen las filas.
function syncPrefs() {
  Prefs.sync(() => {
    Object.assign(settings, cleanSettings(Prefs.data.settings));
    applySettings();
    syncSaver();
    rebuildRows();
  });
}

// La tecla Home relanza la app (webOS, si es el Home del sistema; si no, homekey.py): volver a la
// pantalla principal, con las preferencias al día por si se cambiaron desde la otra copia del menú.
// Si el menú ya estaba delante (y no el salvapantallas), Home lleva al principio del Dock. Con el menú
// delante webOS no lo relanza: lo hace el filtro de teclas (keyfilter.js) con {"home": true}.
document.addEventListener('webOSRelaunch', () => {
  const inMenu = !Saver.active() && (launchParams().home === true
    || (!document.hidden && performance.now() - shownSince > 500));
  Saver.stop();
  if (inMenu) goToStart();
  else goHome();
  applyParams(launchParams());
  syncPrefs();
});

// Medición del arranque, en ms desde que el motor web empieza a cargar la página.
function showTiming(builtMs) {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const firstFrameMs = performance.now();
    setTimeout(() => {
      const nav = performance.getEntriesByType('navigation')[0] || {};
      const panel = document.getElementById('bench');
      panel.hidden = false;
      panel.textContent = `HTML y CSS leídos: ${Math.round(nav.domInteractive || 0)} ms\n`
        + `Scripts cargados: ${Math.round(SCRIPT_START_MS)} ms\n`
        + `Menú construido: ${Math.round(builtMs)} ms\n`
        + `Primer fotograma: ${Math.round(firstFrameMs)} ms`;
    }, 3000);
  }));
}

Focus.setRoot(document.getElementById('page'));
buildRows();
Saver.init();
Scene.init();
syncSaver();
goHome();
applyParams(launchParams());
syncPrefs();
Apps.watch(rebuildRows);
if (launchParams().timing) showTiming(performance.now());
