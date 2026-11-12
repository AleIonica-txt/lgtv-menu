// Llamadas a servicios Luna (el bus de la tele) desde la app web.
const Luna = (() => {
  const pending = new Set();  // referencia viva mientras la llamada está en curso

  function call(uri, params, done) {
    const bridge = new PalmServiceBridge();
    pending.add(bridge);
    bridge.onservicecallback = (msg) => {
      pending.delete(bridge);
      if (done) done(JSON.parse(msg));
    };
    bridge.call(uri, JSON.stringify(params));
  }

  // Llamada con suscripción: onMessage recibe la primera respuesta y cada aviso posterior.
  function subscribe(uri, params, onMessage) {
    const bridge = new PalmServiceBridge();
    pending.add(bridge);  // viva mientras dure la página
    bridge.onservicecallback = (msg) => {
      try {
        onMessage(JSON.parse(msg));
      } catch (e) { /* un aviso ilegible no rompe la suscripción */ }
    };
    bridge.call(uri, JSON.stringify(params));
  }

  function launch(appId, done) {
    call('luna://com.webos.applicationManager/launch', { id: appId }, done);
  }

  return { call, subscribe, launch };
})();
