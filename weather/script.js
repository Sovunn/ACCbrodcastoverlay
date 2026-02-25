'use strict';

// SHM rainIntensity: 0=No rain 1=Drizzle 2=Light 3=Medium 4=Heavy 5=Thunderstorm
const RAIN_ICON  = ['☀', '🌤', '🌦', '🌧', '🌧\u200D💨', '⛈'];
const RAIN_LABEL = ['DRY', 'DRIZZLE', 'LIGHT', 'MEDIUM', 'HEAVY', 'STORM'];
const GRIP_LABEL = ['GREEN', 'FAST', 'OPTIMUM', 'GREASY', 'DAMP', 'WET', 'FLOODING'];

function trendArrow(from, to) {
  if (to > from) return '↑';
  if (to < from) return '↓';
  return '';
}

function render(data) {
  const s = data.session;
  const rainNow  = s.rainNow  ?? 0;
  const rainIn10 = s.rainIn10 ?? 0;
  const rainIn30 = s.rainIn30 ?? 0;

  document.getElementById('wb-icon-now').textContent = RAIN_ICON[rainNow]  ?? '☀';
  document.getElementById('wb-icon-10').textContent  = RAIN_ICON[rainIn10] ?? '☀';
  document.getElementById('wb-icon-30').textContent  = RAIN_ICON[rainIn30] ?? '☀';

  document.getElementById('wb-rain-now').textContent = RAIN_LABEL[rainNow]  ?? '';
  document.getElementById('wb-rain-10').textContent  = RAIN_LABEL[rainIn10] ?? '';
  document.getElementById('wb-rain-30').textContent  = RAIN_LABEL[rainIn30] ?? '';

  // Trend arrows between forecast slots
  const arrow1 = trendArrow(rainNow, rainIn10);
  const arrow2 = trendArrow(rainIn10, rainIn30);
  document.getElementById('wb-trend-1').textContent = arrow1;
  document.getElementById('wb-trend-2').textContent = arrow2;
  document.getElementById('wb-trend-1').className = 'wb-trend' + (arrow1 === '↑' ? ' trend-up' : arrow1 === '↓' ? ' trend-down' : '');
  document.getElementById('wb-trend-2').className = 'wb-trend' + (arrow2 === '↑' ? ' trend-up' : arrow2 === '↓' ? ' trend-down' : '');

  // Adjust forecast labels for time multiplier (e.g. 7x → "+10'" becomes "+1.4'")
  const mult = s.timeMultiplier ?? 1;
  if (mult > 1.5) {
    const m10 = Math.round(10 / mult);
    const m30 = Math.round(30 / mult);
    document.getElementById('wb-label-10').textContent = `+${m10}'`;
    document.getElementById('wb-label-30').textContent = `+${m30}'`;
  } else {
    document.getElementById('wb-label-10').textContent = "+10'";
    document.getElementById('wb-label-30').textContent = "+30'";
  }

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
