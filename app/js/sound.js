// Sonidos de la interfaz, sintetizados con Web Audio (sin ficheros). Cada acción suena distinto:
// tonos suaves de seno/triángulo con ataque rápido y caída exponencial.
const Sound = (() => {
  const VOLUME = 0.2;
  // Cada sonido: notas [frecuencia inicial, final (Hz), inicio, duración (s), volumen relativo, onda].
  const SOUNDS = {
    move: [[1320, 1180, 0, 0.05, 0.3, 'sine']],                                   // tic suave
    bump: [[190, 120, 0, 0.12, 0.9, 'sine']],                                     // golpe sordo en el borde
    select: [[660, 660, 0, 0.07, 0.5, 'sine'], [990, 990, 0.06, 0.14, 0.5, 'sine']],  // abrir una app: sube
    back: [[880, 880, 0, 0.06, 0.4, 'sine'], [587, 587, 0.055, 0.11, 0.4, 'sine']],   // Atrás: baja
    open: [[520, 780, 0, 0.14, 0.35, 'sine'], [1040, 1040, 0.11, 0.14, 0.25, 'sine']], // abrir un panel
    close: [[780, 520, 0, 0.14, 0.35, 'sine']],                                   // cerrar un panel
    on: [[740, 740, 0, 0.06, 0.45, 'triangle'], [1110, 1110, 0.06, 0.1, 0.45, 'triangle']],  // activar
    off: [[1110, 1110, 0, 0.06, 0.45, 'triangle'], [740, 740, 0.06, 0.1, 0.45, 'triangle']], // desactivar
    pick: [[440, 880, 0, 0.13, 0.45, 'sine']],                                    // coger una tarjeta
    shift: [[980, 900, 0, 0.05, 0.3, 'triangle']],                                // moverla
    drop: [[880, 520, 0, 0.1, 0.45, 'sine'], [1320, 1320, 0.08, 0.06, 0.2, 'sine']],   // soltarla
  };

  let ctx = null;
  let enabled = true;
  let idleTimer;

  function play(name) {
    if (!enabled) return;
    try {
      ctx = ctx || new AudioContext();
      if (ctx.state === 'suspended') ctx.resume();
      const t0 = ctx.currentTime + 0.01;
      for (const [f0, f1, start, dur, vol, type] of SOUNDS[name]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const t = t0 + start;
        osc.type = type;
        osc.frequency.setValueAtTime(f0, t);
        osc.frequency.exponentialRampToValueAtTime(f1, t + dur);
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(vol * VOLUME, t + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t);
        osc.stop(t + dur + 0.02);
      }
      // En reposo se suspende el contexto: no deja ocupada la salida de audio de la tele.
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => ctx.suspend(), 3000);
    } catch (e) { /* sin audio: el menú funciona igual */ }
  }

  return { play, setEnabled: (on) => { enabled = on; } };
})();
