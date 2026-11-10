// Peticiones al vigilante (homekey.py): corre en la tele como root y hace lo que una app web no
// puede (ajustes del sistema, apagar, iconos de otras apps...). Cada petición lleva la clave de
// token.js (la escribe token.sh en la carpeta de la app); sin ella el vigilante responde 403.
const Watcher = (() => {
  const BASE = 'http://127.0.0.1:45710';
  const TIMEOUT_MS = 1500;  // el vigilante responde en milisegundos; si tarda, es que no está

  const url = (path) => `${BASE}${path}${path.includes('?') ? '&' : '?'}t=${window.TVMENU_TOKEN || ''}`;

  // Devuelve la respuesta JSON; falla (promesa rechazada) si no responde a tiempo o da un error.
  async function request(path, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const opts = body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) };
      const res = await fetch(url(path), { ...opts, signal: ctrl.signal });
      if (!res.ok) throw new Error(`el vigilante responde ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  return { url, get: (path) => request(path), post: (path, body = {}) => request(path, body) };
})();
