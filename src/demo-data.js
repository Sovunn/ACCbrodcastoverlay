'use strict';

// Demo race data matching the reference screenshot
// GT3 cars: [carModelType, raceNumber, teamName, drivers, splineFraction]
const GT3 = [
  [25, 32,  'SHIFT Auto service',     [['Y.','Zvuzdetskyi']],                       0.990],
  [26, 21,  'OKUNI RT',               [['Y.','Zvuzdetskyi']],                       0.970],
  [2,  666, 'Carhub community',       [['V.','Taradai'],['D.','Sapozhkov']],        0.880],
  [2,  1,   '2G Circuit Academy',     [['A.','Maior'],['M.','Geronimus']],          0.920],
  [7,  314, 'Butthurts Duo',          [['R.','Slashchov']],                         0.960],
  [1,  3,   'Blacklist RT',           [['I.','Kudinov'],['P.','Kazanin']],          0.982],
  [31, 4,   'ACS NA RUKAH',           [['K.','Maior'],['O.','Vasyliev']],           0.940],
  [20, 888, 'NoBrakesTeam',           [['N.','Prokopov']],                          0.900],
  [25, 31,  'Samir RT',               [['O.','Zmiuk'],['I.','Lishchynskyi']],       0.840],
  [25, 33,  'FUMO RACING',            [['A.','Kashyrin']],                          0.820],
  [2,  555, 'Last GT3 entry',         [['D.','Grytsyuk'],['M.','Nasonov']],        0.800],
];

// GT4 cars: [carModelType, raceNumber, teamName, drivers, splineFraction, lapsBehind]
const GT4 = [
  [57, 15,  'SideAttack',              [['P.','Polovchuk']],                        0.950, 2],
  [51, 43,  'UAmateurs BERPLABER',     [['O.','Berkunskyi']],                       0.840, 2],
  [51, 7,   'Trident_XTK',            [['Y.','Artemenko']],                        0.900, 2],
  [60, 46,  'SimotorsportUA',          [['V.','Burlaka']],                          0.890, 2],
  [59, 110, 'RainAllDayHotlapAllNight',[['T.','Istomin']],                         0.740, 2],
  [60, 76,  'NOTHOTLAPPERS',           [['I.','Shot']],                             0.830, 2],
  [60, 257, 'Expecto Petronas',        [['D.','Yaroshenko']],                       0.710, 2],
  [60, 39,  'AHAXUA Didy',            [['V.','Abramov']],                          0.830, 2],
  [50, 796, 'Phyllobates Terribilis',  [['I.','Melnik']],                           0.880, 2],
  [60, 12,  'Kabanchik Energy RT',     [['Y.','Kanaiev']],                          0.710, 2],
];

function loadDemoData(store) {
  store.updateTrack('Monza', 5793);
  store.setConnected(1);
  store.updateSession({ sessionType: 3, phase: 5, sessionTime: 4379, sessionEndTime: 0, focusedCarIndex: 0 });

  let carIdx = 0;

  for (const [model, num, team, drvs, spline] of GT3) {
    store.updateCarEntry({
      carIndex: carIdx, carModelType: model, teamName: team,
      raceNumber: num, currentDriverIndex: 0,
      drivers: drvs.map(([fn, ln]) => ({ firstName: fn, lastName: ln })),
    });
    store.updateCarRealtime({
      carIndex: carIdx, position: carIdx + 1, cupPosition: carIdx + 1,
      splinePosition: spline, laps: 36,
      speedKmh: 180 + carIdx * 1.5, lastLapMs: 104000,
      driverIndex: 0, driverCount: 1, gear: 5, carLocation: 1,
      delta: 0, bestSessionLapMs: 103000, trackPosition: carIdx,
    });
    carIdx++;
  }

  let gt4pos = 0;
  for (const [model, num, team, drvs, spline, lapsBehind] of GT4) {
    gt4pos++;
    store.updateCarEntry({
      carIndex: carIdx, carModelType: model, teamName: team,
      raceNumber: num, currentDriverIndex: 0,
      drivers: drvs.map(([fn, ln]) => ({ firstName: fn, lastName: ln })),
    });
    store.updateCarRealtime({
      carIndex: carIdx, position: GT3.length + gt4pos, cupPosition: gt4pos,
      splinePosition: spline, laps: 36 - lapsBehind,
      speedKmh: 155 + carIdx, lastLapMs: 110000,
      driverIndex: 0, driverCount: 1, gear: 5, carLocation: 1,
      delta: 0, bestSessionLapMs: 109000, trackPosition: carIdx,
    });
    carIdx++;
  }
}

function startDemoSimulation(store) {
  const start = Date.now();
  // Track previous spline to detect lap completions
  const prevSpline = new Map();
  for (const [ci, rt] of store.carRealtimes) {
    prevSpline.set(ci, rt.splinePosition);
  }

  return setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;

    // Advance session clock
    store.session.sessionTime = 4379 + elapsed;

    // Slowly advance all cars' spline positions
    for (const [ci, rt] of store.carRealtimes) {
      const drift = Math.sin(elapsed * 0.08 + ci * 0.9) * 0.002;
      const oldSpline = rt.splinePosition;
      rt.splinePosition = (rt.splinePosition + 0.00012 + drift + 1) % 1;

      // Detect lap completion (spline wrapped around)
      if (rt.splinePosition < oldSpline - 0.5) {
        const entry = store.carEntries.get(ci);
        const lapTime = 103000 + Math.floor(Math.random() * 4000);
        const isInvalid = Math.random() < 0.3 ? 1 : 0;
        store.updateCarRealtime({
          ...rt,
          carIndex: ci,
          laps: rt.laps + 1,
          lastLapMs: lapTime,
          lastLapValidForBest: isInvalid ? 0 : 1,
          lastLapTypeRaw: 1,
          driverIndex: entry?.currentDriverIndex ?? 0,
          driverCount: entry?.drivers?.length ?? 1,
        });
      }

      prevSpline.set(ci, rt.splinePosition);
    }
  }, 250);
}

module.exports = { loadDemoData, startDemoSimulation };
