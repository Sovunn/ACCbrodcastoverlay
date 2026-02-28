'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  ACC Broadcast API v4 – UDP client
//  Reference: Kunos Simulazioni ACC Broadcast SDK (C# reference implementation)
//
//  Message type IDs
const MSG_IN = {
  REGISTRATION_RESULT:  1,
  REALTIME_UPDATE:      2,   // whole-session update
  REALTIME_CAR_UPDATE:  3,   // per-car update  (250 ms)
  ENTRY_LIST:           4,   // car-index list notification
  TRACK_DATA:           5,
  ENTRY_LIST_CAR:       6,   // per-car entry (names, model, …)
};
const MSG_OUT = {
  REGISTER:            1,
  UNREGISTER:          9,
  REQUEST_ENTRY_LIST:  10,
  REQUEST_TRACK_DATA:  11,
};
const PROTOCOL_VERSION = 4;
// ─────────────────────────────────────────────────────────────────────────────

const dgram = require('dgram');

class AccUdpClient {
  constructor(store, options = {}) {
    this.store              = store;
    this.host               = options.host               ?? '127.0.0.1';
    this.port               = options.port               ?? 9000;
    this.displayName        = options.displayName        ?? 'ACC Overlay';
    this.connectionPassword = options.connectionPassword ?? '';
    this.commandPassword    = options.commandPassword    ?? '';
    this.updateIntervalMs   = options.updateIntervalMs   ?? 250;
    this.sock               = null;
    this.connectionId       = -1;
    this._retryTimer        = null;
    this._heartbeatTimer    = null;
    this._entryRefreshTimer = null;
    this._lastPacketMs      = 0;
    this._lastSessionKey    = null;   // 'eventIndex_sessionIndex' — changes on new session
    this._todPrev           = -1;     // previous timeOfDay sample (game seconds)
    this._todRealMs         = 0;      // real timestamp of previous sample
    this._sessClockPrev     = null;   // previous session clock sample (game seconds)
    this._sessClockRealMs   = 0;      // real timestamp of previous session clock sample
    this._tmFromTod         = null;   // preferred weather/day-night multiplier
    this._tmFromSession     = null;   // fallback estimate from session clock
    this._tmTodLastMs       = 0;
  }

  start() { this._connect(); }

  forceRefresh() {
    if (!this.sock) return;
    if (this.connectionId >= 0) {
      this._send(this._buildCmd(MSG_OUT.REQUEST_ENTRY_LIST));
      this._send(this._buildCmd(MSG_OUT.REQUEST_TRACK_DATA));
      console.log('[UDP] Force refresh requested');
      return;
    }
    this._send(this._buildRegister());
    console.log('[UDP] Force refresh requested (re-register)');
  }

  // ── Connection ────────────────────────────────────────────────────────────
  _connect() {
    clearInterval(this._heartbeatTimer);
    clearInterval(this._entryRefreshTimer);
    if (this.sock) { try { this.sock.close(); } catch {} }

    this.sock = dgram.createSocket('udp4');

    this.sock.on('message', (msg) => {
      this._lastPacketMs = Date.now();
      try { this._dispatch(msg); }
      catch (e) {
        this.store.parseErrors++;
        this.store.lastParseErr = e.message;
        console.error('[UDP] dispatch error:', e.message);
      }
    });

    this.sock.on('error', (err) => {
      console.error('[UDP] socket error:', err.message);
      this._scheduleReconnect();
    });

    this.sock.bind(0, () => {
      this._lastPacketMs = Date.now();
      console.log('[UDP] Bound – sending registration…');
      this._send(this._buildRegister());

      // Retry registration every 5 s until ACC responds
      this._retryTimer = setInterval(() => {
        if (this.connectionId < 0) {
          console.log('[UDP] Retrying registration…');
          this._send(this._buildRegister());
        }
      }, 5000);

      // Heartbeat: if connected but no packets for 15 s, ACC probably
      // changed servers — re-register so we get a fresh entry list.
      this._heartbeatTimer = setInterval(() => {
        if (this.connectionId >= 0 && Date.now() - this._lastPacketMs > 15000) {
          console.log('[UDP] Heartbeat timeout — re-registering');
          this.connectionId    = -1;
          this._lastSessionKey = null;
          this.store.setDisconnected();
          this.store.resetForNewServer();
          clearInterval(this._retryTimer);
          this._send(this._buildRegister());
          this._retryTimer = setInterval(() => {
            if (this.connectionId < 0) {
              console.log('[UDP] Retrying registration…');
              this._send(this._buildRegister());
            }
          }, 5000);
        }
      }, 5000);

      // Periodic static entry refresh (late joiners / driver swaps)
      this._entryRefreshTimer = setInterval(() => {
        if (this.connectionId >= 0) {
          this._send(this._buildCmd(MSG_OUT.REQUEST_ENTRY_LIST));
        }
      }, 30000);
    });
  }

  _scheduleReconnect() {
    clearInterval(this._heartbeatTimer);
    clearInterval(this._entryRefreshTimer);
    this.store.setDisconnected();
    this.connectionId = -1;
    clearInterval(this._retryTimer);
    setTimeout(() => this._connect(), 5000);
  }

  _send(buf) {
    this.sock?.send(buf, this.port, this.host,
      (err) => { if (err) console.error('[UDP] send error:', err.message); });
  }

  // ── Outbound builders ────────────────────────────────────────────────────

  /** Write an ACC string: uint16-LE byte length + UTF-8 bytes */
  _ws(parts, s) {
    const enc = Buffer.from(s, 'utf8');
    const len = Buffer.alloc(2); len.writeUInt16LE(enc.length);
    parts.push(len, enc);
  }

  _buildRegister() {
    const parts = [Buffer.from([MSG_OUT.REGISTER, PROTOCOL_VERSION])];
    this._ws(parts, this.displayName);
    this._ws(parts, this.connectionPassword);
    const ms = Buffer.alloc(4); ms.writeInt32LE(this.updateIntervalMs);
    parts.push(ms);
    this._ws(parts, this.commandPassword);
    return Buffer.concat(parts);
  }

  _buildCmd(msgType) {
    const b = Buffer.alloc(5);
    b[0] = msgType;
    b.writeInt32LE(this.connectionId, 1);
    return b;
  }

  // ── Inbound primitives ────────────────────────────────────────────────────

  /** Read ACC string → [string, newOffset] */
  _rs(buf, off) {
    const len = buf.readUInt16LE(off); off += 2;
    return [buf.toString('utf8', off, off + len), off + len];
  }

  /**
   * Read LapInfo → [lapInfo, newOffset]
   * Layout (per Kunos C# SDK):
   *   lapTimeMs    : int32
   *   carIndex     : uint16
   *   driverIndex  : uint16
   *   splitCount   : uint8   (NOT uint16)
   *   splits       : int32 × splitCount
   *   isInvalid    : uint8
   *   isValidForBest: uint8
   *   isOutlap     : uint8
   *   isInlap      : uint8
   */
  _rl(buf, off) {
    const lapMs        = buf.readInt32LE(off);  off += 4;
    /* carIndex */                               off += 2;
    /* driverIndex */                            off += 2;
    const splitCount   = buf[off];               off += 1;
    off += splitCount * 4;
    const isInvalid      = buf[off]; off += 1;
    const isValidForBest = buf[off]; off += 1;
    const isOutlap       = buf[off]; off += 1;
    const isInlap        = buf[off]; off += 1;
    const lapType = isOutlap ? 0 : isInlap ? 2 : 1; // 0=OUT, 1=NORMAL, 2=IN
    return [{ lapMs, isInvalid, isValidForBest, lapType }, off];
  }

  // ── Dispatcher ────────────────────────────────────────────────────────────
  _dispatch(buf) {
    const t   = buf[0];
    const off = 1;       // all parsers start after the type byte
    switch (t) {
      case MSG_IN.REGISTRATION_RESULT: this._onReg(buf, off);      break;
      case MSG_IN.REALTIME_UPDATE:     this._onSession(buf, off);  break;
      case MSG_IN.REALTIME_CAR_UPDATE: this._onCar(buf, off);      break;
      case MSG_IN.ENTRY_LIST_CAR:      this._onCarEntry(buf, off); break;
      case MSG_IN.TRACK_DATA:          this._onTrack(buf, off);    break;
      case MSG_IN.ENTRY_LIST:          /* push notification – ENTRY_LIST_CAR follows automatically */ break;
      default: break;
    }
  }

  // ── Message handlers ─────────────────────────────────────────────────────

  _onReg(buf, off) {
    const id = buf.readInt32LE(off); off += 4;
    const ro = buf[off];             off += 1;
    const [err] = this._rs(buf, off);
    if (id < 0) { console.error('[UDP] Registration failed:', err); return; }

    this.connectionId    = id;
    this._lastSessionKey = null;   // will be set on first REALTIME_UPDATE
    this.store.setConnected(id);
    this.store.resetForNewServer(); // new server → clear both entries and realtimes
    clearInterval(this._retryTimer);
    console.log(`[UDP] Connected  id=${id}  readOnly=${!!ro}`);

    // Request full entry list + track info immediately
    this._send(this._buildCmd(MSG_OUT.REQUEST_ENTRY_LIST));
    this._send(this._buildCmd(MSG_OUT.REQUEST_TRACK_DATA));
  }

  /**
   * REALTIME_UPDATE – whole-session data
   *
   * Layout (v4, offsets from byte 1):
   *   eventIndex      : uint16
   *   sessionIndex    : uint16
   *   sessionType     : uint8
   *   phase           : uint8
   *   sessionTime     : float32  (ms)
   *   sessionEndTime  : float32  (ms)
   *   focusedCarIndex : int32
   *   activeCameraSet : string
   *   activeCamera    : string
   *   currentHudPage  : string
   *   isReplayPlaying : uint8
   *     [if replay] replaySessionTime : float32, replayRemainingTime : float32
   *   timeOfDay       : float32
   *   ambientTemp     : uint8
   *   trackTemp       : uint8
   *   clouds          : uint8   (0–10 scale, skip)
   *   rainLevel       : uint8   (0–10 scale, skip)
   *   wetness         : uint8   (0–10 scale, skip)
   *   weatherTypeNow  : uint8   AccWeatherType: 0=DRY 1=CLOUDS 2=RAIN 3=THUNDERSTORM
   *   weatherIn10min  : uint8
   *   weatherIn30min  : uint8
   *   (remaining bytes: grip forecasts — not parsed here)
   *   NOTE: trackGripStatus is read from acpmf_graphics shared memory (acc-shm.js)
   */
  _onSession(buf, off) {
    const eventIndex   = buf.readUInt16LE(off); off += 2;
    const sessionIndex = buf.readUInt16LE(off); off += 2;
    const sessionKey   = `${eventIndex}_${sessionIndex}`;

    // Detect session change (eventIndex or sessionIndex changed after first update)
    if (this._lastSessionKey !== null && sessionKey !== this._lastSessionKey) {
      console.log(`[UDP] Session changed ${this._lastSessionKey} → ${sessionKey}`);
      // Only clear realtimes — carEntries stays valid because the same cars
      // remain in the server lobby across P/Q/R sessions.
      // Realtimes refill automatically within 250 ms from REALTIME_CAR_UPDATE.
      this.store.resetSessionCars();
    }
    this._lastSessionKey = sessionKey;

    const sessionType    = buf[off]; off += 1;
    const phase          = buf[off]; off += 1;
    const sessionTime    = buf.readFloatLE(off) / 1000; off += 4;   // ms → s
    const sessionEndTime = buf.readFloatLE(off) / 1000; off += 4;   // ms → s
    this._updateTimeMultiplierFromSessionClock(sessionEndTime > 0 ? sessionEndTime : sessionTime);

    // Extended fields (v4) — wrapped in try/catch for older ACC versions
    // NOTE: rain forecast comes from SHM (acc-shm.js), NOT from UDP.
    //       UDP uses a coarser 0-3 AccWeatherType enum; SHM has the accurate
    //       0-5 rainIntensity scale.  We only pull ambientTemp/trackTemp here.
    let focusedCarIndex = -1;
    let ambientTemp, trackTemp;
    let timeOfDay;
    try {
      focusedCarIndex = buf.readInt32LE(off); off += 4;
      let _cam1, _cam2, _hud;
      [_cam1, off] = this._rs(buf, off);   // activeCameraSet
      [_cam2, off] = this._rs(buf, off);   // activeCamera
      [_hud,  off] = this._rs(buf, off);   // currentHudPage
      const isReplay = buf[off]; off += 1;
      if (isReplay) off += 8;              // replaySessionTime + replayRemainingTime (2×float32)
      timeOfDay = buf.readFloatLE(off); off += 4;  // seconds since midnight (game time)
      this._updateTimeMultiplier(timeOfDay);
      ambientTemp = buf[off]; off += 1;
      trackTemp   = buf[off];
    } catch { /* older ACC — extended fields unavailable */ }

    this.store.updateSession({
      sessionType, phase, sessionTime, sessionEndTime,
      focusedCarIndex,
      ambientTemp, trackTemp,
      eventIndex, sessionIndex, sessionKey,
    });
  }

  /** Calculate game-time multiplier from timeOfDay progression */
  _updateTimeMultiplier(tod) {
    const now = Date.now();
    if (!(tod > 0)) return;
    if (this._todPrev >= 0) {
      if (Math.abs(tod - this._todPrev) < 0.001) return; // ignore unchanged coarse samples
      const realDeltaS = (now - this._todRealMs) / 1000;
      let gameDelta = tod - this._todPrev;
      // Handle midnight wrap (86400 = seconds in a day)
      if (gameDelta < -43200) gameDelta += 86400;
      if (realDeltaS > 0.2 && realDeltaS < 5 && gameDelta > 0) {
        const mult = gameDelta / realDeltaS;
        if (!Number.isFinite(mult) || mult < 0.1 || mult > 30) {
          this._todPrev = tod;
          this._todRealMs = now;
          return;
        }
        const prev = this._tmFromTod ?? mult;
        this._tmFromTod = prev * 0.8 + mult * 0.2;
        this._tmTodLastMs = now;
        this._commitTimeMultiplier();
      }
    }
    this._todPrev = tod;
    this._todRealMs = now;
  }

  /** Fallback multiplier estimate from session clock progression (works even if timeOfDay is unreliable). */
  _updateTimeMultiplierFromSessionClock(clockS) {
    const now = Date.now();
    if (!(clockS >= 0)) return;
    if (this._tmTodLastMs > 0 && (now - this._tmTodLastMs) < 15000) {
      this._sessClockPrev = clockS;
      this._sessClockRealMs = now;
      return;
    }
    if (this._sessClockPrev != null && this._sessClockRealMs > 0) {
      const realDeltaS = (now - this._sessClockRealMs) / 1000;
      const gameDeltaAbs = Math.abs(clockS - this._sessClockPrev);
      if (realDeltaS > 0.2 && realDeltaS < 5 && gameDeltaAbs > 0.001) {
        const mult = gameDeltaAbs / realDeltaS;
        if (Number.isFinite(mult) && mult >= 0.1 && mult <= 30) {
          const prev = this._tmFromSession ?? mult;
          this._tmFromSession = prev * 0.8 + mult * 0.2;
          this._commitTimeMultiplier();
        }
      }
    }
    this._sessClockPrev = clockS;
    this._sessClockRealMs = now;
  }

  _commitTimeMultiplier() {
    const tm = this._tmFromTod ?? this._tmFromSession;
    if (Number.isFinite(tm) && tm > 0) this.store.session.timeMultiplier = tm;
  }

  /**
   * REALTIME_CAR_UPDATE – per-car data every ~250 ms
   *
   * Layout (v4):
   *   carIndex      : uint16
   *   driverIndex   : uint16
   *   driverCount   : uint8
   *   gear          : uint8   (0=R, 1=N, 2=1st, …)
   *   worldPosX     : float32
   *   worldPosY     : float32
   *   yaw           : float32
   *   carLocation   : uint8   (0=NONE,1=TRACK,2=PITLANE,3=PITENTRY,4=PITEXIT)
   *   speedKmh      : uint16  (integer km/h – NOT float!)
   *   position      : uint16  (overall race position, 1-based)
   *   cupPosition   : uint16
   *   trackPosition : uint16
   *   splinePosition: float32 (0.0–1.0 along track)
   *   laps          : uint16
   *   delta         : int32
   *   (lap times are read from acpmf_graphics SHM — see acc-shm.js)
   */
  _onCar(buf, off) {
    try {
      const carIndex       = buf.readUInt16LE(off); off += 2;
      const driverIndex    = buf.readUInt16LE(off); off += 2;
      const driverCount    = buf[off];              off += 1;
      const gear           = buf[off];              off += 1;
      off += 12;   // worldPosX + worldPosY + yaw  (3 × float32)
      const carLocation    = buf[off];              off += 1;
      const speedKmh       = buf.readUInt16LE(off); off += 2;   // ← uint16, NOT float32
      const position       = buf.readUInt16LE(off); off += 2;
      const cupPosition    = buf.readUInt16LE(off); off += 2;
      const trackPosition  = buf.readUInt16LE(off); off += 2;
      const splinePosition = buf.readFloatLE(off);  off += 4;
      const laps           = buf.readUInt16LE(off); off += 2;
      const delta          = buf.readInt32LE(off);  off += 4;

      // Read LapInfo: bestSessionLap first, then lastLap
      // Each try is independent so a failure on lastLap doesn't lose bestSessionLap
      let bestSessionLapMs = -1;
      let lastLapMs        = -1;
      let lastLapValidForBest = undefined;
      let lastLapTypeRaw      = undefined;
      let off2 = off;
      try {
        const [bestLap, newOff] = this._rl(buf, off);
        off2 = newOff;
        if (bestLap && typeof bestLap.lapMs === 'number') {
          bestSessionLapMs = bestLap.lapMs;
        }
      } catch {}
      try {
        const [lastLap] = this._rl(buf, off2);
        if (lastLap && typeof lastLap.lapMs === 'number') {
          lastLapMs = lastLap.lapMs;
          // Treat "valid for best" and "not invalid" as our validity flag
          if (typeof lastLap.isInvalid === 'number' && typeof lastLap.isValidForBest === 'number') {
            lastLapValidForBest = !lastLap.isInvalid && !!lastLap.isValidForBest;
          }
          if (typeof lastLap.lapType === 'number') {
            lastLapTypeRaw = lastLap.lapType;
          }
        }
      } catch {}


      this.store.updateCarRealtime({
        carIndex, driverIndex, driverCount, gear,
        speedKmh, position, cupPosition, trackPosition,
        splinePosition, laps, delta, carLocation,
        bestSessionLapMs, lastLapMs,
        lastLapValidForBest, lastLapTypeRaw,
      });
    } catch (e) {
      this.store.parseErrors++;
      this.store.lastParseErr = 'car:' + e.message;
    }
  }

  /**
   * ENTRY_LIST_CAR – static car/driver info (sent once after REQUEST_ENTRY_LIST)
   *
   * Layout (v4):
   *   carIndex           : uint16
   *   carModelType       : uint8
   *   teamName           : string
   *   raceNumber         : int32
   *   cupCategory        : uint8
   *   currentDriverIndex : uint8
   *   carNationality     : uint16  ← v4 addition (skip it)
   *   driversCount       : uint8
   *   [ for each driver ]
   *     firstName        : string
   *     lastName         : string
   *     shortName        : string
   *     driverCategory   : uint8
   *     nationality      : uint16  ← uint16, NOT a string!
   */
  _onCarEntry(buf, off) {
    try {
      const carIndex   = buf.readUInt16LE(off); off += 2;
      const carModel   = buf[off];              off += 1;
      let teamName; [teamName, off] = this._rs(buf, off);
      const raceNumber = buf.readInt32LE(off);  off += 4;
      const cupCat     = buf[off];              off += 1;
      const curDriver  = buf[off];              off += 1;
      off += 2;   // carNationality uint16 (v4) – not needed
      const drvCount   = buf[off];              off += 1;

      const drivers = [];
      for (let i = 0; i < drvCount; i++) {
        let fn, ln, sn;
        [fn, off] = this._rs(buf, off);
        [ln, off] = this._rs(buf, off);
        [sn, off] = this._rs(buf, off);
        const cat = buf[off];              off += 1;
        const nat = buf.readUInt16LE(off); off += 2;   // nationality uint16
        drivers.push({ firstName: fn, lastName: ln, shortName: sn, category: cat, nationality: nat });
      }

      this.store.updateCarEntry({
        carIndex, carModelType: carModel, teamName, raceNumber,
        cupCategory: cupCat,
        currentDriverIndex: Math.min(curDriver, Math.max(0, drvCount - 1)),
        drivers,
      });
    } catch (e) {
      this.store.parseErrors++;
      this.store.lastParseErr = 'entry:' + e.message;
      console.error('[UDP] _onCarEntry parse error:', e.message);
    }
  }

  /**
   * TRACK_DATA
   *
   * Layout:
   *   connectionId  : int32
   *   trackName     : string
   *   trackId       : int32
   *   trackLengthM  : float32
   *   … (camera sets – not needed)
   */
  _onTrack(buf, off) {
    off += 4;   // skip connectionId
    let name; [name, off] = this._rs(buf, off);
    off += 4;   // skip trackId
    const lengthM = buf.readFloatLE(off);
    this.store.updateTrack(name, lengthM);
    console.log(`[UDP] Track: ${name}  (${Math.round(lengthM)} m)`);
  }
}

module.exports = AccUdpClient;
