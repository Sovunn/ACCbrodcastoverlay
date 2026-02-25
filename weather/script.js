'use strict';

// SHM rainIntensity: 0=No rain 1=Drizzle 2=Light 3=Medium 4=Heavy 5=Thunderstorm
const RAIN_ICON  = ['☀', '🌦', '🌧', '🌧', '🌧', '⛈'];
const GRIP_LABEL = ['GREEN', 'FAST', 'OPTIMUM', 'GREASY', 'DAMP', 'WET', 'FLOODING'];

function render(data) {
  const s = data.session;
  const rainNow  = s.rainNow  ?? 0;
  const rainIn10 = s.rainIn10 ?? 0;
  const rainIn30 = s.rainIn30 ?? 0;

  document.getElementById('wb-icon-now').textContent = RAIN_ICON[rainNow]  ?? '☀';
  document.getElementById('wb-icon-10').textContent  = RAIN_ICON[rainIn10] ?? '☀';
  document.getElementById('wb-icon-30').textContent  = RAIN_ICON[rainIn30] ?? '☀';

  document.getElementById('wb-grip').textContent  =
    s.trackGripStatus != null ? (GRIP_LABEL[s.trackGripStatus] ?? String(s.trackGripStatus)) : '—';
  document.getElementById('wb-temps').textContent =
    (s.ambientTemp != null && s.trackTemp != null) ? `${s.ambientTemp}° / ${s.trackTemp}°` : '—';

  adjustHeight();
}

let _lastH = 0;
function adjustHeight() {
  const h = document.getElementById('weather-root').offsetHeight;
  if (h === _lastH) return;
  _lastH = h;
  window.accApi.setWindowHeight(h);
}

// Dragging is handled natively via -webkit-app-region: drag in style.css.

// ── Config (scale) ────────────────────────────
window.accApi.onWeatherConfig(({ scale }) => {
  document.getElementById('weather-root').style.transform = `scale(${scale})`;
  adjustHeight();
});

// ── Data ─────────────────────────────────────
window.accApi.onStandings((data) => render(data));

// Initial height after load
window.addEventListener('load', adjustHeight);
