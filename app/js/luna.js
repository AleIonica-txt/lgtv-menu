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

  function launch(appId, done) {
    call('luna://com.webos.applicationManager/launch', { id: appId }, done);
  }

  return { call, launch };
})();
