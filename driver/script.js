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
  document.getElementById('db-number').textContent = car.raceNumber ?? '—';
  document.getElementById('db-driver').textContent = car.driverText || '—';
  document.getElementById('db-team').textContent = car.teamDisplayName || car.teamName || '';
  document.getElementById('db-brand').textContent = car.manufacturerAbbr || '—';
  document.getElementById('db-best').textContent = fmtLap(car.bestLapMs);

  const lastEl = document.getElementById('db-last');
  const lastStr = fmtLap(car.lastLapMs);
  lastEl.textContent = lastStr;
  // Valid lap → green, invalid/unknown → muted grey (matches existing #db-last near-white base)
  if (lastStr === '—') {
    lastEl.style.color = '';          // reset to CSS default (near-white)
  } else if (car.lastLapIsValid) {
    lastEl.style.color = '#4ade80';   // green
  } else {
    lastEl.style.color = '#64748b';   // muted/invalid grey
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
  adjustHeight();
});

// ── Data ─────────────────────────────────────
window.accApi.onStandings((data) => render(data));

window.addEventListener('load', adjustHeight);
