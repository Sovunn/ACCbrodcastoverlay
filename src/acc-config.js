'use strict';

// Auto-writes ACC's broadcasting.json so the overlay works without
// any manual configuration inside ACC.

const fs   = require('fs');
const path = require('path');
const os   = require('os');

const CONFIG_DIR  = path.join(os.homedir(), 'Documents', 'Assetto Corsa Competizione', 'Config');
const CONFIG_PATH = path.join(CONFIG_DIR, 'broadcasting.json');

function ensureBroadcastEnabled(port = 9000) {
  let existed = false;
  let existing = null;

  try {
    existed = fs.existsSync(CONFIG_PATH);
    if (existed) existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
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

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
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
