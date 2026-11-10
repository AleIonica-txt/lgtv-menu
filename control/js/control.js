// Centro de control: apagar, pantalla, audio y cambio de fuente, flotando sobre lo que se esté
// viendo. Lo abre y cierra el botón de fuentes del mando con el parámetro de lanzamiento "action":
// toggle (filtro de teclas keyfilter.js), open, close o focus (los usa el vigilante homekey.py si
// el filtro no está) y preload (cargarlo oculto al arrancar). Lee el estado con luna (permitido a
// la app) y lo que no tiene permiso para cambiar lo hace el vigilante (/control/...).
// Al cerrarse no termina: se oculta (webOSSystem.hide) para que la siguiente vez salga al instante.

const KEY = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 461 };
const root = document.documentElement;
const sys = window.webOSSystem || window.PalmSystem;

const SVG = (body) => '<svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="3.4" '
  + `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = {
  power: SVG('<path d="M32 10v20"/><path d="M19 18a18 18 0 1 0 26 0"/>'),
  wifi: SVG('<path d="M8 26a34 34 0 0 1 48 0"/><path d="M16 34a22 22 0 0 1 32 0"/><path d="M24 42a10 10 0 0 1 16 0"/><circle cx="32" cy="50" r="2" fill="currentColor"/>'),
  screenoff: SVG('<rect x="7" y="13" width="50" height="32" rx="5"/><path d="M24 53h16"/><path d="M12 8l40 44"/>'),
  speaker: SVG('<path d="M10 25h9l12-10v34L19 39h-9z"/><path d="M41 24a11 11 0 0 1 0 16"/><path d="M47 18a19 19 0 0 1 0 28"/>'),
  tv: SVG('<rect x="7" y="17" width="50" height="33" rx="6"/><path d="M23 6l9 10 9-10"/><path d="M24 57h16"/>'),
  hdmi: SVG('<path d="M10 22h44v12l-6 8H16l-6-8z"/><path d="M20 30h24"/>'),
  check: SVG('<path d="M14 33l12 12 24-26"/>'),
};

const SOUND_OUTPUTS = [
  ['tv_speaker', 'Altavoces de la TV'],
  ['external_optical', 'Óptico'],
  ['external_arc', 'HDMI ARC'],
  ['bt_soundbar', 'Bluetooth'],
];

// La tele tarda en dar por hecho el cambio de salida de audio: leerla antes devuelve la anterior.
const SOUND_SETTLE_MS = 2000;

const $ = (sel) => document.querySelector(sel);
const panel = $('#panel');
const audio = $('#audio');
let isOpen = false;
let focusPending = false;  // al abrir, el foco va a las fuentes (lo más usado) hasta la primera tecla
let powerTimer;
let powerArmedAt = 0;
let testMode = false;  // abierto con teclas simuladas: apagar y apagar pantalla no hacen nada
let soundOutput = '';
let soundChangedAt = 0;
let closeTimer;

for (const el of document.querySelectorAll('[data-icon]')) el.innerHTML = ICONS[el.dataset.icon];
$('#status-wifi').innerHTML = ICONS.wifi;

// Órdenes al vigilante que no esperan respuesta (si no está, no hay nada que hacer).
const tell = (path, body) => Watcher.post(path, body).catch(() => {});

function launchParams() {
  try {
    const params = JSON.parse((sys && sys.launchParams) || '{}');
    return params && typeof params === 'object' ? params : {};
  } catch (e) {
    return {};
  }
}

// ---- Estado (se relee cada vez que se abre) ----

function tick() {
  const now = new Date();
  $('#clock').textContent = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
}

function loadInputs() {
  Luna.call('luna://com.webos.service.eim/getAllInputStatus', {}, (res) => {
    const devices = (Array.isArray(res.devices) ? res.devices : []).filter((d) => d && typeof d.appId === 'string');
    const items = [{ appId: 'com.webos.app.livetv', name: 'TV', icon: 'tv', signal: false }]
      .concat(devices.map((d) => ({ appId: d.appId, name: `HDMI ${d.port}`, icon: 'hdmi', signal: !!d.hdmiSignalExist })))
      .slice(0, 4);
    renderInputs(items);
    focusStart();
  });
}

// Si las fuentes no cambian, se actualizan en su sitio: el foco nunca debe quedar en una tarjeta
// borrada (desde ahí, la siguiente flecha saltaría a la primera de todas: Apagar).
function renderInputs(items) {
  const box = $('.inputs');
  const same = box.children.length === items.length
    && items.every((item, i) => box.children[i].dataset.app === item.appId);
  if (!same) {
    const focusedApp = Focus.current() && Focus.current().dataset.app;
    box.innerHTML = '';
    for (const item of items) {
      const el = document.createElement('div');
      el.className = 'input';
      el.dataset.focusable = '';
      el.dataset.app = item.appId;
      el.innerHTML = `<span class="icon">${ICONS[item.icon]}</span><span></span>`;
      el.lastChild.textContent = item.name;
      box.appendChild(el);
    }
    if (focusedApp) Focus.set(box.querySelector(`[data-app="${CSS.escape(focusedApp)}"]`) || box.firstChild);
  }
  items.forEach((item, i) => box.children[i].classList.toggle('signal', item.signal));
  markCurrentInput();
}

// Foco inicial: la entrada que se está viendo, o la primera.
function focusStart() {
  if (!focusPending) return;
  const el = $('.input.current') || $('.input');
  if (el) Focus.set(el);
}

let currentApp = '';
function markCurrentInput() {
  for (const el of document.querySelectorAll('.input')) el.classList.toggle('current', el.dataset.app === currentApp);
}

function outputName(id) {
  const found = SOUND_OUTPUTS.find(([key]) => key === id);
  return found ? found[1] : id;
}

function showSound(id) {
  soundOutput = id;
  $('#audio-tile small').textContent = outputName(id);
}

function loadSound() {
  if (performance.now() - soundChangedAt < SOUND_SETTLE_MS) return;  // aún daría la anterior
  Luna.call('luna://com.webos.service.audio/getSoundOutput', {}, (res) => {
    if (res.soundOutput && performance.now() - soundChangedAt >= SOUND_SETTLE_MS) showSound(res.soundOutput);
  });
}

// La entrada que se está viendo (la app no tiene permiso para leerla) y los ajustes del menú que
// también valen aquí: los da el vigilante en una sola petición.
function loadState() {
  Watcher.get('/control').then((res) => {
    // El panel es una capa: la app en primer plano sigue siendo la que se estaba viendo.
    currentApp = res.foreground || '';
    markCurrentInput();
    focusStart();
    const s = res.settings || {};
    root.classList.toggle('reduce-motion', !!s.reduceMotion);
    Sound.setEnabled(s.sounds !== false);
  }).catch(() => {});
}

function loadWifi() {
  Luna.call('luna://com.webos.service.connectionmanager/getStatus', {}, (res) => {
    const wifi = res.wifi || {};
    const wired = res.wired || {};
    $('#wifi small').textContent = wired.state === 'connected' ? 'Cable' : wifi.state === 'connected' ? wifi.ssid : 'Sin conexión';
  });
}

// ---- Abrir y cerrar ----

// El vigilante necesita saber si está abierto: el botón de fuentes lo abre o lo cierra.
function report() {
  tell('/control/state', { open: isOpen });
}

function open() {
  clearTimeout(closeTimer);
  tick();
  focusPending = true;
  resetPower();
  focusStart();
  loadState();
  loadInputs();
  loadSound();
  loadWifi();
  closeAudio(true);
  isOpen = true;
  report();
  requestAnimationFrame(() => root.classList.add('open'));
  Sound.play('open');
}

// Apagar pide una segunda pulsación (un toque sin querer no apaga la tele).
function resetPower() {
  clearTimeout(powerTimer);
  const tile = $('.tile.power');
  tile.classList.remove('confirm');
  tile.querySelector('.name').textContent = 'Apagar';
}

// "then": lo que hacer cuando el panel ya no se ve (p. ej. cambiar de fuente).
function close(then, sound = 'close') {
  if (!isOpen) return;
  isOpen = false;
  report();
  root.classList.remove('open');
  Sound.play(sound);
  const ms = root.classList.contains('reduce-motion') ? 0 : 230;
  closeTimer = setTimeout(() => {
    if (sys && sys.hide) sys.hide();
    if (then) then();
  }, ms);
}

function openAudio() {
  const list = audio.querySelector('.list');
  list.innerHTML = '';
  for (const [id, name] of SOUND_OUTPUTS) {
    const row = document.createElement('div');
    row.className = 'row' + (id === soundOutput ? ' selected' : '');
    row.dataset.focusable = '';
    row.dataset.output = id;
    row.innerHTML = `<span>${name}</span><span class="check">${ICONS.check}</span>`;
    list.appendChild(row);
  }
  panel.classList.add('away');
  audio.classList.add('on');
  Focus.pushScope(audio, list.querySelector('.selected') || list.firstChild);
  Sound.play('open');
}

function closeAudio(silent) {
  if (!audio.classList.contains('on')) return false;
  audio.classList.remove('on');
  panel.classList.remove('away');
  Focus.popScope();
  if (!silent) Sound.play('back');
  return true;
}

// ---- Acciones ----

function activate(el) {
  if (el.dataset.app) {
    const app = el.dataset.app;
    close(() => Luna.launch(app), 'select');
    return;
  }
  if (el.dataset.output) {
    // Se muestra la elegida sin esperar: la tele tarda un poco en confirmarla.
    soundChangedAt = performance.now();
    showSound(el.dataset.output);
    for (const row of audio.querySelectorAll('.row')) row.classList.toggle('selected', row === el);
    Sound.play('on');
    tell('/control/sound', { output: el.dataset.output });
    setTimeout(() => closeAudio(true), 250);
    return;
  }
  switch (el.dataset.command) {
    case 'power':
      // La confirmación necesita una pulsación nueva, no un rebote de la primera.
      if (el.classList.contains('confirm') && performance.now() - powerArmedAt > 350) {
        close(() => testMode || tell('/control/power'), 'off');
      } else if (!el.classList.contains('confirm')) {
        powerArmedAt = performance.now();
        el.classList.add('confirm');
        el.querySelector('.name').textContent = 'OK para apagar';
        Sound.play('bump');
        powerTimer = setTimeout(resetPower, 4000);
      }
      break;
    case 'screenoff':
      close(() => testMode || tell('/control/screenoff'), 'off');
      break;
    case 'audio':
      openAudio();
      break;
    default:
  }
}

function handleKey(code) {
  if (!isOpen) return false;
  focusPending = false;
  // Sin foco válido, la primera tecla solo lo pone en las fuentes (nunca actúa a ciegas).
  if (!Focus.current() || !document.body.contains(Focus.current())) {
    focusPending = true;
    focusStart();
    focusPending = false;
    return true;
  }
  const dirs = { [KEY.LEFT]: 'left', [KEY.UP]: 'up', [KEY.RIGHT]: 'right', [KEY.DOWN]: 'down' };
  if (dirs[code]) {
    Sound.play(Focus.move(dirs[code]) ? 'move' : 'bump');
  } else if (code === KEY.OK) {
    if (Focus.current()) activate(Focus.current());
  } else if (code === KEY.BACK) {
    if (!closeAudio()) close();
  } else {
    return false;
  }
  return true;
}

document.addEventListener('keydown', (e) => {
  if (handleKey(e.keyCode)) e.preventDefault();
});

// Puntero del mando: pasar por encima enfoca y pulsar activa; pulsar fuera del panel lo cierra.
const pointable = (target) => {
  const el = target.closest && target.closest('[data-focusable]');
  const scope = audio.classList.contains('on') ? audio : panel;
  return el && scope.contains(el) ? el : null;
};

document.addEventListener('mousemove', (e) => {
  const el = isOpen && pointable(e.target);
  if (el && el !== Focus.current()) {
    focusPending = false;
    Focus.set(el);
  }
});

document.addEventListener('click', (e) => {
  if (!isOpen) return;
  const el = pointable(e.target);
  if (el) {
    focusPending = false;
    Focus.set(el);
    activate(el);
  } else if (!e.target.closest('#panel, .sub, #status')) {
    close();
  }
});

// Pruebas: las teclas simuladas no llegan a las apps web, así que se pasan al lanzar
// ({"keys": ["down", "ok", "back"]}, una cada 400 ms). En una prueba nunca se apaga nada.
function replayKeys(keys) {
  const names = { left: KEY.LEFT, up: KEY.UP, right: KEY.RIGHT, down: KEY.DOWN, ok: KEY.OK, back: KEY.BACK };
  keys.forEach((k, i) => setTimeout(() => handleKey(names[k]), 600 + i * 400));
}

function hideNow() {
  isOpen = false;
  root.classList.remove('open');
  if (sys && sys.hide) sys.hide();
  report();
}

// Cada lanzamiento (el primero y los siguientes, con webOSRelaunch) trae su acción.
function onLaunch(first) {
  const params = launchParams();
  testMode = Array.isArray(params.keys);
  switch (params.action) {
    case 'preload':  // cargado al arrancar la tele, sin mostrarse
      if (first || !isOpen) hideNow();
      break;
    case 'close':
      if (isOpen) close();
      else hideNow();
      break;
    case 'toggle':  // botón de fuentes (filtro de teclas de keyfilter.js)
      if (!isOpen) {
        open();
        break;
      }
      // Una capa del sistema pudo taparlo sin que la página se enterase: el vigilante lo sabe.
      Watcher.get('/control/state').then((res) => {
        if (res.open === false) open();
        else close();
      }, () => close());
      break;
    case 'focus':  // ya está abierto (el lanzamiento le devuelve el foco) o se abre ahora
      if (!isOpen) open();
      break;
    default:
      open();
      if (testMode) replayKeys(params.keys);
  }
}

Focus.setRoot(panel);
Focus.onChange((el, prev) => {
  if (prev && prev.classList.contains('power')) resetPower();
});
if (sys && sys.keepAlive) sys.keepAlive(true);
document.addEventListener('webOSRelaunch', () => onLaunch(false));
// Si la tele lo pone en segundo plano (p. ej. con la tecla Home), queda cerrado para la próxima vez.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && isOpen) {
    isOpen = false;
    root.classList.remove('open');
    report();
  }
});
onLaunch(true);
