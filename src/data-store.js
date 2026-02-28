'use strict';

const { CLASS_ORDER, getCarClass, getManufacturerAbbr } = require('./car-data');
const { getNatFlag } = require('./nationality-data');

const INV = 0x7FFFFFFF;   // ACC sentinel meaning "no valid lap time"

const LAP_TYPE = {
  OUT: 'OUT',
  IN: 'IN',
  NORMAL: 'NORMAL',
  UNKNOWN: 'UNKNOWN',
};

class DataStore {
  constructor() {
    this.connected = false;
    this.connectionId = -1;
    this.session = {
      sessionType: -1, phase: 0, sessionTime: 0, sessionEndTime: 0,
      focusedCarIndex: -1,
      ambientTemp: undefined, trackTemp: undefined, trackGripStatus: undefined,
      rainNow: undefined, rainIn10: undefined, rainIn30: undefined,
      shmCurrentLapMs: -1, shmLastLapMs: -1, shmBestLapMs: -1,
    };
    this.carEntries = new Map(); // carIndex → entry
    this.carRealtimes = new Map(); // carIndex → realtime
    this.driverLapStates = new Map(); // driverKey → { lastLap, prevMeta }
    this.gapEstimateCache = new Map(); // "behind:ahead" → { gapS, lapped }
    this.liveryTeamNames = new Map(); // raceNumber → teamName (from local livery files)
    this.trackName = '';
    this.trackLength = 0;
    this.parseErrors = 0;
    this.lastParseErr = '';
    this.maxCarsPerClass = 10;
  }

  // ── Reset ─────────────────────────────────
  reset() {
    this.connected = false;
    this.connectionId = -1;
    this.session = {
      sessionType: -1, phase: 0, sessionTime: 0, sessionEndTime: 0,
      focusedCarIndex: -1,
    };
    this.carEntries.clear();
    this.carRealtimes.clear();
    this.driverLapStates.clear();
    this.gapEstimateCache.clear();
    this.trackName = '';
    this.trackLength = 0;
  }

  // Session change on the SAME server — only realtime data changes.
  // carEntries (driver names / car models) stays valid because the same cars
  // are in the lobby all weekend.  Realtimes refill within 250 ms from the
  // ongoing REALTIME_CAR_UPDATE stream.
  resetSessionCars() {
    this.carRealtimes.clear();
    this.driverLapStates.clear();
    this.gapEstimateCache.clear();
  }

  // Full reset when reconnecting to a (potentially different) server.
  resetForNewServer() {
    this.carEntries.clear();
    this.carRealtimes.clear();
    this.driverLapStates.clear();
    this.gapEstimateCache.clear();
  }

  // ── Writers ───────────────────────────────
  setConnected(id) { this.connected = true; this.connectionId = id; }
  setDisconnected() { this.connected = false; this.connectionId = -1; }
  updateSession(s) { this.session = { ...this.session, ...s }; }
  updateCarEntry(e) { this.carEntries.set(e.carIndex, e); }
  setLiveryTeamNames(map) { this.liveryTeamNames = map; }
  updateCarRealtime(rt) {
    rt.rxTsMs = Date.now();
    const prev = this.carRealtimes.get(rt.carIndex);
    if (prev) {
      // Preserve valid lap times — if the new read failed (=-1) or has no lap yet (=INV),
      // keep the previously stored value so a bad packet doesn't wipe a good one.
      if (!(rt.lastLapMs > 0 && rt.lastLapMs < INV))
        rt.lastLapMs = prev.lastLapMs;
      if (!(rt.bestSessionLapMs > 0 && rt.bestSessionLapMs < INV))
        rt.bestSessionLapMs = prev.bestSessionLapMs;
    }
    this.carRealtimes.set(rt.carIndex, rt);
    this._updateDriverLastLap(rt);
  }
  updateTrack(name, len) { this.trackName = name; this.trackLength = len; }
  setMaxCarsPerClass(v) {
    const n = Math.round(Number(v));
    this.maxCarsPerClass = Number.isFinite(n) ? Math.max(1, Math.min(60, n)) : 10;
  }
  // Called by SHM reader — all four weather fields from SPageFileGraphic
  updateShmWeather(grip, r0, r10, r30) {
    if (grip >= 0 && grip <= 6) this.session.trackGripStatus = grip;
    if (r0 >= 0 && r0 <= 5) this.session.rainNow = r0;
    if (r10 >= 0 && r10 <= 5) this.session.rainIn10 = r10;
    if (r30 >= 0 && r30 <= 5) this.session.rainIn30 = r30;
  }

  // Called by SHM reader — lap times from SPageFileGraphic (offsets 140/144/148)
  updateShmLapTimes(cur, last, best) {
    if (cur > 0) this.session.shmCurrentLapMs = cur;
    if (last > 0) this.session.shmLastLapMs = last;
    if (best > 0) this.session.shmBestLapMs = best;
  }

  // ── Focused car lookup ────────────────────
  _getFocusedCarData() {
    const ci = this.session.focusedCarIndex;
    if (ci == null || ci < 0) return null;
    const entry = this.carEntries.get(ci);
    const rt = this.carRealtimes.get(ci);
    if (!entry || !rt) return null;

    const driver = entry.drivers?.[entry.currentDriverIndex ?? 0] ?? entry.drivers?.[0];
    const flag = driver ? getNatFlag(driver.nationality) : '🏳️';

    const shmLast = this.session.shmLastLapMs;
    const udpLast = rt.lastLapMs;
    let lastLapMs = -1;
    if (shmLast > 0 && shmLast < 0x7FFFFFFF) {
      lastLapMs = shmLast;
    } else if (udpLast > 0 && udpLast < 0x7FFFFFFF) {
      lastLapMs = udpLast;
    }

    const lastLapInfo = getDriverLastLapForCar(this.driverLapStates, this.session, ci, entry, rt);

    // Best lap in the same class as the focused car
    const focusedClass = getCarClass(entry.carModelType);
    let classBestLapMs = -1;
    for (const [ci2, crt] of this.carRealtimes) {
      const e2 = this.carEntries.get(ci2);
      if (!e2 || getCarClass(e2.carModelType) !== focusedClass) continue;
      const b = crt.bestSessionLapMs;
      if (b > 0 && b < INV && (classBestLapMs < 0 || b < classBestLapMs)) classBestLapMs = b;
    }

    return {
      carIndex: ci,
      raceNumber: entry.raceNumber,
      driverText: buildDriverText(entry),
      teamName: entry.teamName ?? '',
      teamDisplayName: entry.teamName?.trim() || this.liveryTeamNames.get(entry.raceNumber) || getManufacturerAbbr(entry.carModelType),
      manufacturerAbbr: getManufacturerAbbr(entry.carModelType),
      carClass: focusedClass,
      bestLapMs: rt.bestSessionLapMs ?? -1,
      classBestLapMs,
      lastLapMs,
      lastLapIsValid: lastLapInfo ? lastLapInfo.isValid : (rt.lastLapValidForBest ?? false),
      classPosition: rt.cupPosition ?? 0,
      overallPosition: rt.position ?? 0,
      flag,
    };
  }

  // ── Main standings builder ────────────────
  getStandings() {
    const trackLength = this.trackLength;
    const focusedCarIndex = this.session.focusedCarIndex ?? -1;
    // Non-race: practice(0), qualifying(1), superpole(2), hotlap(4), hotstint(5), hotlap-superpole(6)
    const QUALI_TYPES = new Set([0, 1, 2, 4, 5, 6]);
    const isRace = !QUALI_TYPES.has(this.session.sessionType);

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

    // For race gaps, ACC-style display is to the immediate overall car ahead (not class leader / class ahead).
    const prevOverallByCarIndex = new Map();
    for (let i = 0; i < allCars.length; i++) {
      prevOverallByCarIndex.set(allCars[i].carIndex, i > 0 ? allCars[i - 1] : null);
    }

    // Group by class (preserving sort order within each group)
    const grouped = {};
    for (const car of allCars) {
      const cls = getCarClass(car.entry.carModelType);
      (grouped[cls] = grouped[cls] ?? []).push(car);
    }

    // Determine cap (user configurable, applies to each class list)
    const carCap = this.maxCarsPerClass;

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

        const globalIdx = displayStart + i;
        const prevOverallCar = prevOverallByCarIndex.get(car.carIndex) ?? null;
        let gapText, gapLaps;
        if (!prevOverallCar) {
          gapText = 'LEADER'; gapLaps = 0;
        } else if (isRace) {
          [gapText, gapLaps] = computeGap(car, prevOverallCar, trackLength, this.gapEstimateCache);
        } else {
          // Practice / Qualifying: gap to P1's best session lap time
          const carBest = rt.bestSessionLapMs ?? -1;
          if (carBest > 0 && carBest < 0x7FFFFFFF && leaderBestMs > 0 && leaderBestMs < 0x7FFFFFFF) {
            gapText = formatLapDelta(carBest - leaderBestMs); gapLaps = 0;
          } else {
            gapText = '—'; gapLaps = 0;
          }
        }

        const lastLapInfo = getDriverLastLapForCar(this.driverLapStates, this.session, car.carIndex, entry, rt);

        return {
          carIndex: car.carIndex,
          raceNumber: entry.raceNumber,
          teamName: entry.teamName ?? '',
          teamDisplayName: entry.teamName?.trim() || this.liveryTeamNames.get(entry.raceNumber) || getManufacturerAbbr(entry.carModelType),
          driverText: buildDriverText(entry),
          manufacturerAbbr: getManufacturerAbbr(entry.carModelType),
          carModelType: entry.carModelType,
          classPosition: classPos,
          overallPosition: rt.position,
          laps: rt.laps,
          spline: rt.splinePosition,
          speedKmh: rt.speedKmh,
          gapText,
          gapLaps,
          inPit: [2, 3, 4].includes(rt.carLocation),
          bestLapMs: rt.bestSessionLapMs ?? -1,
          lastLapMs: lastLapInfo ? lastLapInfo.lapTimeMs : (rt.lastLapMs > 0 && rt.lastLapMs < INV ? rt.lastLapMs : -1),
          lastLapIsValid: lastLapInfo ? lastLapInfo.isValid : (rt.lastLapValidForBest ?? false),
          lastLapType: lastLapInfo ? lastLapInfo.lapType : LAP_TYPE.UNKNOWN,
          isFocused: car.carIndex === focusedCarIndex,
        };
      });
    }

    return {
      connected: this.connected,
      maxCarsPerClass: this.maxCarsPerClass,
      session: {
        type: this.session.sessionType,
        phase: this.session.phase,
        sessionTime: this.session.sessionTime,
        sessionEndTime: this.session.sessionEndTime,
        focusedCarIndex: this.session.focusedCarIndex ?? -1,
        ambientTemp: this.session.ambientTemp,
        trackTemp: this.session.trackTemp,
        trackGripStatus: this.session.trackGripStatus,
        rainNow: this.session.rainNow,
        rainIn10: this.session.rainIn10,
        rainIn30: this.session.rainIn30,
        shmLastLapMs: this.session.shmLastLapMs,
        timeMultiplier: this.session.timeMultiplier,
      },
      track: { name: this.trackName, lengthM: this.trackLength },
      classes: outClasses,
      focusedCar: this._getFocusedCarData(),
      entryCount: this.carEntries.size,
      realtimeCount: this.carRealtimes.size,
      parseErrors: this.parseErrors,
      lastParseErr: this.lastParseErr,
    };
  }
}

// ── Helpers ───────────────────────────────────

function buildDriverText(entry) {
  if (!entry.drivers?.length) return '';
  return entry.drivers.map(d => {
    const fn = (d.firstName ?? '').trim();
    const ln = (d.lastName ?? '').trim();
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

function computeGap(behind, ahead, trackLength, gapCache) {
  const brt = behind.rt;
  const art = ahead.rt;
  const pairKey = `${behind.carIndex}:${ahead.carIndex}`;
  const prevGap = gapCache?.get(pairKey);
  const [aLaps, aSpline] = getProjectedLapProgress(art, trackLength);
  const [bLaps, bSpline] = getProjectedLapProgress(brt, trackLength);

  // Use continuous progress to avoid false "+1L" when the car ahead just crossed the line.
  let lapProgressDiff = (aLaps + aSpline) - (bLaps + bSpline);
  if (lapProgressDiff < 0) {
    // Packet ordering can briefly invert the pair; fall back to a wrapped spline diff.
    lapProgressDiff = aSpline - bSpline;
    if (lapProgressDiff < 0) lapProgressDiff += 1.0;
  }

  const rawLapDiff = aLaps - bLaps;
  const lappedThreshold = prevGap?.lapped ? 0.95 : 1.05;
  const lapDiff = Math.floor(lapProgressDiff + 1e-6);
  const isLikelyLapped =
    rawLapDiff >= 2 ||
    (rawLapDiff >= 1 && lapProgressDiff >= lappedThreshold);
  if (isLikelyLapped && lapDiff >= 1) {
    gapCache?.set(pairKey, { gapS: prevGap?.gapS ?? null, lapped: true });
    return [`+${lapDiff}L`, lapDiff];
  }

  const splineDiff = lapProgressDiff % 1;
  if (splineDiff <= 0.0001) return ['+0.0', 0];

  let gapS;
  const aSpeedRaw = (art.speedKmh ?? 0) / 3.6;
  const bSpeedRaw = (brt.speedKmh ?? 0) / 3.6;
  // Prefer local speed for race gaps: it tracks straight/corner tempo better than average-lap conversion.
  if (trackLength > 100 && aSpeedRaw > 5 && bSpeedRaw > 5) {
    const speedMs = Math.max((aSpeedRaw + bSpeedRaw) * 0.5, 20);
    gapS = (splineDiff * trackLength) / speedMs;
  } else {
    const refLapMs = pickRefLapMs(brt, art);
    if (refLapMs > 5000) gapS = splineDiff * (refLapMs / 1000);
    else gapS = splineDiff * 120;
  }

  if (Number.isFinite(prevGap?.gapS) && prevGap.lapped !== true) {
    const diff = gapS - prevGap.gapS;
    const maxStep = prevGap.gapS < 3 ? 0.10 : (prevGap.gapS < 10 ? 0.20 : 0.35);
    const clamped = Math.max(-maxStep, Math.min(maxStep, diff));
    gapS = prevGap.gapS + clamped;
    gapS = prevGap.gapS * 0.82 + gapS * 0.18;
  }
  gapCache?.set(pairKey, { gapS, lapped: false });

  if (gapS >= 60) {
    const m = Math.floor(gapS / 60);
    const s = (gapS - m * 60).toFixed(1).padStart(4, '0');
    return [`+${m}:${s}`, 0];
  }
  return [`+${gapS.toFixed(1)}`, 0];
}

function validLapMs(ms) {
  return typeof ms === 'number' && ms > 5000 && ms < INV;
}

function pickRefLapMs(brt, art) {
  const candidates = [];
  if (validLapMs(brt.lastLapMs)) candidates.push(brt.lastLapMs);
  if (validLapMs(art.lastLapMs)) candidates.push(art.lastLapMs);
  if (validLapMs(brt.bestSessionLapMs)) candidates.push(brt.bestSessionLapMs);
  if (validLapMs(art.bestSessionLapMs)) candidates.push(art.bestSessionLapMs);
  if (!candidates.length) return -1;
  candidates.sort((a, b) => a - b);
  return candidates[Math.floor(candidates.length / 2)];
}

function getProjectedLapProgress(rt, trackLength) {
  let laps = Math.max(0, rt.laps ?? 0);
  let spline = Math.max(0, Math.min(1, rt.splinePosition ?? 0));

  // Reproject each car to "now" because ACC packets arrive per-car and are not perfectly simultaneous.
  if (trackLength > 100 && typeof rt.rxTsMs === 'number') {
    const ageMs = Math.max(0, Math.min(400, Date.now() - rt.rxTsMs));
    if (ageMs > 0) {
      const speedMs = Math.max((rt.speedKmh ?? 0) / 3.6, 0);
      const deltaLap = (speedMs * (ageMs / 1000)) / trackLength;
      const total = laps + spline + Math.min(deltaLap, 0.08); // cap projection to avoid spikes on bad speeds
      laps = Math.floor(total);
      spline = total - laps;
    }
  }

  return [laps, spline];
}

function makeSessionKey(session) {
  const e = session?.eventIndex ?? -1;
  const s = session?.sessionIndex ?? -1;
  return `${e}_${s}`;
}

function makeDriverKey(session, carIndex, driverIndex) {
  const sk = session?.sessionKey || makeSessionKey(session);
  return `${sk}:${carIndex}:${driverIndex}`;
}

function mapLapType(raw, prevCarLocation, carLocation) {
  if (raw === 0) return LAP_TYPE.OUT;
  if (raw === 2) return LAP_TYPE.IN;
  if (raw === 1) return LAP_TYPE.NORMAL;

  if ([2, 3, 4].includes(prevCarLocation) && carLocation === 1) return LAP_TYPE.OUT;
  if (prevCarLocation === 1 && [2, 3, 4].includes(carLocation)) return LAP_TYPE.IN;
  return LAP_TYPE.UNKNOWN;
}

function getDriverFromEntry(entry, driverIndex) {
  if (!entry?.drivers?.length) return null;
  const idx = Math.min(Math.max(driverIndex ?? 0, 0), entry.drivers.length - 1);
  return entry.drivers[idx];
}

function getDriverLastLapForCar(driverLapStates, session, carIndex, entry, rt) {
  const driverIndex =
    rt?.driverIndex ??
    entry?.currentDriverIndex ??
    0;
  const key = makeDriverKey(session, carIndex, driverIndex);
  const state = driverLapStates.get(key);
  return state?.lastLap ?? null;
}

DataStore.prototype._updateDriverLastLap = function updateDriverLastLap(rt) {
  const carIndex = rt.carIndex;
  const entry = this.carEntries.get(carIndex);
  const driverIndex = rt.driverIndex ?? entry?.currentDriverIndex ?? 0;

  const key = makeDriverKey(this.session, carIndex, driverIndex);
  let state = this.driverLapStates.get(key);

  const prevLaps = state?.prevMeta?.lastSeenLaps ?? rt.laps;
  const prevCarLocation = state?.prevMeta?.lastSeenCarLocation ?? rt.carLocation;

  if (!state) {
    state = {
      lastLap: null,
      prevMeta: {
        lastSeenLaps: rt.laps,
        lastSeenCarLocation: rt.carLocation,
      },
    };
    this.driverLapStates.set(key, state);
    return;
  }

  if (rt.laps > prevLaps && rt.lastLapMs > 0 && rt.lastLapMs < INV) {
    const driver = getDriverFromEntry(entry, driverIndex);

    const lapType = mapLapType(
      rt.lastLapTypeRaw,
      prevCarLocation,
      rt.carLocation,
    );

    const isValid = !!rt.lastLapValidForBest && rt.lastLapMs > 0 && rt.lastLapMs < INV;

    state.lastLap = {
      sessionKey: makeSessionKey(this.session),
      lapNumber: rt.laps,
      lapTimeMs: rt.lastLapMs,
      isValid,
      lapType,
      driverId: driver ? `${driver.firstName ?? ''} ${driver.lastName ?? ''}`.trim() || `#${entry?.raceNumber ?? carIndex}` : `#${entry?.raceNumber ?? carIndex}`,
      carIndex,
      driverIndex,
      completedAt: Date.now(),
    };
  }

  state.prevMeta = {
    lastSeenLaps: rt.laps,
    lastSeenCarLocation: rt.carLocation,
  };

  this.driverLapStates.set(key, state);
};

module.exports = DataStore;
