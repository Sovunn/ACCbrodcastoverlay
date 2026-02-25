'use strict';

// ── ACC car model IDs → class / manufacturer ──────────────────────────────────
//
//  Source: Kunos Simulazioni ACC Broadcast SDK (official)
//
//  IMPORTANT: IDs 0–14 were always correct.  The old table had a duplicate
//  Jaguar at ID 15 (actual = Lexus RC F GT3), which shifted IDs 16–36 by +1.
//  In the GT4 range the old table skipped ID 54 (Chevrolet Camaro GT4.R),
//  shifting IDs 55–61 by +1.  Both are corrected here.
//
const CAR_MODELS = {
  // ── GT3 ──────────────────────────────────────────────────────────────────
  0:  { manufacturer: 'Porsche',      class: 'GT3' },   // 991 GT3 R (2018)
  1:  { manufacturer: 'Mercedes',     class: 'GT3' },   // AMG GT3 (2015)
  2:  { manufacturer: 'Ferrari',      class: 'GT3' },   // 488 GT3 (2018)
  3:  { manufacturer: 'Audi',         class: 'GT3' },   // R8 LMS (2015)
  4:  { manufacturer: 'Lamborghini',  class: 'GT3' },   // Huracán GT3 (2015)
  5:  { manufacturer: 'McLaren',      class: 'GT3' },   // 650S GT3 (2015)
  6:  { manufacturer: 'Nissan',       class: 'GT3' },   // GT-R Nismo GT3 (2018)
  7:  { manufacturer: 'BMW',          class: 'GT3' },   // M6 GT3 (2017)
  8:  { manufacturer: 'Bentley',      class: 'GT3' },   // Continental GT3 (2018)
  9:  { manufacturer: 'Porsche',      class: 'CUP' },   // 991 II GT3 Cup (2017)
  10: { manufacturer: 'Nissan',       class: 'GT3' },   // GT-R Nismo GT3 (2015)
  11: { manufacturer: 'Bentley',      class: 'GT3' },   // Continental GT3 (2015)
  12: { manufacturer: 'Aston Martin', class: 'GT3' },   // V12 Vantage GT3
  13: { manufacturer: 'Lamborghini',  class: 'GT3' },   // Gallardo R-EX (Reiter)
  14: { manufacturer: 'Jaguar',       class: 'GT3' },   // G3 (Emil Frey)
  15: { manufacturer: 'Lexus',        class: 'GT3' },   // RC F GT3            ← was Jaguar (WRONG)
  16: { manufacturer: 'Lamborghini',  class: 'GT3' },   // Huracán GT3 EVO     ← was Lexus
  17: { manufacturer: 'Honda',        class: 'GT3' },   // NSX GT3             ← was Lamborghini
  18: { manufacturer: 'Lamborghini',  class: 'ST'  },   // Huracán ST          ← was Honda
  19: { manufacturer: 'Audi',         class: 'GT3' },   // R8 LMS EVO          ← was Lamborghini ST
  20: { manufacturer: 'Aston Martin', class: 'GT3' },   // V8 Vantage GT3      ← was Audi
  21: { manufacturer: 'Honda',        class: 'GT3' },   // NSX GT3 EVO         ← was Aston Martin
  22: { manufacturer: 'McLaren',      class: 'GT3' },   // 720S GT3            ← was Honda
  23: { manufacturer: 'Porsche',      class: 'CUP' },   // GT2 RS CS Evo       ← was McLaren GT3
  24: { manufacturer: 'Ferrari',      class: 'GT3' },   // 488 GT3 EVO 2020    ← was Porsche GT3
  25: { manufacturer: 'Mercedes',     class: 'GT3' },   // AMG GT3 EVO 2020    ← was Ferrari GT3
  26: { manufacturer: 'Ferrari',      class: 'CUP' },   // 488 Challenge Evo   ← was Mercedes GT3
  27: { manufacturer: 'BMW',          class: 'TCX' },   // M2 CS Racing        ← was Ferrari CUP
  28: { manufacturer: 'Porsche',      class: 'CUP' },   // 911 GT3 Cup 2021    ← was BMW TCX
  29: { manufacturer: 'Lamborghini',  class: 'ST'  },   // Huracán ST EVO2     ← was Porsche CUP
  30: { manufacturer: 'BMW',          class: 'GT3' },   // M4 GT3              ← was Lamborghini ST
  31: { manufacturer: 'Audi',         class: 'GT3' },   // R8 LMS EVO II       ← was BMW GT3
  32: { manufacturer: 'Ferrari',      class: 'GT3' },   // 296 GT3             ← was Audi GT3
  33: { manufacturer: 'Lamborghini',  class: 'GT3' },   // Huracán GT3 EVO2    ← was Ferrari GT3
  34: { manufacturer: 'Porsche',      class: 'GT3' },   // 992 GT3 R           ← was Lamborghini GT3
  35: { manufacturer: 'McLaren',      class: 'GT3' },   // 720S GT3 EVO        ← was Porsche GT3
  36: { manufacturer: 'Ford',         class: 'GT3' },   // Mustang GT3         ← was McLaren GT3
  // ID 37 removed (phantom entry from the old shifted table)

  // ── GT4 ──────────────────────────────────────────────────────────────────
  50: { manufacturer: 'Alpine',       class: 'GT4' },   // A110 GT4
  51: { manufacturer: 'Aston Martin', class: 'GT4' },   // Vantage AMR GT4
  52: { manufacturer: 'Audi',         class: 'GT4' },   // R8 LMS GT4
  53: { manufacturer: 'BMW',          class: 'GT4' },   // M4 GT4
  54: { manufacturer: 'Chevrolet',    class: 'GT4' },   // Camaro GT4.R        ← was missing!
  55: { manufacturer: 'Ginetta',      class: 'GT4' },   // G55 GT4             ← was Chevrolet
  56: { manufacturer: 'KTM',          class: 'GT4' },   // X-Bow GT4           ← was Ginetta
  57: { manufacturer: 'Maserati',     class: 'GT4' },   // GranTurismo MC GT4  ← was KTM
  58: { manufacturer: 'McLaren',      class: 'GT4' },   // 570S GT4            ← was Maserati
  59: { manufacturer: 'Mercedes',     class: 'GT4' },   // AMG GT4             ← was McLaren
  60: { manufacturer: 'Porsche',      class: 'GT4' },   // 718 Cayman GT4 CS   ← was Mercedes
  61: { manufacturer: 'Toyota',       class: 'GT4' },   // GR Supra GT4        ← was Porsche
  // ID 62 removed (Toyota was shifted here by the missing-54 bug; correct ID is 61)
};

const MFR_ABBR = {
  'Porsche':      'PORS', 'Mercedes': 'MERC', 'Ferrari':      'FERR',
  'Audi':         'AUDI', 'Lamborghini': 'LAMB', 'McLaren':   'MCL',
  'Nissan':       'NISS', 'BMW':      'BMW',  'Bentley':      'BENT',
  'Aston Martin': 'AMR',  'Jaguar':   'JAG',  'Lexus':        'LEX',
  'Honda':        'HOND', 'Alpine':   'ALP',  'Chevrolet':    'CHEV',
  'Ginetta':      'GIN',  'KTM':      'KTM',  'Maserati':     'MAS',
  'Toyota':       'TOY',  'Ford':     'FORD',
};

const CLASS_ORDER  = ['GT3', 'GT4', 'CUP', 'ST', 'TCX'];
const CLASS_COLORS = {
  GT3: '#eb0000', GT4: '#eb7900', CUP: '#0055cc', ST: '#006600', TCX: '#0089eb',
};

function getCarInfo(modelType) {
  return CAR_MODELS[modelType] ?? { manufacturer: 'Unknown', class: 'GT3' };
}
function getCarClass(modelType)        { return getCarInfo(modelType).class; }
function getManufacturer(modelType)    { return getCarInfo(modelType).manufacturer; }
function getManufacturerAbbr(modelType) {
  const m = getManufacturer(modelType);
  return MFR_ABBR[m] ?? m.slice(0, 4).toUpperCase();
}

module.exports = { CLASS_ORDER, CLASS_COLORS, getCarClass, getManufacturerAbbr };
