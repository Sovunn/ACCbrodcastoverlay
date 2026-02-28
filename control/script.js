'use strict';

const SESSION_TYPES = { 0:'Practice', 1:'Qualifying', 2:'Superpole', 3:'Race', 4:'Qualifying', 5:'Hotstint' };
const PHASE_LABELS  = { 0:'Lobby', 1:'Starting', 2:'Pre-Formation', 3:'Formation Lap', 4:'Pre-Session', 5:'Live', 6:'Session Over', 7:'Post Session', 8:'Results' };

// ── DOM refs ────────────────────────────────
const dot        = document.getElementById('status-indicator');
const lbl        = document.getElementById('status-label');
const sub        = document.getElementById('status-sub');
const valTrack   = document.getElementById('val-track');
const valSession = document.getElementById('val-session');
const valCars    = document.getElementById('val-cars');
const valOverlay = document.getElementById('val-overlay');
const valDebug   = document.getElementById('val-debug');
const warning    = document.getElementById('restart-warning');
const btnToggle  = document.getElementById('btn-toggle-overlay');
const inputClassCap = document.getElementById('input-class-cap');

let currentOverlayVisible = false;
let currentScale  = 1.0;
let weatherScale  = 1.0;
let driverScale   = 1.0;
let isLocked      = false;
let standingsCarsPerClass = 10;
let currentPanels = { standings: true, weather: false, driver: false };

const SCALE_MIN  = 0.5;
const SCALE_MAX  = 2.0;
const SCALE_STEP = 0.05;

function updateScaleUI() {
  document.getElementById('scale-val').textContent = Math.round(currentScale * 100) + '%';
}

function updateWeatherScaleUI() {
  document.getElementById('weather-scale-val').textContent = Math.round(weatherScale * 100) + '%';
}

function updateDriverScaleUI() {
  document.getElementById('driver-scale-val').textContent = Math.round(driverScale * 100) + '%';
}

function updateLockUI() {
  const btn = document.getElementById('btn-lock');
  if (isLocked) {
    btn.textContent = '🔓 Unlock';
    btn.classList.add('locked');
  } else {
    btn.textContent = '🔒 Lock';
    btn.classList.remove('locked');
  }
}

function updatePanelUI() {
  const names = ['standings', 'weather', 'driver'];
  for (const name of names) {
    const btn = document.getElementById(`pbtn-${name}`);
    if (!btn) continue;
    if (currentPanels[name]) btn.classList.add('active');
    else                     btn.classList.remove('active');
  }
}

function clampCarsPerClass(v) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(60, n));
}

function updateCarsPerClassUI() {
  if (!inputClassCap) return;
  const v = String(standingsCarsPerClass);
  if (inputClassCap.value !== v) inputClassCap.value = v;
}

// ── Render status ───────────────────────────
function render(s) {
  const { connected, sessionType, phase, trackName, carCount, classes, overlayVisible, needsRestart,
          entryCount, realtimeCount, parseErrors, lastParseErr,
          overlayScale: remoteScale, overlayLocked: remoteLocked,
          panels: remotePanels,
          weatherScale: remoteWeatherScale, driverScale: remoteDriverScale,
          standingsCarsPerClass: remoteCarsPerClass } = s;

  // Sync scale/lock from main process (handles app restart or window reload)
  if (remoteScale !== undefined && remoteScale !== currentScale) {
    currentScale = remoteScale;
    updateScaleUI();
  }
  if (remoteLocked !== undefined && remoteLocked !== isLocked) {
    isLocked = remoteLocked;
    updateLockUI();
  }
  if (remotePanels !== undefined) {
    currentPanels = { ...currentPanels, ...remotePanels };
    updatePanelUI();
  }
  if (remoteWeatherScale !== undefined && remoteWeatherScale !== weatherScale) {
    weatherScale = remoteWeatherScale;
    updateWeatherScaleUI();
  }
  if (remoteDriverScale !== undefined && remoteDriverScale !== driverScale) {
    driverScale = remoteDriverScale;
    updateDriverScaleUI();
  }
  if (remoteCarsPerClass !== undefined && remoteCarsPerClass !== standingsCarsPerClass) {
    standingsCarsPerClass = clampCarsPerClass(remoteCarsPerClass);
    updateCarsPerClassUI();
  }

  currentOverlayVisible = overlayVisible;

  // Restart warning
  if (needsRestart) {
    warning.classList.remove('hidden');
  } else {
    warning.classList.add('hidden');
  }

  // Indicator state
  if (!connected) {
    dot.className = 'off';
    lbl.textContent = 'WAITING FOR ACC';
    sub.textContent = needsRestart ? 'Restart ACC to activate broadcasting' : 'Launch ACC to connect automatically';
  } else if (phase >= 4) {
    dot.className = 'live';
    const t = SESSION_TYPES[sessionType] ?? 'Session';
    lbl.textContent = `LIVE — ${t.toUpperCase()}`;
    sub.textContent = trackName || 'Connected';
  } else if (phase >= 1) {
    dot.className = 'waiting';
    const ph = PHASE_LABELS[phase] ?? 'Connected';
    lbl.textContent = 'CONNECTED — ' + ph.toUpperCase();
    sub.textContent = trackName || 'Waiting for session…';
  } else {
    dot.className = 'waiting';
    lbl.textContent = 'CONNECTED';
    sub.textContent = trackName || 'In lobby…';
  }

  // Session info
  valTrack.textContent   = trackName || '—';
  valSession.textContent = connected
    ? ((SESSION_TYPES[sessionType] ?? '—') + (phase >= 0 ? ' — ' + (PHASE_LABELS[phase] ?? '') : ''))
    : '—';
  valCars.textContent    = carCount > 0 ? `${carCount} (${classes.join(' + ')})` : '—';
  valOverlay.textContent = overlayVisible ? '● Visible' : '○ Hidden';
  valOverlay.style.color = overlayVisible ? '#22c55e' : '#666';

  // Debug row
  if (connected) {
    const errTxt = parseErrors > 0 ? ` ⚠${parseErrors}err` : '';
    valDebug.textContent = `entries:${entryCount ?? '?'} rt:${realtimeCount ?? '?'}${errTxt}`;
    valDebug.style.color = parseErrors > 0 ? '#f59e0b' : '#888';
    if (parseErrors > 0 && lastParseErr) valDebug.title = lastParseErr;
  } else {
    valDebug.textContent = '—';
  }

  // Toggle button text
  btnToggle.textContent = overlayVisible ? 'Hide Overlay' : 'Show Overlay';
  btnToggle.className   = overlayVisible ? 'btn' : 'btn primary';
}

// ── Buttons ─────────────────────────────────
btnToggle.addEventListener('click', () => window.accApi.toggleOverlay());

function copyObs(panel, btnId) {
  window.accApi.copyOBSUrl(panel);
  const btn = document.getElementById(btnId);
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = 'Copied';
  btn.classList.add('copied');
  setTimeout(() => {
    btn.textContent = prev;
    btn.classList.remove('copied');
  }, 1200);
}

document.getElementById('btn-obs-standings')?.addEventListener('click', () => copyObs('standings', 'btn-obs-standings'));
document.getElementById('btn-obs-weather')?.addEventListener('click', () => copyObs('weather', 'btn-obs-weather'));
document.getElementById('btn-obs-driver')?.addEventListener('click', () => copyObs('driver', 'btn-obs-driver'));

document.getElementById('btn-demo').addEventListener('click', () => window.accApi.toggleDemo());

// ── Title bar controls ───────────────────────
document.getElementById('btn-minimize').addEventListener('click', () => window.accApi.minimizeWindow());
document.getElementById('btn-close').addEventListener('click',    () => window.accApi.closeApp());

// ── Scale controls ────────────────────────────
document.getElementById('btn-scale-down').addEventListener('click', () => {
  currentScale = Math.max(SCALE_MIN, Math.round((currentScale - SCALE_STEP) * 100) / 100);
  window.accApi.setScale(currentScale);
  updateScaleUI();
});

document.getElementById('btn-scale-up').addEventListener('click', () => {
  currentScale = Math.min(SCALE_MAX, Math.round((currentScale + SCALE_STEP) * 100) / 100);
  window.accApi.setScale(currentScale);
  updateScaleUI();
});

// ── Reset position ───────────────────────────────
document.getElementById('btn-reset').addEventListener('click', () => window.accApi.resetOverlay());

// ── Lock toggle ───────────────────────────────
document.getElementById('btn-lock').addEventListener('click', () => {
  isLocked = !isLocked;
  window.accApi.setLocked(isLocked);
  updateLockUI();
});

// ── Panel toggles ──────────────────────────────
['standings', 'weather', 'driver'].forEach(name => {
  document.getElementById(`pbtn-${name}`)?.addEventListener('click', () => {
    currentPanels[name] = !currentPanels[name];
    window.accApi.setPanel(name, currentPanels[name]);
    updatePanelUI();
  });
});

// ── Weather scale ─────────────────────────────
document.getElementById('btn-weather-down').addEventListener('click', () => {
  weatherScale = Math.max(SCALE_MIN, Math.round((weatherScale - SCALE_STEP) * 100) / 100);
  window.accApi.setWeatherScale(weatherScale);
  updateWeatherScaleUI();
});

document.getElementById('btn-weather-up').addEventListener('click', () => {
  weatherScale = Math.min(SCALE_MAX, Math.round((weatherScale + SCALE_STEP) * 100) / 100);
  window.accApi.setWeatherScale(weatherScale);
  updateWeatherScaleUI();
});

// ── Driver scale ──────────────────────────────
document.getElementById('btn-driver-down').addEventListener('click', () => {
  driverScale = Math.max(SCALE_MIN, Math.round((driverScale - SCALE_STEP) * 100) / 100);
  window.accApi.setDriverScale(driverScale);
  updateDriverScaleUI();
});

document.getElementById('btn-driver-up').addEventListener('click', () => {
  driverScale = Math.min(SCALE_MAX, Math.round((driverScale + SCALE_STEP) * 100) / 100);
  window.accApi.setDriverScale(driverScale);
  updateDriverScaleUI();
});

inputClassCap?.addEventListener('change', () => {
  standingsCarsPerClass = clampCarsPerClass(inputClassCap.value);
  updateCarsPerClassUI();
  window.accApi.setStandingsCarsPerClass(standingsCarsPerClass);
});

// ── IPC ──────────────────────────────────────
window.accApi.onStatus(render);
