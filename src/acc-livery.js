'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  ACC Livery Reader — reads team names from local custom car JSON files
//
//  ACC downloads livery data for all cars on the server to:
//    Documents/Assetto Corsa Competizione/Customs/Cars/<id>.json
//
//  Each file is UTF-16LE and contains { raceNumber, teamName, carModelType, … }
//  We scan on startup and watch for new files via fs.watch().
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ACC docs may live under OneDrive-redirected Documents or the standard path
const CANDIDATES = [
  path.join(os.homedir(), 'OneDrive', 'Documents', 'Assetto Corsa Competizione', 'Customs', 'Cars'),
  path.join(os.homedir(), 'Documents', 'Assetto Corsa Competizione', 'Customs', 'Cars'),
];

class AccLiveryReader {
  constructor(store) {
    this.store    = store;
    this._watcher = null;
    this._dir     = null;
    this._debounce = null;
    this._map     = new Map();   // raceNumber → teamName
  }

  start() {
    this._dir = CANDIDATES.find(d => fs.existsSync(d));
    if (!this._dir) {
      console.warn('[Livery] Cars folder not found, skipping');
      return;
    }
    console.log('[Livery] Scanning', this._dir);

    // Initial scan
    this._scanAll();
    this._pushToStore();

    // Watch for new / changed files
    try {
      this._watcher = fs.watch(this._dir, (event, filename) => {
        if (!filename || !filename.endsWith('.json')) return;
        clearTimeout(this._debounce);
        this._debounce = setTimeout(() => {
          this._parseFile(path.join(this._dir, filename));
          this._pushToStore();
        }, 300);
      });
    } catch (e) {
      console.warn('[Livery] fs.watch failed:', e.message);
    }
  }

  stop() {
    if (this._watcher) { this._watcher.close(); this._watcher = null; }
    clearTimeout(this._debounce);
  }

  _scanAll() {
    let files;
    try { files = fs.readdirSync(this._dir); } catch { return; }
    for (const f of files) {
      if (!f.endsWith('.json')) continue;
      this._parseFile(path.join(this._dir, f));
    }
    console.log('[Livery] Found', this._map.size, 'cars with team names');
  }

  _parseFile(filePath) {
    try {
      const raw = fs.readFileSync(filePath);
      if (raw.length < 4) return;
      // ACC writes UTF-16 LE (with or without BOM) — detect by null byte after first char
      const isUtf16 = (raw[0] === 0xFF && raw[1] === 0xFE) || raw[1] === 0x00;
      const text = isUtf16
        ? raw.toString('utf16le').replace(/^\uFEFF/, '')
        : raw.toString('utf8').replace(/^\uFEFF/, '');
      const obj = JSON.parse(text);
      const rn = obj.raceNumber;
      const tn = obj.teamName?.trim();
      if (rn > 0 && tn) {
        this._map.set(rn, tn);
      }
    } catch {}
  }

  _pushToStore() {
    this.store.setLiveryTeamNames(this._map);
  }
}

module.exports = AccLiveryReader;
