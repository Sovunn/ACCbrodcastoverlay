'use strict';

const { CLASS_ORDER, getCarClass, getManufacturerAbbr } = require('./car-data');
const { getNatFlag } = require('./nationality-data');

class DataStore {
  constructor() {
    this.connected    = false;
    this.connectionId = -1;
    this.session      = {
      sessionType: -1, phase: 0, sessionTime: 0, sessionEndTime: 0,
      focusedCarIndex: -1,
      ambientTemp: undefined, trackTemp: undefined, trackGripStatus: undefined,
      rainNow: undefined, rainIn10: undefined, rainIn30: undefined,
      shmCurrentLapMs: -1, shmLastLapMs: -1, shmBestLapMs: -1,
    };
    this.carEntries   = new Map();    // carIndex → entry
    this.carRealtimes = new Map();    // carIndex → realtime
    this.trackName    = '';
    this.trackLength  = 0;
    this.parseErrors  = 0;
    this.lastParseErr = '';
  }

  // ── Reset ─────────────────────────────────
  reset() {
    this.connected    = false;
    this.connectionId = -1;
    this.session      = {
      sessionType: -1, phase: 0, sessionTime: 0, sessionEndTime: 0,
      focusedCarIndex: -1,
    };
    this.carEntries.clear();
    this.carRealtimes.clear();
    this.trackName    = '';
    this.trackLength  = 0;
  }

  // Session change on the SAME server — only realtime data changes.
  // carEntries (driver names / car models) stays valid because the same cars
  // are in the lobby all weekend.  Realtimes refill within 250 ms from the
  // ongoing REALTIME_CAR_UPDATE stream.
  resetSessionCars() {
    this.carRealtimes.clear();
  }

  // Full reset when reconnecting to a (potentially different) server.
  resetForNewServer() {
    this.carEntries.clear();
    this.carRealtimes.clear();
  }

  // ── Writers ───────────────────────────────
  setConnected(id)          { this.connected = true;  this.connectionId = id; }
  setDisconnected()         { this.connected = false; this.connectionId = -1; }
  updateSession(s)          { this.session = { ...this.session, ...s }; }
  updateCarEntry(e)         { this.carEntries.set(e.carIndex, e); }
  updateCarRealtime(rt) {
    const prev = this.carRealtimes.get(rt.carIndex);
    if (prev) {
      // Preserve valid lap times — if the new read failed (=-1) or has no lap yet (=0x7FFFFFFF),
      // keep the previously stored value so a bad packet doesn't wipe a good one.
      if (!(rt.lastLapMs > 0 && rt.lastLapMs < 0x7FFFFFFF))
        rt.lastLapMs = prev.lastLapMs;
      if (!(rt.bestSessionLapMs > 0 && rt.bestSessionLapMs < 0x7FFFFFFF))
        rt.bestSessionLapMs = prev.bestSessionLapMs;
    }
    this.carRealtimes.set(rt.carIndex, rt);
  }
  updateTrack(name, len)    { this.trackName = name; this.trackLength = len; }
  // Called by SHM reader — all four weather fields from SPageFileGraphic
  updateShmWeather(grip, r0, r10, r30) {
    if (grip >= 0 && grip <= 6) this.session.trackGripStatus = grip;
    if (r0  >= 0 && r0  <= 5) this.session.rainNow  = r0;
    if (r10 >= 0 && r10 <= 5) this.session.rainIn10 = r10;
    if (r30 >= 0 && r30 <= 5) this.session.rainIn30 = r30;
  }

  // Called by SHM reader — lap times from SPageFileGraphic (offsets 140/144/148)
  updateShmLapTimes(cur, last, best) {
    if (cur  > 0) this.session.shmCurrentLapMs = cur;
    if (last > 0) this.session.shmLastLapMs    = last;
    if (best > 0) this.session.shmBestLapMs    = best;
  }

  // ── Focused car lookup ────────────────────
  _getFocusedCarData() {
    const ci = this.session.focusedCarIndex;
    if (ci == null || ci < 0) return null;
    const entry = this.carEntries.get(ci);
    const rt    = this.carRealtimes.get(ci);
    if (!entry || !rt) return null;

    const driver = entry.drivers?.[entry.currentDriverIndex ?? 0] ?? entry.drivers?.[0];
    const flag   = driver ? getNatFlag(driver.nationality) : '🏳️';

    const shmLast  = this.session.shmLastLapMs;
    const udpLast  = rt.lastLapMs;
    let   lastLapMs = -1;
    if (shmLast > 0 && shmLast < 0x7FFFFFFF) {
      lastLapMs = shmLast;
    } else if (udpLast > 0 && udpLast < 0x7FFFFFFF) {
      lastLapMs = udpLast;
    }

    return {
      carIndex:         ci,
      raceNumber:       entry.raceNumber,
      driverText:       buildDriverText(entry),
      teamName:         entry.teamName ?? '',
      manufacturerAbbr: getManufacturerAbbr(entry.carModelType),
      bestLapMs:        rt.bestSessionLapMs ?? -1,
      lastLapMs,
      classPosition:    rt.cupPosition      ?? 0,
      overallPosition:  rt.position         ?? 0,
      flag,
    };
  }

  // ── Main standings builder ────────────────
  getStandings() {
    const trackLength      = this.trackLength;
    const focusedCarIndex  = this.session.focusedCarIndex ?? -1;
    // Non-race: practice(0), qualifying(1), superpole(2), hotlap(4), hotstint(5), hotlap-superpole(6)
    const QUALI_TYPES      = new Set([0, 1, 2, 4, 5, 6]);
    const isRace           = !QUALI_TYPES.has(this.session.sessionType);

    // Merge entries + realtimes, filtering out cars with no useful data
    const allCars = [];
    for (const [ci, rt] of this.carRealtimes) {
      const entry = this.carEntries.get(ci);
      if (!entry) continue;
      // Skip cars that are present on the server but haven't gone on track yet
      if (rt.position === 0 && rt.laps === 0) continue;
      allCars.push({ carIndex: ci, entry, rt });
    }

    // Sort by overall position (ties → higher spline first)
    allCars.sort((a, b) => {
      const pa = a.rt.position > 0 ? a.rt.position : 9999;
      const pb = b.rt.position > 0 ? b.rt.position : 9999;
      return pa !== pb ? pa - pb : b.rt.splinePosition - a.rt.splinePosition;
    });

    // Group by class (preserving sort order within each group)
    const grouped = {};
    for (const car of allCars) {
      const cls = getCarClass(car.entry.carModelType);
      (grouped[cls] = grouped[cls] ?? []).push(car);
    }

    // Determine cap (10 per class in multiclass, 20 in single class)
    const activeClasses = CLASS_ORDER.filter(c => grouped[c]?.length > 0);
    const isMulticlass  = activeClasses.length > 1;
    const carCap        = isMulticlass ? 10 : 20;

    // Build output per class
    const outClasses = {};
    for (const cls of CLASS_ORDER) {
      const cars = grouped[cls];
      if (!cars?.length) continue;

      const classLeader = cars[0];

      // Focus window: find focused driver, shift window to show them
      const focusedIdx = cars.findIndex(c => c.carIndex === focusedCarIndex);
      let displayStart = 0;
      if (focusedIdx > 0 && focusedIdx >= carCap) {
        displayStart = Math.max(0, focusedIdx - 4);
      }
      const displayCars = cars.slice(displayStart, displayStart + carCap);

      const leaderBestMs = classLeader.rt.bestSessionLapMs ?? -1;

      outClasses[cls] = displayCars.map((car, i) => {
        const { entry, rt } = car;
        const classPos = displayStart + i + 1;   // 1-based position in full class order

        let gapText, gapLaps;
        if (displayStart + i === 0) {
          gapText = 'LEADER'; gapLaps = 0;
        } else if (isRace) {
          [gapText, gapLaps] = computeGap(car, classLeader, trackLength);
        } else {
          // Practice / Qualifying: gap to P1's best session lap time
          const carBest = rt.bestSessionLapMs ?? -1;
          if (carBest > 0 && carBest < 0x7FFFFFFF && leaderBestMs > 0 && leaderBestMs < 0x7FFFFFFF) {
            gapText = formatLapDelta(carBest - leaderBestMs); gapLaps = 0;
          } else {
            gapText = 'NO TIME'; gapLaps = 0;
          }
        }

        return {
          carIndex:        car.carIndex,
          raceNumber:      entry.raceNumber,
          teamName:        entry.teamName ?? '',
          driverText:      buildDriverText(entry),
          manufacturerAbbr: getManufacturerAbbr(entry.carModelType),
          carModelType:    entry.carModelType,
          classPosition:   classPos,
          overallPosition: rt.position,
          laps:            rt.laps,
          spline:          rt.splinePosition,
          speedKmh:        rt.speedKmh,
          gapText,
          gapLaps,
          inPit:           [2, 3, 4].includes(rt.carLocation),
          bestLapMs:       rt.bestSessionLapMs ?? -1,
          isFocused:       car.carIndex === focusedCarIndex,
        };
      });
    }

    return {
      connected: this.connected,
      session: {
        type:            this.session.sessionType,
        phase:           this.session.phase,
        sessionTime:     this.session.sessionTime,
        sessionEndTime:  this.session.sessionEndTime,
        focusedCarIndex: this.session.focusedCarIndex ?? -1,
        ambientTemp:     this.session.ambientTemp,
        trackTemp:       this.session.trackTemp,
        trackGripStatus: this.session.trackGripStatus,
        rainNow:         this.session.rainNow,
        rainIn10:        this.session.rainIn10,
        rainIn30:        this.session.rainIn30,
        shmLastLapMs:    this.session.shmLastLapMs,
      },
      track:        { name: this.trackName, lengthM: this.trackLength },
      classes:      outClasses,
      focusedCar:   this._getFocusedCarData(),
      entryCount:   this.carEntries.size,
      realtimeCount: this.carRealtimes.size,
      parseErrors:  this.parseErrors,
      lastParseErr: this.lastParseErr,
    };
  }
}

// ── Helpers ───────────────────────────────────

function buildDriverText(entry) {
  if (!entry.drivers?.length) return '';
  return entry.drivers.map(d => {
    const fn = (d.firstName ?? '').trim();
    const ln = (d.lastName  ?? '').trim();
    return fn ? `${fn[0]}. ${ln}` : ln;
  }).join(' / ');
}

function formatLapDelta(ms) {
  if (ms >= 60000) {
    const m = Math.floor(ms / 60000);
    const s = ((ms % 60000) / 1000).toFixed(3).padStart(6, '0');
    return `+${m}:${s}`;
  }
  return `+${(ms / 1000).toFixed(3)}`;
}

function computeGap(behind, ahead, trackLength) {
  const brt = behind.rt;
  const art  = ahead.rt;
  const lapDiff = art.laps - brt.laps;

  if (lapDiff >= 1) return [`+${lapDiff}L`, lapDiff];

  let splineDiff = art.splinePosition - brt.splinePosition;
  if (splineDiff < 0) splineDiff += 1.0;   // ahead just crossed the line
  if (splineDiff <= 0.0001) return ['+0.0', 0];

  let gapS;
  const refLapMs = brt.lastLapMs ?? brt.bestSessionLapMs ?? -1;
  if (refLapMs > 5000) {
    gapS = splineDiff * (refLapMs / 1000);
  } else if (trackLength > 100) {
    const speedMs = Math.max(brt.speedKmh / 3.6, 40);
    gapS = (splineDiff * trackLength) / speedMs;
  } else {
    gapS = splineDiff * 120;
  }

  if (gapS >= 60) {
    const m = Math.floor(gapS / 60);
    const s = (gapS - m * 60).toFixed(1).padStart(4, '0');
    return [`+${m}:${s}`, 0];
  }
  return [`+${gapS.toFixed(1)}`, 0];
}

module.exports = DataStore;
