'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('accApi', {
  // ── Overlay ───────────────────────────────
  onStandings(cb)    { ipcRenderer.on('standings-update', (_, d) => cb(d)); },
  setWindowHeight(h) { ipcRenderer.send('set-window-height', h); },
  moveWindow(dx, dy) { ipcRenderer.send('move-window', { dx, dy }); },

  // ── Control window ────────────────────────
  onStatus(cb)        { ipcRenderer.on('status-update', (_, d) => cb(d)); },
  copyOBSUrl(panel)   { ipcRenderer.send('ctrl-copy-obs', panel); },
  toggleDemo()        { ipcRenderer.send('ctrl-toggle-demo'); },
  toggleOverlay()     { ipcRenderer.send('ctrl-toggle-overlay'); },
  resetOverlay()      { ipcRenderer.send('ctrl-reset-overlay'); },
  minimizeWindow()    { ipcRenderer.send('ctrl-minimize'); },
  closeApp()          { ipcRenderer.send('ctrl-close'); },
  setScale(v)         { ipcRenderer.send('ctrl-set-scale', v); },
  setLocked(v)        { ipcRenderer.send('ctrl-lock-overlay', v); },
  setPanel(name, v)   { ipcRenderer.send('ctrl-set-panel', { name, v }); },
  setWeatherScale(v)  { ipcRenderer.send('ctrl-set-weather-scale', v); },
  setDriverScale(v)   { ipcRenderer.send('ctrl-set-driver-scale', v); },

  // ── Overlay (receives config updates) ─────
  onOverlayConfig(cb) { ipcRenderer.on('overlay-config', (_, d) => cb(d)); },
  onWeatherConfig(cb) { ipcRenderer.on('weather-config', (_, d) => cb(d)); },
  onDriverConfig(cb)  { ipcRenderer.on('driver-config',  (_, d) => cb(d)); },
});
