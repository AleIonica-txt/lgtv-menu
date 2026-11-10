// Salvapantallas: fotos de lugares (PHOTOS, de photos.js) con zoom lento, fundidos, la hora y el
// nombre del lugar. El de LG no choca con él: mientras el menú está en pantalla con este activado, lo veta el
// vigilante homekey.py (la app web no tiene permiso para responder a tvpower); fuera del menú, o
// con este desactivado, el de LG funciona como siempre.
const Saver = (() => {
  const SHOW_MS = 20000;  // tiempo por foto
  const FADE_MS = 2000;   // fundido entre fotos (igual que la transición CSS)
  const el = document.getElementById('saver');
  const imgs = Array.from(el.querySelectorAll('img'));
  const time = el.querySelector('.saver-time');
  const date = el.querySelector('.saver-date');
  const place = el.querySelector('.saver-place');
  let minutes = 0;
  let active = false;
  let front = 0;
  let index = Math.floor(Math.random() * PHOTOS.length);
  let idleTimer;
  let slideTimer;
  let clockTimer;

  function schedule() {
    clearTimeout(idleTimer);
    if (minutes > 0 && !active && !document.hidden) idleTimer = setTimeout(start, minutes * 60000);
  }

  function tick() {
    const now = new Date();
    time.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    date.textContent = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    clockTimer = setTimeout(tick, 60000 - now.getSeconds() * 1000 - now.getMilliseconds() + 50);
  }

  // Carga la siguiente foto en la capa oculta, la decodifica y la funde sobre la actual.
  async function nextPhoto() {
    const photo = PHOTOS[index++ % PHOTOS.length];
    const img = imgs[1 - front];
    img.getAnimations().forEach((a) => a.cancel());
    img.src = photo.src;
    try {
      await img.decode();
    } catch (e) {
      // Foto que no está (se descargan con tools/fetch_photos.py): se sigue con la hora sola.
      if (active) slideTimer = setTimeout(nextPhoto, SHOW_MS);
      return;
    }
    if (!active) return;
    imgs[front].classList.remove('on');
    front = 1 - front;
    img.classList.add('on');
    place.textContent = photo.place;
    if (!reducedMotion()) {
      const dx = Math.round((Math.random() - 0.5) * 60);
      const dy = Math.round((Math.random() - 0.5) * 40);
      img.animate([{ scale: 1, translate: '0 0' }, { scale: 1.12, translate: `${dx}px ${dy}px` }],
        { duration: SHOW_MS + 2 * FADE_MS, easing: 'linear', fill: 'forwards' });
    }
    slideTimer = setTimeout(nextPhoto, SHOW_MS);
  }

  function start() {
    if (active || document.hidden) return;
    active = true;
    tick();
    el.classList.add('on');
    nextPhoto();
    // Con el salvapantallas ya opaco, el menú de debajo deja de componerse (ahorra GPU).
    setTimeout(() => active && root.classList.add('saver-covering'), FADE_MS);
  }

  // Devuelve true si estaba activo.
  function stop() {
    if (!active) return false;
    active = false;
    clearTimeout(slideTimer);
    clearTimeout(clockTimer);
    root.classList.remove('saver-covering');
    el.classList.remove('on');
    setTimeout(() => {
      if (active) return;
      for (const img of imgs) {  // liberar la memoria de las fotos
        img.getAnimations().forEach((a) => a.cancel());
        img.classList.remove('on');
        img.removeAttribute('src');
      }
    }, FADE_MS);
    schedule();
    return true;
  }

  function init() {
    // Cualquier tecla solo despierta (no llega al menú); el puntero también despierta.
    window.addEventListener('keydown', (e) => {
      if (stop()) {
        e.preventDefault();
        e.stopImmediatePropagation();
      } else {
        schedule();
      }
    }, true);
    window.addEventListener('mousemove', () => {
      if (!stop()) schedule();
    }, true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stop();
        clearTimeout(idleTimer);
      } else {
        schedule();
      }
    });
  }

  function setMinutes(value) {
    minutes = value;
    schedule();
  }

  return { init, start, stop, setMinutes, active: () => active };
})();
