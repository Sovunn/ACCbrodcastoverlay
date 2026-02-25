'use strict';

// Auto-writes ACC's broadcasting.json so the overlay works without
// any manual configuration inside ACC.

const fs   = require('fs');
const path = require('path');
const os   = require('os');

// ACC config may live under OneDrive-redirected Documents or the standard path
const CANDIDATES = [
  path.join(os.homedir(), 'OneDrive', 'Documents', 'Assetto Corsa Competizione', 'Config'),
  path.join(os.homedir(), 'Documents', 'Assetto Corsa Competizione', 'Config'),
];
const CONFIG_DIR  = CANDIDATES.find(d => fs.existsSync(d)) ?? CANDIDATES[CANDIDATES.length - 1];
const CONFIG_PATH = path.join(CONFIG_DIR, 'broadcasting.json');

function ensureBroadcastEnabled(port = 9000) {
  let existed = false;
  let existing = null;

  try {
    existed = fs.existsSync(CONFIG_PATH);
    if (existed) {
      const raw = fs.readFileSync(CONFIG_PATH);
      // ACC writes UTF-16 LE with BOM — detect and decode accordingly
      const text = (raw[0] === 0xFF && raw[1] === 0xFE)
        ? raw.toString('utf16le').replace(/^\uFEFF/, '')
        : raw.toString('utf8').replace(/^\uFEFF/, '');
      existing = JSON.parse(text);
    }
  } catch {}

  // Already configured correctly — nothing to do
  if (
    existing &&
    existing.updListenerPort === port &&
    existing.connectionPassword === '' &&
    existing.commandPassword   === ''
  ) {
    return { modified: false, existed, path: CONFIG_PATH };
  }

  // Create directory tree if ACC was never launched
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const config = {
    updListenerPort:    port,
    connectionPassword: '',
    commandPassword:    '',
    maxConnections:     1,
  };

  // ACC writes UTF-16 LE with BOM — match that format
  const json = JSON.stringify(config, null, '\t');
  fs.writeFileSync(CONFIG_PATH, Buffer.from('\ufeff' + json, 'utf16le'));
  console.log(`[Config] Broadcasting enabled on port ${port} → ${CONFIG_PATH}`);
  return { modified: true, existed, path: CONFIG_PATH };
}

// Detect if ACC is currently running
function isAccRunning() {
  try {
    const { execSync } = require('child_process');
    const out = execSync('tasklist /FI "IMAGENAME eq AC2-Win64-Shipping.exe" /NH', { encoding: 'utf8', timeout: 2000 });
    return out.includes('AC2-Win64-Shipping.exe');
  } catch {
    return false;
  }
}

module.exports = { ensureBroadcastEnabled, isAccRunning, CONFIG_PATH };
