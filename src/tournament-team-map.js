'use strict';

// Tournament entry mapping: race number -> team name.
// If a number appears in multiple teams, first team is used unless ACC already
// provides a matching team name.
const NUMBER_TO_TEAMS = new Map();
const NUMBER_TO_LOGO_KEY = new Map();

function addTeam(teamName, numbers) {
  for (const raw of numbers) {
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const key = Math.round(n);
    const existing = NUMBER_TO_TEAMS.get(key);
    if (existing) existing.push(teamName);
    else NUMBER_TO_TEAMS.set(key, [teamName]);
  }
}

function addLogoKey(logoKey, numbers) {
  for (const raw of numbers) {
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const key = Math.round(n);
    NUMBER_TO_LOGO_KEY.set(key, logoKey);
  }
}

// M2 CS
addTeam('OKUNI RT', [30, 1, 992]);
addTeam('SideAттacк', [86, 15]);
addTeam('ACS NA RUKAH', [33, 3]);
addTeam('Boston Racers', [96, 69, 666]);
addTeam('UAmateurs OnlyFans', [24, 34]);
addTeam('JUSTINI RT', [111, 11]);
addTeam('Double Penetration RT', [57, 76]);
addTeam('Istomin Academy', [39, 506, 703]);
addTeam('Jack i Chan', [91, 555]);
addTeam('Burnout', [797, 8]);
addTeam('Eat the Kerb Racing Team', [142, 141]);

// GT3
addTeam('2G x CUPRA Academy', [88, 10, 777]);
addTeam('XTK', [187, 188]);
addTeam('XTK Academy', [17, 333, 27]);
addTeam('BLUE PARTISANS Major Jewellery Aurum', [21, 4, 777]);
addTeam('2G Academy', [44, 99, 777]);
addTeam('ASS RT', [322, 87, 70]);
addTeam('ACS NA RUKAH girls academy', [7, 26, 101]);
addTeam('20Critical RT', [73, 45]);
addTeam('Missed Apex Team', [81, 175]);
addTeam('SimGay RT', [13, 77]);
addTeam('Bottlefield RT', [404, 23]);
addTeam('UAmateurs STAMO', [25, 71]);
addTeam('Last Minute Racing', [119, 133]);
addTeam('Sector One Racing [SOR]', [29, 580]);

// 7DRIVE logo mapping (numbers provided by user)
addLogoKey('7drive', [
  33, 3, 96, 69, 111, 11, 57, 76,
  88, 10, 777, 21, 4, 44, 99, 7, 26, 101, 73, 45, 13, 77,
]);

function normalizeRaceNumber(raceNumber) {
  const n = Number(raceNumber);
  if (!Number.isFinite(n)) return null;
  return Math.round(n);
}

function getTournamentTeamName(raceNumber, accTeamName = '') {
  const key = normalizeRaceNumber(raceNumber);
  if (key == null) return null;

  const teams = NUMBER_TO_TEAMS.get(key);
  if (!teams?.length) return null;
  if (teams.length === 1) return teams[0];

  const acc = String(accTeamName ?? '').trim().toLowerCase();
  if (acc) {
    const exact = teams.find(t => t.toLowerCase() === acc);
    if (exact) return exact;
  }
  return teams[0];
}

function getTournamentLogoKey(raceNumber) {
  const key = normalizeRaceNumber(raceNumber);
  if (key == null) return null;
  return NUMBER_TO_LOGO_KEY.get(key) ?? null;
}

module.exports = {
  getTournamentTeamName,
  getTournamentLogoKey,
};
