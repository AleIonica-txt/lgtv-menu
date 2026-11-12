// Fondo del menú: un paisaje a pantalla completa con la hora en grande detrás de su relieve, la
// fecha y el tiempo. El paisaje sigue al sol (amanecer, día, atardecer, noche; de día, niebla si
// está cubierto o llueve) o va rotando, según el ajuste "Paisaje".
// Los paisajes, el recorte de su relieve y la idea vienen de couch-tv (github.com/Seagey/couch-tv,
// MIT); aquí se dibujan en lienzos y no como imágenes: una imagen a pantalla completa se vuelve a
// decodificar cada vez que se vuelve al menú (tirones de medio segundo en esta tele), un lienzo no.
//   - Un lienzo opaco con la foto y sus sombreados, dibujado una vez por paisaje.
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
  const PAD = 48;                    // margen del lienzo de la hora (para su sombra)
  const ROTATE_MS = 10 * 60000;      // modo "rotar": un paisaje cada 10 minutos
  const QUIET_MS = 5000;             // el paisaje no cambia mientras se usa el mando (cuesta un tirón)
  const FONT = 'Antonio';
  // Códigos del tiempo (WMO) con el cielo cubierto, niebla o lluvia: de día, paisaje de niebla.
  const GREY_SKY = [3, 45, 48, 51, 53, 55, 61, 63, 65, 80, 81, 82];
  // Cada paisaje: si tiene recorte del relieve (fg), dónde va la hora (top y size en px a 1920x1080;
  // centrada salvo "left") y cómo se rellena; la línea base de los dígitos queda en top + 0,92·size.
  const DEFS = {
    night: { fg: true, top: 150, size: 400, dim: 0.86, fill: 'brightness(1.15) saturate(1.2)', fillAlpha: 0.9,
      rim: 'rgba(255, 215, 225, 0.5)', dateTop: 96, dateColor: 'rgba(255, 232, 238, 0.92)' },
    golden: { fg: true, top: 152, size: 390, dateTop: 106 },
    // La hora se apoya en el agua: por debajo de la línea de agua se ve desenfocada, como un reflejo.
    water: { fg: false, top: 268, size: 420, waterline: 0.55, dateTop: 216,
      shade: [[0, 'rgba(0, 12, 24, 0.42)'], [0.4, 'rgba(0, 12, 24, 0.12)'], [0.52, 'rgba(0, 0, 0, 0)'], [1, 'rgba(0, 20, 40, 0.5)']] },
    fog: { fg: true, left: 96, top: 172, size: 470, fill: 'brightness(0.46) saturate(0.8) contrast(1.1)', fillAlpha: 0.8,
      rim: 'rgba(255, 255, 255, 0.6)', sheen: false, shadow: false, dateTop: 116, dateLeft: 104, dateColor: '#16201d' },
    dawn: { fg: true, top: 230, size: 400, dateTop: 176,
      shade: [[0, 'rgba(50, 28, 12, 0.42)'], [0.55, 'rgba(50, 28, 12, 0)']] },
  };
  const ORDER = ['dawn', 'water', 'golden', 'night', 'fog'];

  const box = document.getElementById('scene');
  const dateline = document.getElementById('dateline');
  // Dos juegos de lienzos para fundir un paisaje con el siguiente; el que no se ve queda en 1x1.
  const sets = [0, 1].map(() => {
    const bg = document.createElement('canvas');
    const clock = document.createElement('canvas');
    bg.className = 'scene-bg';
    clock.className = 'scene-clock';
    bg.width = bg.height = clock.width = clock.height = 1;
    box.append(bg, clock);
    return { bg, clock, def: null, rect: null, glass: null, fg: null };
  });
  const scale = Math.min(2, window.devicePixelRatio || 1);  // la tele pinta a 4K: dígitos nítidos
  let front = 0;
  let shown = null;      // nombre del paisaje en pantalla
  let loading = false;
  let hm = '';
  let mode = 'sun';
  let place = null;      // { lat, lon } para el sol
  let rotateAt = Date.now();
  let rotateIndex = 0;
  let lastInput = 0;
  let visibleSince = 0;
  let clockTimer;
  let retryTimer;
  let font;

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(src));
      img.src = src;
    });
  }

  // ---- Qué paisaje toca ----

  // Altura del sol sobre el horizonte, en grados, y si es antes del mediodía solar.
  function sun(lat, lon, d) {
    const start = Date.UTC(d.getUTCFullYear(), 0, 0);
    const day = Math.floor((d - start) / 86400000);
    const b = (360 / 365.25) * (day - 81) * (Math.PI / 180);
    const eot = 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
    const decl = 23.45 * Math.sin(b) * (Math.PI / 180);
    const utc = d.getUTCHours() + d.getUTCMinutes() / 60;
    const solarTime = (utc + lon / 15 + eot / 60 + 24) % 24;
    const hourAngle = (solarTime - 12) * 15 * (Math.PI / 180);
    const la = lat * (Math.PI / 180);
    const sin = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(hourAngle);
    return { alt: Math.asin(Math.max(-1, Math.min(1, sin))) * (180 / Math.PI), morning: hourAngle < 0 };
  }

  function wanted() {
    const now = new Date();
    if (mode === 'rotate') {
      if (Date.now() - rotateAt >= ROTATE_MS) {
        rotateAt = Date.now();
        rotateIndex += 1;
      }
      return ORDER[rotateIndex % ORDER.length];
    }
    let phase;
    if (place) {
      const s = sun(place.lat, place.lon, now);
      phase = s.alt < -6 ? 'night' : s.alt < 10 ? (s.morning ? 'dawn' : 'golden') : 'day';
    } else {  // sin lugar: por la hora del reloj
      const h = now.getHours();
      phase = h >= 5 && h < 8 ? 'dawn' : h >= 8 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'golden' : 'night';
    }
    if (phase !== 'day') return phase;
    const w = Weather.current();
    return w && GREY_SKY.includes(w.code) ? 'fog' : 'water';
  }

  // ---- Dibujo ----

  function clockFont(g, def) {
    g.font = `300 ${def.size}px ${FONT}, "Arial Narrow", sans-serif`;
    g.letterSpacing = `${-0.02 * def.size}px`;
    g.textBaseline = 'alphabetic';
    g.textAlign = def.left === undefined ? 'center' : 'left';
  }

  // Zona de la pantalla que ocupa la hora (con margen), para cualquier combinación de dígitos.
  function clockRect(def) {
    const g = document.createElement('canvas').getContext('2d');
    clockFont(g, def);
    const digit = Math.max(...'0123456789'.split('').map((d) => g.measureText(d).width));
    const width = Math.ceil(4 * digit + g.measureText(':').width) + 2 * PAD;
    const x = Math.max(0, Math.round(def.left === undefined ? (W - width) / 2 : def.left - PAD));
    const y = Math.max(0, def.top - 16);
    return { x, y, w: Math.min(width, W - x), h: Math.round(def.top + 0.92 * def.size + PAD) - y };
  }

  // El trozo de una imagen de pantalla completa que cae en la zona de la hora, en un lienzo propio.
  function crop(img, rect, filter) {
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

  function gradient(g, stops) {
    const grad = g.createLinearGradient(0, 0, 0, H);
    for (const [at, color] of stops) grad.addColorStop(at, color);
    g.fillStyle = grad;
    g.fillRect(0, 0, W, H);
  }

  function paintBackground(canvas, def, photo) {
    canvas.width = W;
    canvas.height = H;
    // willReadFrequently: el lienzo vive en memoria normal y no en la gráfica, que lo suelta
    // mientras el menú está oculto y tarda en reconstruirlo al volver.
    const g = canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    if (def.dim) g.filter = `brightness(${def.dim})`;
    g.drawImage(photo, 0, 0, W, H);
    g.filter = 'none';
    if (def.shade) gradient(g, def.shade);
    gradient(g, [[0.6, 'rgba(0, 0, 0, 0)'], [1, 'rgba(0, 0, 0, 0.5)']]);  // para que el Dock se lea
  }

  // Dibuja la hora en el lienzo de un juego: dígitos de cristal, su sombra y el relieve por delante.
  function drawClock(set) {
    const { def, rect, clock } = set;
    if (!def || !hm) return;
    const cw = Math.round(rect.w * scale);
    const ch = Math.round(rect.h * scale);
    const x = (def.left === undefined ? W / 2 : def.left) - rect.x;
    const y = def.top + 0.92 * def.size - rect.y;

    // Los dígitos, aparte: relleno de cristal, brillo y borde de luz.
    const ink = document.createElement('canvas');
    ink.width = cw;
    ink.height = ch;
    const g = ink.getContext('2d');
    g.scale(scale, scale);
    clockFont(g, def);
    g.fillText(hm, x, y);
    g.globalCompositeOperation = 'source-in';
    g.globalAlpha = def.fillAlpha || 1;
    g.drawImage(set.glass, 0, 0, rect.w, rect.h);
    g.globalAlpha = 1;
    if (def.sheen !== false) {
      g.globalCompositeOperation = 'source-atop';
      const sheen = g.createLinearGradient(0, 0, rect.w * 0.35, rect.h);
      sheen.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      sheen.addColorStop(0.38, 'rgba(255, 255, 255, 0)');
      sheen.addColorStop(0.7, 'rgba(255, 255, 255, 0)');
      sheen.addColorStop(1, 'rgba(255, 255, 255, 0.22)');
      g.fillStyle = sheen;
      g.fillRect(0, 0, rect.w, rect.h);
    }
    g.globalCompositeOperation = 'source-over';
    g.lineWidth = 1.5;
    g.strokeStyle = def.rim || 'rgba(255, 255, 255, 0.55)';
    g.strokeText(hm, x, y);

    if (clock.width !== cw || clock.height !== ch) {
      clock.width = cw;
      clock.height = ch;
    }
    const c = clock.getContext('2d', { willReadFrequently: true });
    c.clearRect(0, 0, cw, ch);
    if (def.waterline) {
      const line = Math.round((H * def.waterline - rect.y) * scale);
      c.drawImage(ink, 0, 0, cw, line, 0, 0, cw, line);
      c.save();
      c.beginPath();
      c.rect(0, line, cw, ch - line);
      c.clip();
      c.filter = `blur(${2.2 * scale}px)`;
      c.globalAlpha = 0.78;
      c.drawImage(ink, 5 * scale, 0);
      c.restore();
    } else {
      c.drawImage(ink, 0, 0);
    }
    if (def.shadow !== false) {
      // Solo la sombra: los dígitos se dibujan fuera del lienzo y su sombra cae dentro, por debajo.
      c.save();
      c.globalCompositeOperation = 'destination-over';
      c.shadowColor = 'rgba(0, 0, 0, 0.16)';
      c.shadowBlur = 28 * scale;
      c.shadowOffsetX = 2 * cw;
      c.shadowOffsetY = 6 * scale;
      c.drawImage(ink, -2 * cw, 0);
      c.restore();
    }
    if (set.fg) c.drawImage(set.fg, 0, 0, cw, ch);
    ink.width = ink.height = 0;  // suelta su memoria ya
  }

  function drawDate() {
    const def = sets[front].def;
    if (!def) return;
    const date = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', '');
    const w = Weather.current();
    dateline.querySelector('.date').textContent = date.charAt(0).toUpperCase() + date.slice(1);
    dateline.querySelector('.wx').innerHTML = w ? Weather.html(w) : '';
    dateline.style.top = `${def.dateTop}px`;
    dateline.style.color = def.dateColor || '';
    dateline.style.textAlign = def.dateLeft ? 'left' : '';
    dateline.style.left = def.dateLeft ? `${def.dateLeft}px` : '';
    dateline.classList.toggle('plain', !!def.dateLeft && def.dateColor === '#16201d');
  }

  // Carga un paisaje en el juego de lienzos libre y lo funde sobre el actual.
  async function show(name) {
    if (loading || name === shown) return;
    loading = true;
    try {
      const def = DEFS[name];
      const [photo, glass, fg] = await Promise.all([
        loadImage(`scenes/scene-${name}.jpg`),
        loadImage(`scenes/scene-${name}-glass.jpg`),
        def.fg ? loadImage(`scenes/scene-${name}-fg.webp`) : null,
        font,
      ]);
      const prev = sets[front];
      const next = sets[1 - front];
      next.def = def;
      next.rect = clockRect(def);
      next.glass = crop(glass, next.rect, def.fill);
      next.fg = fg ? crop(fg, next.rect, def.dim ? `brightness(${def.dim})` : '') : null;
      paintBackground(next.bg, def, photo);
      Object.assign(next.clock.style, { left: `${next.rect.x}px`, top: `${next.rect.y}px`,
        width: `${next.rect.w}px`, height: `${next.rect.h}px` });
      drawClock(next);
      // El nuevo aparece por encima del anterior, que sigue opaco debajo hasta que acaba el fundido.
      prev.bg.style.zIndex = 0;
      prev.clock.style.zIndex = 1;
      next.bg.style.zIndex = 2;
      next.clock.style.zIndex = 3;
      void next.bg.offsetWidth;  // aplicar la opacidad 0 antes de activar el fundido
      next.bg.classList.add('on');
      next.clock.classList.add('on');
      front = 1 - front;
      shown = name;
      drawDate();
      setTimeout(() => {
        if (sets[front] === prev) return;
        prev.bg.classList.remove('on');
        prev.clock.classList.remove('on');
        prev.bg.width = prev.bg.height = prev.clock.width = prev.clock.height = 1;
        prev.def = prev.glass = prev.fg = null;
      }, 1500);
    } catch (e) {
      // Falta algún fichero del paisaje: se queda el que había (o el fondo liso).
    } finally {
      loading = false;
    }
  }

  // Cambia de paisaje si toca y no molesta: ni mientras se usa el mando ni nada más volver al menú.
  function update() {
    clearTimeout(retryTimer);
    if (document.hidden) return;
    const name = wanted();
    if (name === shown) return;
    const now = performance.now();
    if (shown && (now - lastInput < QUIET_MS || now - visibleSince < QUIET_MS)) {
      retryTimer = setTimeout(update, QUIET_MS);
      return;
    }
    show(name);
  }

  // Una vez por minuto (y al volver a verse el menú): hora, fecha, tiempo y paisaje.
  function tick() {
    clearTimeout(clockTimer);
    if (document.hidden) return;
    const now = new Date();
    const text = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (text !== hm) {
      hm = text;
      drawClock(sets[front]);
    }
    drawDate();
    Weather.refresh();
    update();
    clockTimer = setTimeout(tick, 60000 - now.getSeconds() * 1000 - now.getMilliseconds() + 50);
  }

  function init() {
    // La fuente de la hora se carga desde aquí: en el paquete el CSS va dentro del HTML y una ruta
    // relativa en @font-face no valdría para las dos formas de abrir el menú.
    const face = new FontFace(FONT, 'url(fonts/antonio-latin-300.woff2)', { weight: '300' });
    font = face.load().then((f) => document.fonts.add(f)).catch(() => {});
    window.addEventListener('keydown', () => { lastInput = performance.now(); }, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) return;
      visibleSince = performance.now();
      tick();
    });
    Weather.onChange(() => {
      drawDate();
      update();
    });
    tick();
  }

  // mode: 'sun' o 'rotate'. place: { lat, lon } o null. weather: si se muestra el tiempo.
  function configure(next) {
    mode = next.mode;
    place = next.place;
    Weather.setPlace(next.weather ? next.place : null);
    if (shown) {
      drawDate();
      update();
    }
  }

  return { init, configure };
})();
