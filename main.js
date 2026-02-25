'use strict';

const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, clipboard, screen, shell } = require('electron');
const path    = require('path');
const zlib    = require('zlib');
const express = require('express');

const DataStore    = require('./src/data-store');
const AccUdpClient = require('./src/acc-udp');
const AccShmReader = require('./src/acc-shm');
const { loadDemoData, startDemoSimulation } = require('./src/demo-data');
const { ensureBroadcastEnabled, isAccRunning } = require('./src/acc-config');

// ── CLI flags ─────────────────────────────────
let IS_DEMO   = process.argv.includes('--demo');
const OBS_PORT  = 5000;
const OVERLAY_W = 450;

// ── State ─────────────────────────────────────
let overlayWindow    = null;
let weatherWindow    = null;
let driverWindow     = null;
let controlWindow    = null;
let tray             = null;
let udpClient        = null;
let demoTimer        = null;
let overlayVisible   = false;
let lastPhase        = -1;
let needsRestart     = false;   // ACC was running when we started; needs restart
let overlayScale     = 1.0;     // standings overlay scale factor (0.5 – 2.0)
let weatherScale     = 1.0;     // weather panel scale factor
let driverScale      = 1.0;     // driver panel scale factor
let overlayLocked    = false;   // when true → click-through, can't be dragged
let panels           = { standings: true, weather: false, driver: false };
const store      = new DataStore();
const sseClients = new Set();

// ─────────────────────────────────────────────
//  Overlay BrowserWindow
// ─────────────────────────────────────────────
function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    x:           20,
    y:           100,
    width:       OVERLAY_W,
    height:      600,
    minWidth:    OVERLAY_W,
    maxWidth:    OVERLAY_W,
    transparent: true,
    frame:       false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable:   false,
    show:        false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  overlayWindow.setAlwaysOnTop(true, 'screen-saver');
  overlayWindow.setIgnoreMouseEvents(false);
  overlayWindow.loadFile('overlay/index.html');

  overlayWindow.on('closed', () => { overlayWindow = null; overlayVisible = false; });
}

// ─────────────────────────────────────────────
//  Weather BrowserWindow
// ─────────────────────────────────────────────
function createWeatherWindow() {
  weatherWindow = new BrowserWindow({
    x:           20,
    y:           60,
    width:       OVERLAY_W,
    height:      60,
    transparent: true,
    frame:       false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable:   false,
    show:        false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });
  weatherWindow.setAlwaysOnTop(true, 'screen-saver');
  weatherWindow.setIgnoreMouseEvents(false);
  weatherWindow.loadFile('weather/index.html');
  weatherWindow.on('closed', () => { weatherWindow = null; });
}

// ─────────────────────────────────────────────
//  Driver BrowserWindow
// ─────────────────────────────────────────────
function createDriverWindow() {
  driverWindow = new BrowserWindow({
    x:           20,
    y:           500,
    width:       OVERLAY_W,
    height:      60,
    transparent: true,
    frame:       false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable:   false,
    show:        false,
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });
  driverWindow.setAlwaysOnTop(true, 'screen-saver');
  driverWindow.setIgnoreMouseEvents(false);
  driverWindow.loadFile('driver/index.html');
  driverWindow.on('closed', () => { driverWindow = null; });
}

// ─────────────────────────────────────────────
//  Control BrowserWindow
// ─────────────────────────────────────────────
function createControlWindow() {
  controlWindow = new BrowserWindow({
    width:        340,
    height:       440,
    minWidth:     340,
    maxWidth:     340,
    minHeight:    440,
    maxHeight:    440,
    resizable:    false,
    frame:        false,
    transparent:  false,
    alwaysOnTop:  false,
    skipTaskbar:  false,
    title:        'ACC Overlay',
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
    },
  });

  controlWindow.loadFile('control/index.html');

  // Clicking X hides instead of closing (stays in tray)
  controlWindow.on('close', (e) => {
    e.preventDefault();
    controlWindow.hide();
  });
}

// ─────────────────────────────────────────────
//  System Tray
// ─────────────────────────────────────────────
function createTray() {
  const icon = makeTrayIcon(204, 0, 0);
  tray = new Tray(icon);
  tray.setToolTip('ACC Overlay');

  tray.on('click', () => {
    if (controlWindow) {
      controlWindow.isVisible() ? controlWindow.focus() : controlWindow.show();
    }
  });

  rebuildTrayMenu();
}

function rebuildTrayMenu() {
  const menu = Menu.buildFromTemplate([
    { label: 'ACC Overlay', enabled: false },
    { type:  'separator' },
    {
      label: 'Show control panel',
      click() { controlWindow?.show(); },
    },
    {
      label:   'Toggle overlay',
      click() { toggleOverlayVisibility(); },
    },
    { type:  'separator' },
    {
      label: IS_DEMO ? 'Stop demo' : 'Run demo',
      click() { toggleDemoMode(); },
    },
    {
      label: `Copy OBS URL`,
      click() { clipboard.writeText(`http://127.0.0.1:${OBS_PORT}`); },
    },
    {
      label: 'Open OBS source in browser',
      click() { shell.openExternal(`http://127.0.0.1:${OBS_PORT}`); },
    },
    { type:  'separator' },
    { label: 'Exit', click() { app.exit(0); } },
  ]);
  tray.setContextMenu(menu);
}

// ─────────────────────────────────────────────
//  Overlay show/hide helpers
// ─────────────────────────────────────────────
function showOverlay() {
  if (!overlayWindow || overlayVisible) return;
  overlayWindow.show();
  overlayVisible = true;
}

function hideOverlay() {
  if (!overlayWindow || !overlayVisible) return;
  overlayWindow.hide();
  overlayVisible = false;
}

function toggleOverlayVisibility() {
  overlayVisible ? hideOverlay() : showOverlay();
}

// ─────────────────────────────────────────────
//  Demo mode toggle
// ─────────────────────────────────────────────
function startDemo() {
  IS_DEMO = true;
  store.reset();
  loadDemoData(store);
  demoTimer = startDemoSimulation(store);
  showOverlay();
  rebuildTrayMenu();
}

function stopDemo() {
  IS_DEMO = false;
  if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
  store.reset();
  rebuildTrayMenu();
}

function toggleDemoMode() {
  if (IS_DEMO) stopDemo(); else startDemo();
}

// ─────────────────────────────────────────────
//  Express web server (OBS browser source)
// ─────────────────────────────────────────────
function startWebServer() {
  const exApp = express();

  exApp.use('/static', express.static(path.join(__dirname, 'web')));
  exApp.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'web', 'index.html')));

  exApp.get('/stream', (req, res) => {
    res.writeHead(200, {
      'Content-Type':      'text/event-stream',
      'Cache-Control':     'no-cache',
      'Connection':        'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
  });

  exApp.get('/api/standings', (_req, res) => res.json(store.getStandings()));

  exApp.listen(OBS_PORT, '127.0.0.1', () =>
    console.log(`[Main] OBS source → http://127.0.0.1:${OBS_PORT}`));
}

// ─────────────────────────────────────────────
//  Push loop — standings every 250 ms
// ─────────────────────────────────────────────
function startPushLoop() {
  setInterval(() => {
    const data = store.getStandings();
    const json = JSON.stringify(data);

    // Overlay windows (IPC)
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      try { overlayWindow.webContents.send('standings-update', data); } catch {}
    }
    if (weatherWindow && !weatherWindow.isDestroyed()) {
      try { weatherWindow.webContents.send('standings-update', data); } catch {}
    }
    if (driverWindow && !driverWindow.isDestroyed()) {
      try { driverWindow.webContents.send('standings-update', data); } catch {}
    }

    // OBS clients (SSE)
    for (const res of sseClients) {
      try { res.write(`data: ${json}\n\n`); } catch { sseClients.delete(res); }
    }
  }, 250);
}

// ─────────────────────────────────────────────
//  Status push loop — control window every 500 ms
// ─────────────────────────────────────────────
function startStatusLoop() {
  setInterval(() => {
    if (!controlWindow || controlWindow.isDestroyed()) return;

    const standings = store.getStandings();
    const { session, track, classes, connected } = standings;

    // Auto show/hide overlay based on session phase
    // Phase 4 = Pre-Session, 5 = Live session; show for both
    if (!IS_DEMO) {
      if (connected) {
        needsRestart = false;   // clear restart warning once connected
        if (session.phase >= 4 && lastPhase < 4) {
          showOverlay();
        } else if (lastPhase >= 4 && session.phase < 4) {
          hideOverlay();
        }
      }
      lastPhase = connected ? session.phase : -1;
    }

    // Build car count + class list for display
    const activeClasses = Object.keys(classes).filter(c => classes[c]?.length > 0);
    const carCount = activeClasses.reduce((n, c) => n + classes[c].length, 0);

    const status = {
      connected,
      sessionType:    session.type,
      phase:          session.phase,
      trackName:      track.name || '',
      carCount,
      classes:        activeClasses,
      overlayVisible,
      needsRestart,
      entryCount:    standings.entryCount,
      realtimeCount: standings.realtimeCount,
      parseErrors:   standings.parseErrors,
      lastParseErr:  standings.lastParseErr,
      overlayScale,
      overlayLocked,
      panels,
      weatherScale,
      driverScale,
    };

    try {
      controlWindow.webContents.send('status-update', status);
    } catch {}
  }, 500);
}

// ─────────────────────────────────────────────
//  IPC handlers
// ─────────────────────────────────────────────

// ── Config send helpers ────────────────────────────────────────────────────
function clampScale(v) { return Math.max(0.5, Math.min(2.0, Number(v) || 1.0)); }

/** Returns the BrowserWindow whose webContents sent the IPC event */
function getWinBySender(wc) {
  if (overlayWindow && !overlayWindow.isDestroyed() && overlayWindow.webContents.id === wc.id) return overlayWindow;
  if (weatherWindow && !weatherWindow.isDestroyed() && weatherWindow.webContents.id === wc.id) return weatherWindow;
  if (driverWindow  && !driverWindow.isDestroyed()  && driverWindow.webContents.id  === wc.id) return driverWindow;
  return null;
}

/** Push scale + lock + panels state to the standings overlay */
function sendOverlayConfig() {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    try { overlayWindow.webContents.send('overlay-config', { scale: overlayScale, locked: overlayLocked, panels }); } catch {}
  }
}

function sendWeatherConfig() {
  if (weatherWindow && !weatherWindow.isDestroyed()) {
    try { weatherWindow.webContents.send('weather-config', { scale: weatherScale }); } catch {}
  }
}

function sendDriverConfig() {
  if (driverWindow && !driverWindow.isDestroyed()) {
    try { driverWindow.webContents.send('driver-config', { scale: driverScale }); } catch {}
  }
}

// Overlay IPC — sender-aware resize
ipcMain.on('set-window-height', (event, h) => {
  const win = getWinBySender(event.sender);
  if (!win) return;
  const scale = win === weatherWindow ? weatherScale
              : win === driverWindow  ? driverScale : overlayScale;
  win.setSize(
    Math.max(100, Math.round(OVERLAY_W * scale)),
    Math.max(40,  Math.round(h * scale)),
  );
});

// Overlay IPC — sender-aware move (respects lock)
// getBounds() + setBounds() is one Win32 SetWindowPos call instead of two,
// which avoids DWM composition jank on transparent always-on-top windows.
ipcMain.on('move-window', (event, { dx, dy }) => {
  if (overlayLocked) return;
  const win = getWinBySender(event.sender);
  if (!win) return;
  const b = win.getBounds();
  win.setBounds({ x: b.x + dx, y: b.y + dy, width: b.width, height: b.height });
});

// Control window IPC
ipcMain.on('ctrl-toggle-overlay', () => {
  toggleOverlayVisibility();
});

ipcMain.on('ctrl-copy-obs', () => {
  clipboard.writeText(`http://127.0.0.1:${OBS_PORT}`);
});

ipcMain.on('ctrl-toggle-demo', () => {
  toggleDemoMode();
});

ipcMain.on('ctrl-reset-overlay', () => {
  if (!overlayWindow) return;
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize;
  overlayWindow.setPosition(20, Math.floor(sh / 2) - 200);
});

ipcMain.on('ctrl-set-scale', (_event, scale) => {
  overlayScale = clampScale(scale);
  sendOverlayConfig();
  // Overlay will call set-window-height after receiving overlay-config
});

ipcMain.on('ctrl-set-weather-scale', (_event, scale) => {
  weatherScale = clampScale(scale);
  sendWeatherConfig();
});

ipcMain.on('ctrl-set-driver-scale', (_event, scale) => {
  driverScale = clampScale(scale);
  sendDriverConfig();
});

ipcMain.on('ctrl-lock-overlay', (_event, locked) => {
  overlayLocked = !!locked;
  // Apply to all overlay windows
  for (const win of [overlayWindow, weatherWindow, driverWindow]) {
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(overlayLocked, { forward: true });
    }
  }
  sendOverlayConfig();
});

ipcMain.on('ctrl-set-panel', (_event, { name, v }) => {
  if (!(name in panels)) return;
  panels[name] = !!v;
  // Show/hide the dedicated windows for weather and driver
  if (name === 'weather') { panels.weather ? weatherWindow?.show() : weatherWindow?.hide(); }
  if (name === 'driver')  { panels.driver  ? driverWindow?.show()  : driverWindow?.hide(); }
  // standings visibility is handled in overlay via overlay-config panels
  sendOverlayConfig();
});

ipcMain.on('ctrl-minimize', () => {
  controlWindow?.minimize();
});

ipcMain.on('ctrl-close', () => {
  controlWindow?.hide();
});

// ─────────────────────────────────────────────
//  App bootstrap
// ─────────────────────────────────────────────
app.whenReady().then(() => {
  // Auto-configure ACC broadcasting.json
  // If ACC was already running AND we had to modify the file → user must restart ACC
  try {
    const accAlreadyRunning = isAccRunning();
    const result = ensureBroadcastEnabled(9000);
    if (result.modified) {
      console.log('[Main] Wrote ACC broadcasting.json');
      if (accAlreadyRunning) {
        needsRestart = true;
        console.warn('[Main] ACC was already running — broadcasting will activate after ACC restart');
      }
    }
  } catch (e) {
    console.warn('[Main] Could not write broadcasting.json:', e.message);
  }

  createOverlayWindow();
  createWeatherWindow();
  createDriverWindow();
  createControlWindow();
  createTray();
  startWebServer();
  startPushLoop();
  startStatusLoop();

  // Always start SHM reader (grip status comes from shared memory, not UDP)
  const shmReader = new AccShmReader(store);
  shmReader.start();

  if (IS_DEMO) {
    console.log('[Main] Demo mode — using fake race data');
    loadDemoData(store);
    demoTimer = startDemoSimulation(store);
    showOverlay();
  } else {
    udpClient = new AccUdpClient(store);
    udpClient.start();
  }
});

// Keep app alive in tray when all windows are closed/hidden
app.on('window-all-closed', (e) => e.preventDefault());

// ─────────────────────────────────────────────
//  PNG icon generator (no external deps)
// ─────────────────────────────────────────────
function makeTrayIcon(r, g, b) {
  return nativeImage.createFromBuffer(makeSolidPNG(16, 16, r, g, b));
}

function makeSolidPNG(w, h, r, g, b) {
  const crct = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    crct[n] = c;
  }
  const crc32 = (buf) => {
    let c = 0xFFFFFFFF;
    for (const byte of buf) c = crct[(c ^ byte) & 0xFF] ^ (c >>> 8);
    return ((c ^ 0xFFFFFFFF) >>> 0);
  };
  const chunk = (type, data) => {
    const t = Buffer.from(type);
    const l = Buffer.alloc(4); l.writeUInt32BE(data.length);
    const x = Buffer.alloc(4); x.writeUInt32BE(crc32(Buffer.concat([t, data])));
    return Buffer.concat([l, t, data, x]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const base = y * (1 + w * 3);
    raw[base] = 0;
    for (let x = 0; x < w; x++) {
      raw[base + 1 + x * 3 + 0] = r;
      raw[base + 1 + x * 3 + 1] = g;
      raw[base + 1 + x * 3 + 2] = b;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
