'use strict';

(function initObsBridge() {
  const standingsCbs = [];
  const overlayCfgCbs = [];
  const weatherCfgCbs = [];
  const driverCfgCbs = [];

  const panel = location.pathname.includes('/obs/weather') ? 'weather'
    : location.pathname.includes('/obs/driver') ? 'driver'
    : 'standings';

  const qs = new URLSearchParams(location.search);
  const scale = Math.max(0.5, Math.min(2, Number(qs.get('scale')) || 1));

  const overlayCfg = { scale, locked: true, panels: { standings: true, weather: true, driver: true } };
  const weatherCfg = { scale };
  const driverCfg = { scale };

  function callLater(cb, payload) {
    setTimeout(() => {
      try { cb(payload); } catch {}
    }, 0);
  }

  window.accApi = {
    onStandings(cb) {
      standingsCbs.push(cb);
    },
    setWindowHeight() {},
    moveWindow() {},
    onOverlayConfig(cb) {
      overlayCfgCbs.push(cb);
      callLater(cb, overlayCfg);
    },
    onWeatherConfig(cb) {
      weatherCfgCbs.push(cb);
      callLater(cb, weatherCfg);
    },
    onDriverConfig(cb) {
      driverCfgCbs.push(cb);
      callLater(cb, driverCfg);
    },
  };

  const source = new EventSource('/stream');
  source.onmessage = (ev) => {
    let data;
    try { data = JSON.parse(ev.data); } catch { return; }
    for (const cb of standingsCbs) {
      try { cb(data); } catch {}
    }
  };

  source.onerror = () => {
    // Browser source should stay alive and reconnect automatically.
  };

  // Keep lint/static analyzers happy about unused panel-specific callback arrays.
  void panel;
  void overlayCfgCbs;
  void weatherCfgCbs;
  void driverCfgCbs;
})();

