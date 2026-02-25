'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  ACC Shared Memory Reader  (SPageFileGraphic  →  Local\acpmf_graphics)
//
//  Reads fields from SPageFileGraphic:
//
//    Offset 140  iCurrentTime         float (ms) — current lap time
//    Offset 144  iLastTime            float (ms) — last completed lap
//    Offset 148  iBestTime            float (ms) — best session lap
//
//  SPageFileGraphic layout (why 140/144/148):
//    packetId(4) + status(4) + session(4)          = 12 bytes
//    currentTime wchar_t[15]                        = 30 bytes  → 42
//    lastTime    wchar_t[15]                        = 30 bytes  → 72
//    bestTime    wchar_t[15]                        = 30 bytes  → 102
//    split       wchar_t[15]                        = 30 bytes  → 132
//    completedLaps(4) + position(4)                 = 8 bytes   → 140
//    → iCurrentTime float32 at 140, iLastTime at 144, iBestTime at 148
//
//    Offset 1556  trackGripStatus     0=Green 1=Fast 2=Optimum 3=Greasy 4=Damp 5=Wet 6=Flooded
//    Offset 1560  rainIntensity       0=No rain 1=Drizzle 2=Light 3=Medium 4=Heavy 5=Thunderstorm
//    Offset 1564  rainIntensityIn10min (same enum)
//    Offset 1568  rainIntensityIn30min (same enum)
//
//  Uses .NET System.IO.MemoryMappedFiles — no Add-Type/compilation needed.
//  CreateViewAccessor must start at offset 0 (64 KB alignment requirement);
//  ReadInt32/ReadSingle($offset) then reads at the correct byte position.
// ─────────────────────────────────────────────────────────────────────────────

const { spawn }              = require('child_process');
const { writeFileSync, mkdirSync } = require('fs');
const { tmpdir }             = require('os');
const path                   = require('path');

const GRIP_OFFSET = 1556;   // trackGripStatus; rain fields follow at +4, +8, +12

const PS_SCRIPT = `
$off = ${GRIP_OFFSET}
while ($true) {
    $g = -1; $r0 = -1; $r10 = -1; $r30 = -1
    $tc = -1; $tl = -1; $tb = -1
    try {
        $mmf  = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting("Local\\acpmf_graphics")
        $view = $mmf.CreateViewAccessor(0, 0, [System.IO.MemoryMappedFiles.MemoryMappedFileAccess]::Read)
        $g   = $view.ReadInt32($off)
        $r0  = $view.ReadInt32($off + 4)
        $r10 = $view.ReadInt32($off + 8)
        $r30 = $view.ReadInt32($off + 12)
        $tc  = [Math]::Round($view.ReadSingle(140))
        $tl  = [Math]::Round($view.ReadSingle(144))
        $tb  = [Math]::Round($view.ReadSingle(148))
        $view.Dispose()
        $mmf.Dispose()
    } catch {
        try {
            $mmf  = [System.IO.MemoryMappedFiles.MemoryMappedFile]::OpenExisting("acpmf_graphics")
            $view = $mmf.CreateViewAccessor(0, 0, [System.IO.MemoryMappedFiles.MemoryMappedFileAccess]::Read)
            $g   = $view.ReadInt32($off)
            $r0  = $view.ReadInt32($off + 4)
            $r10 = $view.ReadInt32($off + 8)
            $r30 = $view.ReadInt32($off + 12)
            $tc  = [Math]::Round($view.ReadSingle(12))
            $tl  = [Math]::Round($view.ReadSingle(16))
            $tb  = [Math]::Round($view.ReadSingle(20))
            $view.Dispose()
            $mmf.Dispose()
        } catch {
            $g = -1; $r0 = -1; $r10 = -1; $r30 = -1
            $tc = -1; $tl = -1; $tb = -1
        }
    }
    [Console]::Out.WriteLine("$g,$r0,$r10,$r30,$tc,$tl,$tb")
    [Console]::Out.Flush()
    Start-Sleep -Milliseconds 500
}
`;

let _scriptPath = null;
function getScriptPath() {
  if (_scriptPath) return _scriptPath;
  try {
    const dir = path.join(tmpdir(), 'acc-overlay');
    mkdirSync(dir, { recursive: true });
    _scriptPath = path.join(dir, 'shm-reader.ps1');
    writeFileSync(_scriptPath, PS_SCRIPT, 'utf8');
    console.log('[SHM] Script written to', _scriptPath);
  } catch (e) {
    console.error('[SHM] Could not write script:', e.message);
  }
  return _scriptPath;
}

class AccShmReader {
  constructor(store) {
    this.store    = store;
    this._proc    = null;
    this._buf     = '';
    this._stopped = false;
  }

  start()  { this._stopped = false; this._spawn(); }
  stop()   { this._stopped = true; try { this._proc?.kill(); } catch {} this._proc = null; }

  _spawn() {
    if (this._stopped) return;
    const scriptPath = getScriptPath();
    if (!scriptPath) return;

    try {
      this._proc = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
      ]);

      this._proc.stdout.on('data', (chunk) => {
        this._buf += chunk.toString();
        const lines = this._buf.split('\n');
        this._buf = lines.pop() ?? '';
        for (const line of lines) {
          const parts = line.trim().split(',');
          if (parts.length !== 7) continue;
          const vals = parts.map(p => parseInt(p, 10));
          if (vals.some(v => isNaN(v))) continue;
          const [grip, r0, r10, r30, tc, tl, tb] = vals;
          this.store.updateShmWeather(grip, r0, r10, r30);
          this.store.updateShmLapTimes(tc, tl, tb);
        }
      });

      this._proc.stderr.on('data', (d) =>
        console.warn('[SHM] stderr:', d.toString().trim()));

      this._proc.on('close', (code) => {
        console.log(`[SHM] exited (${code}) — restarting in 3 s`);
        if (!this._stopped) setTimeout(() => this._spawn(), 3000);
      });

      this._proc.on('error', (err) => {
        console.error('[SHM] spawn error:', err.message);
        if (!this._stopped) setTimeout(() => this._spawn(), 5000);
      });

      console.log('[SHM] started — grip offset', GRIP_OFFSET, '/ lap offsets 140/144/148');
    } catch (e) {
      console.error('[SHM] catch:', e.message);
    }
  }
}

module.exports = AccShmReader;
