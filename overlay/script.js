'use strict';

// ── Session labels ───────────────────────────
const SESSION_LABELS = { '-1':'ACC', 0:'PRACTICE', 1:'QUALIFYING', 2:'SUPERPOLE', 3:'RACE', 4:'HOTLAP' };
const CLASS_ORDER    = ['GT3','GT4','CUP','ST','TCX'];

// ── Helpers ──────────────────────────────────
function pad2(n) { return String(n).padStart(2,'0'); }

function fmtLap(ms) {
  if (!ms || ms <= 0 || ms >= 0x7FFFFFFF) return '—';
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

function fmtTime(s) {
  if (s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = Math.floor(s % 60);
  return h > 0 ? `${pad2(h)}:${pad2(m)}:${pad2(ss)}` : `${pad2(m)}:${pad2(ss)}`;
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Panel state ───────────────────────────────
let panels = { standings: true };

function applyPanels() {
  const wrapper = document.getElementById('standings-wrapper');
  if (!wrapper) return;
  if (panels.standings) wrapper.classList.remove('hidden');
  else                  wrapper.classList.add('hidden');
}

// ── Render standings ──────────────────────────
function render(data) {
  const { session, track, classes, connected } = data;
  // Non-race sessions get quali layout; everything else (including unknown/replay) gets race layout
  const QUALI_TYPES = new Set([0, 1, 2, 4, 5, 6]);
  const isRace = !QUALI_TYPES.has(session.type);

  // Session header
  document.getElementById('session-type').textContent = SESSION_LABELS[session.type] ?? 'RACE';
  // sessionEndTime counts DOWN (remaining); show it when positive, else show elapsed
  const timeToShow = session.sessionEndTime > 0 ? session.sessionEndTime : session.sessionTime;
  document.getElementById('session-time').textContent = fmtTime(timeToShow);
  document.getElementById('track-name').textContent   = (track.name || '').toUpperCase();

  const container = document.getElementById('standings');

  if (!connected) {
    container.innerHTML = '<div class="waiting">Waiting for ACC …</div>';
    adjustHeight();
    return;
  }

  let html = '';

  for (const cls of CLASS_ORDER) {
    const cars = classes[cls];
    if (!cars?.length) continue;

    const clsL = cls.toLowerCase();
    html += `<div class="class-section class-${clsL}">`;
    html += `<div class="class-header ${clsL}"><span class="class-label">| ${esc(cls)} CLASS</span></div>`;

    for (const car of cars) {
      const pitCls   = car.inPit     ? ' in-pit'  : '';
      const focusCls = car.isFocused ? ' focused' : '';
      const gapCls   = car.gapText === 'LEADER' ? 'leader'
                     : (car.gapLaps > 0 || (car.gapText && car.gapText.includes('L'))) ? 'lapped' : '';

      let rightCol;
      if (isRace) {
        rightCol = `<div class="gap ${gapCls}">${esc(car.gapText)}</div>`;
      } else {
        const lapStr  = fmtLap(car.bestLapMs);
        const isLeader = car.gapText === 'LEADER';
        rightCol = `<div class="qual-col">
            <div class="best-lap">${lapStr}</div>
            ${isLeader ? '' : `<div class="gap-delta ${gapCls}">${esc(car.gapText)}</div>`}
          </div>`;
      }

      const mfrAbbr = esc(car.manufacturerAbbr || '');
      const mfrCls  = mfrAbbr ? ` mfr-${mfrAbbr.toLowerCase()}` : '';

      html += `
        <div class="car-row${pitCls}${focusCls}">
          <div class="pos-badge">${esc(car.classPosition)}</div>
          <div class="info">
            <div class="driver-name">${esc(car.driverText)}</div>
            <div class="team-name">${esc(car.teamName)}</div>
            ${car.inPit ? '<div class="pit-label">PIT</div>' : ''}
          </div>
          <div class="mfr${mfrCls}" aria-label="${mfrAbbr}">${mfrAbbr}</div>
          <div class="car-num"><div class="car-num-inner">${esc(car.raceNumber)}</div></div>
          ${rightCol}
        </div>`;
    }

    html += '</div>';
  }

  container.innerHTML = html;
  adjustHeight();
}

let _lastH = 0;
function adjustHeight() {
  const h = document.getElementById('overlay').offsetHeight;
  if (h === _lastH) return;
  _lastH = h;
  window.accApi.setWindowHeight(h);
}

// ── Window drag (RAF-batched for smooth movement) ─
(function setupDrag() {
  let dragging = false, ox = 0, oy = 0;
  let pdx = 0, pdy = 0, rafId = null;

  document.getElementById('session-header').addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    dragging = true;
    ox = e.screenX; oy = e.screenY;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    pdx += e.screenX - ox;
    pdy += e.screenY - oy;
    ox = e.screenX; oy = e.screenY;
    if (!rafId) rafId = requestAnimationFrame(() => {
      if (pdx || pdy) { window.accApi.moveWindow(pdx, pdy); pdx = 0; pdy = 0; }
      rafId = null;
    });
  });

  window.addEventListener('mouseup', () => { dragging = false; });
})();

// ── Overlay config (scale + lock + panels) ────
window.accApi.onOverlayConfig((cfg) => {
  if (cfg.scale != null) {
    document.getElementById('overlay').style.transform = `scale(${cfg.scale})`;
  }
  if (cfg.panels != null) {
    panels = cfg.panels;
    applyPanels();
  }
  adjustHeight();
});

// ── IPC connection ───────────────────────────
window.accApi.onStandings((data) => render(data));
