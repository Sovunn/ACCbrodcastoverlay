'use strict';

const INV = 0x7FFFFFFF;   // ACC sentinel value meaning "no valid lap time"

function fmtLap(ms) {
  if (ms == null || ms <= 0 || ms >= INV) return '—';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

let lastCarIndex = null;
let switchTimer = null;

function updateContent(car) {
  document.getElementById('db-pos').textContent = car.classPosition > 0 ? `P${car.classPosition}` : '—';
  const numEl = document.getElementById('db-number');
  numEl.textContent = car.raceNumber ?? '—';
  // Class-colored number background
  const CLASS_COLORS = { GT3: '#fff', GT4: '#eb7900', CUP: '#0055cc', ST: '#006600', TCX: '#0089eb' };
  const cls = car.carClass || 'GT3';
  numEl.style.background = CLASS_COLORS[cls] || '#fff';
  numEl.style.color = cls === 'GT3' ? '#111' : '#fff';

  document.getElementById('db-driver').textContent = car.driverText || '—';
  document.getElementById('db-team').textContent = car.teamDisplayName || car.teamName || '';
  document.getElementById('db-brand').textContent = car.manufacturerAbbr || '—';
  const bestEl = document.getElementById('db-best');
  const bestStr = fmtLap(car.bestLapMs);
  bestEl.textContent = bestStr;
  if (bestStr === '—') {
    bestEl.style.color = '';
  } else if (car.bestLapMs > 0 && car.bestLapMs === car.classBestLapMs) {
    bestEl.style.color = '#c084fc'; // purple — class best
  } else {
    bestEl.style.color = '#4ade80'; // green — personal best
  }

  const lastEl = document.getElementById('db-last');
  const lastStr = fmtLap(car.lastLapMs);
  lastEl.textContent = lastStr;
  if (lastStr === '—') {
    lastEl.style.color = '';          // reset to CSS default
  } else if (car.lastLapIsValid) {
    lastEl.style.color = '#fb923c';   // orange / valid
  } else {
    lastEl.style.color = '#ef4444';   // red / invalid
  }
}

function render(data) {
  const car = data.focusedCar;
  if (!car) return;

  const root = document.getElementById('driver-root');

  if (lastCarIndex !== null && car.carIndex !== lastCarIndex) {
    // Driver changed — fade out, swap, fade in
    clearTimeout(switchTimer);
    root.classList.add('is-switching');
    switchTimer = setTimeout(() => {
      updateContent(car);
      lastCarIndex = car.carIndex;
      root.classList.remove('is-switching');
      adjustHeight();
    }, 140);
  } else {
    updateContent(car);
    lastCarIndex = car.carIndex;
    adjustHeight();
  }
}

let _lastH = 0;
function adjustHeight() {
  const h = document.getElementById('driver-root').offsetHeight;
  if (h === _lastH) return;
  _lastH = h;
  window.accApi.setWindowHeight(h);
}

// Dragging is handled natively via -webkit-app-region: drag in style.css.

// ── Config ────────────────────────────────────
window.accApi.onDriverConfig(({ scale }) => {
  document.getElementById('driver-root').style.transform = `scale(${scale})`;
  _lastH = 0;   // force resize — transform:scale doesn't change offsetHeight
  adjustHeight();
});

// ── Data ─────────────────────────────────────
window.accApi.onStandings((data) => render(data));

window.addEventListener('load', adjustHeight);
