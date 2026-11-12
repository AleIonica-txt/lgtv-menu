// Fondo del menú: el bosque con niebla a pantalla completa, con la hora en grande detrás de las
// colinas, la fecha y el tiempo. El paisaje, el recorte de su relieve y la idea vienen de couch-tv
// (github.com/Seagey/couch-tv, MIT; el paisaje se generó para ese proyecto y es de uso libre).
// Se dibuja en lienzos y no como imagen: una imagen a pantalla completa se vuelve a decodificar
// cada vez que se vuelve al menú (tirones de medio segundo en esta tele), un lienzo no.
//   - Un lienzo opaco con la foto, dibujado una sola vez.
//   - Un lienzo pequeño, solo en la zona de la hora: los dígitos rellenos con una copia desenfocada
//     de la foto ("cristal") y, encima, el relieve recortado. Se redibuja una vez por minuto.

// El tiempo, de Open-Meteo (sin cuenta ni clave). El lugar lo guarda tools/weather.sh en los ajustes.
const Weather = (() => {
  const REFRESH_MS = 30 * 60000;
  const STALE_MS = 3 * 3600000;  // con más de 3 horas ya no se muestra
  const TEXT = { 0: 'Despejado', 1: 'Poco nuboso', 2: 'Intervalos nubosos', 3: 'Nublado', 45: 'Niebla', 48: 'Niebla',
    51: 'Llovizna', 53: 'Llovizna', 55: 'Llovizna', 56: 'Llovizna', 57: 'Llovizna', 61: 'Lluvia débil', 63: 'Lluvia',
    65: 'Lluvia fuerte', 66: 'Lluvia', 67: 'Lluvia', 71: 'Nieve débil', 73: 'Nieve', 75: 'Nieve fuerte', 77: 'Nieve',
    80: 'Chubascos', 81: 'Chubascos', 82: 'Chubascos fuertes', 85: 'Nieve', 86: 'Nieve', 95: 'Tormenta',
    96: 'Tormenta', 99: 'Tormenta' };
  const SVG = (body) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" `
    + `stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  const CLOUD = '<path d="M7 18h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 11.1 3.5 3.5 0 0 0 7 18z"/>';
  const ICONS = {
    sun: SVG('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
    moon: SVG('<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'),
    cloud: SVG(CLOUD),
    rain: SVG('<path d="M7 15h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 8.1 3.5 3.5 0 0 0 7 15z"/><path d="M8.5 18l-1 2.5M12.5 18l-1 2.5M16.5 18l-1 2.5"/>'),
    storm: SVG('<path d="M7 15h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 8.1 3.5 3.5 0 0 0 7 15z"/><path d="M12.5 15.5l-2 3.5h3l-2 3.5"/>'),
    snow: SVG('<path d="M7 15h10a4 4 0 0 0 .6-7.96A6 6 0 0 0 6.1 8.1 3.5 3.5 0 0 0 7 15z"/><path d="M8.5 19h.01M12 20.5h.01M15.5 19h.01"/>'),
    fog: SVG('<path d="M4 9h16M4 13h16M6 17h12"/>'),
  };
  let place = null;  // { lat, lon } o null (sin lugar o con el tiempo desactivado)
  let last = null;   // { at, lat, lon, temp, code, day }
  let loaded = false;
  let busy = false;
  let onChange = () => {};

  const samePlace = () => last && place && last.lat === place.lat && last.lon === place.lon;

  // El último dato, si es de este lugar y reciente.
  function current() {
    if (!loaded) {
      loaded = true;
      last = Store.get('tvmenu.weather', null);
    }
    return samePlace() && Date.now() - last.at < STALE_MS ? last : null;
  }

  async function refresh() {
    if (!place || busy || document.hidden) return;
    current();
    if (samePlace() && Date.now() - last.at < REFRESH_MS) return;
    busy = true;
    const asked = place;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast'
        + `?latitude=${asked.lat}&longitude=${asked.lon}&current=temperature_2m,weather_code,is_day&timezone=auto`,
        { signal: ctrl.signal });
      const c = (await res.json()).current;
      if (!c || typeof c.temperature_2m !== 'number') throw new Error('respuesta sin datos');
      last = { at: Date.now(), lat: asked.lat, lon: asked.lon, temp: Math.round(c.temperature_2m),
        code: Math.round(c.weather_code), day: !!c.is_day };
      Store.set('tvmenu.weather', last);
      onChange();
    } catch (e) { /* sin red: se queda el dato anterior mientras sea reciente */ } finally {
      clearTimeout(timer);
      busy = false;
    }
  }

  function icon(w) {
    const c = w.code;
    if (c <= 1) return w.day ? ICONS.sun : ICONS.moon;
    if (c <= 3) return ICONS.cloud;
    if (c <= 48) return ICONS.fog;
    if (c >= 95) return ICONS.storm;
    if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ICONS.snow;
    return ICONS.rain;
  }

  return {
    current,
    refresh,
    setPlace(next) {
      place = next;
      refresh();
    },
    html: (w) => `${icon(w)}${w.temp}° ${TEXT[w.code] || ''}`,
    onChange: (fn) => { onChange = fn; },
  };
})();

const Scene = (() => {
  const W = 1920;
  const H = 1080;
  const PAD = 48;  // margen del lienzo de la hora
  const FONT = 'Antonio';
  // Dónde va la hora (px a 1920x1080; la línea base de los dígitos queda en top + 0,92·size) y
  // cómo se rellena: oscura sobre el cielo claro de la niebla, con un borde de luz.
  const CLOCK = { left: 96, top: 172, size: 470, fill: 'brightness(0.46) saturate(0.8) contrast(1.1)',
    fillAlpha: 0.8, rim: 'rgba(255, 255, 255, 0.6)' };

  const box = document.getElementById('scene');
  const dateline = document.getElementById('dateline');
  const bg = document.createElement('canvas');
  const clock = document.createElement('canvas');
  bg.className = 'scene-bg';
  clock.className = 'scene-clock';
  box.append(bg, clock);
  const scale = Math.min(2, window.devicePixelRatio || 1);  // la tele pinta a 4K: dígitos nítidos
  let rect = null;   // zona de la hora
  let glass = null;  // trozo desenfocado de la foto con que se rellenan los dígitos
  let fg = null;     // trozo del relieve que va por delante de la hora
  let hm = '';
  let clockTimer;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(src));
      img.src = src;
    });
  }

  function clockFont(g) {
    g.font = `300 ${CLOCK.size}px ${FONT}, "Arial Narrow", sans-serif`;
    g.letterSpacing = `${-0.02 * CLOCK.size}px`;
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
  }

  // Zona de la pantalla que ocupa la hora (con margen), para cualquier combinación de dígitos.
  function clockRect() {
    const g = document.createElement('canvas').getContext('2d');
    clockFont(g);
    const digit = Math.max(...'0123456789'.split('').map((d) => g.measureText(d).width));
    const x = CLOCK.left - PAD;
    const y = CLOCK.top - 16;
    const w = Math.min(W - x, Math.ceil(4 * digit + g.measureText(':').width) + 2 * PAD);
    return { x, y, w, h: Math.round(CLOCK.top + 0.92 * CLOCK.size + PAD) - y };
  }

  // El trozo de una imagen de pantalla completa que cae en la zona de la hora, en un lienzo propio.
  function crop(img, filter) {
    const c = document.createElement('canvas');
    c.width = rect.w;
    c.height = rect.h;
    const g = c.getContext('2d');
    const kx = img.naturalWidth / W;
    const ky = img.naturalHeight / H;
    if (filter) g.filter = filter;
    g.drawImage(img, rect.x * kx, rect.y * ky, rect.w * kx, rect.h * ky, 0, 0, rect.w, rect.h);
    return c;
  }

  function paintBackground(photo) {
    bg.width = W;
    bg.height = H;
    // willReadFrequently: el lienzo vive en memoria normal y no en la gráfica, que lo suelta
    // mientras el menú está oculto y tarda en reconstruirlo al volver.
    const g = bg.getContext('2d', { alpha: false, willReadFrequently: true });
    g.drawImage(photo, 0, 0, W, H);
    const grad = g.createLinearGradient(0, 0, 0, H);  // para que el Dock se lea
    grad.addColorStop(0.6, 'rgba(0, 0, 0, 0)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  // La hora: dígitos de cristal con un borde de luz y el relieve por delante.
  function drawClock() {
    if (!rect || !hm) return;
    const cw = Math.round(rect.w * scale);
    const ch = Math.round(rect.h * scale);
    const x = CLOCK.left - rect.x;
    const y = CLOCK.top + 0.92 * CLOCK.size - rect.y;
    if (clock.width !== cw || clock.height !== ch) {
      clock.width = cw;
      clock.height = ch;
    }
    const g = clock.getContext('2d', { willReadFrequently: true });
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.scale(scale, scale);
    clockFont(g);
    g.fillText(hm, x, y);
    g.globalCompositeOperation = 'source-in';
    g.globalAlpha = CLOCK.fillAlpha;
    g.drawImage(glass, 0, 0, rect.w, rect.h);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.lineWidth = 1.5;
    g.strokeStyle = CLOCK.rim;
    g.strokeText(hm, x, y);
    g.drawImage(fg, 0, 0, rect.w, rect.h);
  }

  function drawDate() {
    const date = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
    const w = Weather.current();
    dateline.querySelector('.date').textContent = date.charAt(0).toUpperCase() + date.slice(1);
    dateline.querySelector('.wx').innerHTML = w ? Weather.html(w) : '';
  }

  // Una vez por minuto (y al volver a verse el menú): hora, fecha y tiempo.
  function tick() {
    clearTimeout(clockTimer);
    if (document.hidden) return;
    const now = new Date();
    const text = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (text !== hm) {
      hm = text;
      drawClock();
    }
    drawDate();
    Weather.refresh();
    clockTimer = setTimeout(tick, 60000 - now.getSeconds() * 1000 - now.getMilliseconds() + 50);
  }

  async function init() {
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) tick();
    });
    Weather.onChange(drawDate);
    tick();
    // La fuente de la hora se carga desde aquí: en el paquete el CSS va dentro del HTML y una ruta
    // relativa en @font-face no valdría para las dos formas de abrir el menú.
    const face = new FontFace(FONT, 'url(fonts/antonio-latin-300.woff2)', { weight: '300' });
    try {
      const [photo, glassImg, fgImg] = await Promise.all([
        loadImage('scenes/scene-fog.jpg'),
        loadImage('scenes/scene-fog-glass.jpg'),
        loadImage('scenes/scene-fog-fg.webp'),
        face.load().then((f) => document.fonts.add(f)).catch(() => {}),
      ]);
      rect = clockRect();
      glass = crop(glassImg, CLOCK.fill);
      fg = crop(fgImg, '');
      paintBackground(photo);
      Object.assign(clock.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` });
      drawClock();
      bg.classList.add('on');
      clock.classList.add('on');
    } catch (e) { /* falta algún fichero del paisaje: queda el fondo liso con la fecha */ }
  }

  // place: { lat, lon } o null; weather: si se muestra el tiempo.
  function configure(next) {
    Weather.setPlace(next.weather ? next.place : null);
    drawDate();
  }

  return { init, configure };
})();
