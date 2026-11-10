// Motor de enfoque: navegación espacial con las flechas, sin cursor libre.
// Los elementos enfocables llevan [data-focusable]. El foco nunca se pierde: si no hay
// nada en la dirección pedida, move() devuelve false y el foco se queda donde está.
// Un overlay abre un "ámbito" (pushScope) que limita el foco; Atrás lo cierra (popScope).
const Focus = (() => {
  const VEC = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const scopes = [];  // pila de { root, last }
  const listeners = [];
  let base = document.body;  // ámbito de la pantalla principal (los overlays cerrados quedan fuera)
  let current = null;

  const scopeRoot = () => (scopes.length ? scopes[scopes.length - 1].root : base);
  const focusables = () =>
    Array.from(scopeRoot().querySelectorAll('[data-focusable]')).filter((el) => el.offsetParent !== null);

  function set(el, dir = null) {
    if (!el || el === current) return;
    const prev = current;
    if (prev) prev.classList.remove('focused');
    current = el;
    el.classList.add('focused');
    listeners.forEach((fn) => fn(el, prev, dir));
  }

  function move(dir) {
    if (!current || !scopeRoot().contains(current)) {
      set(focusables()[0]);
      return true;
    }
    const [dx, dy] = VEC[dir];
    const from = current.getBoundingClientRect();
    const fx = from.left + from.width / 2;
    const fy = from.top + from.height / 2;
    let best = null;
    let bestScore = Infinity;

    for (const el of focusables()) {
      if (el === current) continue;
      const r = el.getBoundingClientRect();
      // Distancia en la dirección pedida (negativa = no está en esa dirección).
      const along = dx > 0 ? r.left - from.right
        : dx < 0 ? from.left - r.right
        : dy > 0 ? r.top - from.bottom
        : from.top - r.bottom;
      if (along < -1) continue;
      // Izquierda/derecha solo dentro de la misma franja horizontal: al final de una fila el foco
      // se queda (rebote) en vez de saltar en diagonal a otra fila.
      if (dx && (r.bottom <= from.top || r.top >= from.bottom)) continue;
      // Desalineación respecto al eje: pesa el doble para preferir el vecino "en línea".
      const across = dx ? Math.abs(r.top + r.height / 2 - fy) : Math.abs(r.left + r.width / 2 - fx);
      const score = along + across * 2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (!best) return false;
    set(best, dir);
    return true;
  }

  function pushScope(root, initial) {
    scopes.push({ root, last: current });
    set(initial || focusables()[0]);
  }

  function popScope() {
    if (!scopes.length) return false;
    set(scopes.pop().last);
    return true;
  }

  // Vuelve a la pantalla principal: cierra todos los overlays.
  function reset() {
    while (scopes.length) popScope();
    if (!current) set(focusables()[0]);
  }

  return {
    VEC,
    setRoot: (el) => { base = el; },
    set,
    move,
    pushScope,
    popScope,
    reset,
    current: () => current,
    onChange: (fn) => listeners.push(fn),
  };
})();
