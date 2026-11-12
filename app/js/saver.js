// Reposo: tras unos minutos sin usar el mando, el Dock y la cuadrícula se esconden y queda el
// paisaje con la hora, la fecha y el tiempo (clase "idle" en la página). Cualquier tecla, o mover el
// puntero, lo devuelve; esa primera tecla solo despierta, no llega al menú.
// Mientras el menú está en pantalla con esto activado, el salvapantallas de LG no sale: lo veta
// saverveto.js (la app web no tiene permiso para responder a tvpower). Fuera del menú, o con esto
// en "Nunca", el de LG funciona como siempre.
const Saver = (() => {
  let minutes = 0;
  let active = false;
  let idleTimer;

  function schedule() {
    clearTimeout(idleTimer);
    if (minutes > 0 && !active && !document.hidden) idleTimer = setTimeout(start, minutes * 60000);
  }

  function start() {
    if (active || document.hidden) return;
    active = true;
    root.classList.add('idle');
  }

  // Devuelve true si estaba activo.
  function stop() {
    if (!active) return false;
    active = false;
    root.classList.remove('idle');
    schedule();
    return true;
  }

  function init() {
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
