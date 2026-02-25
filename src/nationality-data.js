'use strict';

// ACC NationalityEnum (uint16) → emoji flag
const NAT_FLAG = {
  1:  '🇮🇹',  // Italy
  2:  '🇩🇪',  // Germany
  3:  '🇫🇷',  // France
  4:  '🇪🇸',  // Spain
  5:  '🇬🇧',  // Great Britain
  6:  '🇭🇺',  // Hungary
  7:  '🇧🇪',  // Belgium
  8:  '🇨🇭',  // Switzerland
  9:  '🇦🇹',  // Austria
  10: '🇷🇺',  // Russia
  11: '🇹🇭',  // Thailand
  12: '🇳🇱',  // Netherlands
  13: '🇵🇱',  // Poland
  14: '🇦🇷',  // Argentina
  15: '🇲🇨',  // Monaco
  16: '🇮🇪',  // Ireland
  17: '🇧🇷',  // Brazil
  18: '🇿🇦',  // South Africa
  19: '🇸🇬',  // Singapore
  20: '🇸🇰',  // Slovakia
  21: '🇮🇳',  // India
  22: '🇬🇷',  // Greece
  23: '🇱🇺',  // Luxembourg
  24: '🇳🇴',  // Norway
  25: '🇹🇷',  // Turkey
  26: '🇰🇷',  // South Korea
  27: '🇮🇱',  // Israel
  28: '🇨🇴',  // Colombia
  29: '🇲🇽',  // Mexico
  30: '🇸🇪',  // Sweden
  31: '🇫🇮',  // Finland
  32: '🇩🇰',  // Denmark
  33: '🇭🇷',  // Croatia
  34: '🇨🇦',  // Canada
  35: '🇨🇳',  // China
  36: '🇵🇹',  // Portugal
  37: '🇷🇴',  // Romania
  38: '🇭🇰',  // Hong Kong
  39: '🇺🇸',  // United States
  40: '🇳🇿',  // New Zealand
  41: '🇦🇺',  // Australia
  42: '🇸🇮',  // Slovenia
  43: '🇦🇪',  // United Arab Emirates
  44: '🇨🇱',  // Chile
  45: '🇨🇿',  // Czech Republic (legacy alias)
  46: '🇮🇩',  // Indonesia
  47: '🇲🇾',  // Malaysia
  48: '🇯🇵',  // Japan
  49: '🇦🇿',  // Azerbaijan
  50: '🇸🇦',  // Saudi Arabia
  51: '🇵🇭',  // Philippines
  52: '🇷🇸',  // Serbia
  53: '🇨🇿',  // Czech Republic
  54: '🇧🇾',  // Belarus
  55: '🇰🇿',  // Kazakhstan
  56: '🇱🇧',  // Lebanon
  57: '🇧🇴',  // Bolivia
  58: '🇸🇳',  // Senegal
  72: '🇺🇦',  // Ukraine
};

function getNatFlag(code) { return NAT_FLAG[code] ?? '🏳️'; }

module.exports = { getNatFlag };
