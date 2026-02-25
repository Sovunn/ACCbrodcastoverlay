'use strict';

const INV = 0x7FFFFFFF;   // ACC sentinel value meaning "no valid lap time"

function fmtLap(ms) {
  if (ms == null || ms <= 0 || ms >= INV) return '—';
  const m    = Math.floor(ms / 60000);
  const s    = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

let lastCarIndex = null;
let switchTimer  = null;

function updateContent(car) {
  document.getElementById('db-pos').textContent    = car.classPosition > 0 ? `P${car.classPosition}` : '—';
  document.getElementById('db-number').textContent = car.raceNumber ?? '—';
  document.getElementById('db-driver').textContent = car.driverText || '—';
  document.getElementById('db-team').textContent   = car.teamName   || '';
  document.getElementById('db-brand').textContent  = car.manufacturerAbbr || '—';
  document.getElementById('db-best').textContent   = fmtLap(car.bestLapMs);
  document.getElementById('db-last').textContent   = fmtLap(car.lastLapMs);
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
