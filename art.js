// Game art as inline SVG: Wick the candlestick (the guide), node glyphs, unit pictures, badges, icons.
// Every picture is drawn here so the game works offline and from file://.
(function (root) {
  var INK = '#1d1d1b';
  var GREEN = ['#1fae74', '#127a50'], RED = ['#e2445c', '#a8243a'], GREY = ['#8d8d86', '#5e5e59'], GOLD = ['#f2b705', '#a87a00'];
  // Each mood is a set of parts: body colour, eyes, brows, mouth, arms and an extra.
  var MOODS = {
    happy: { c: GREEN, eyes: 'open', mouth: 'smile', arms: 'down' },
    cheer: { c: GREEN, eyes: 'open', mouth: 'open', arms: 'up' },
    wow: { c: GREEN, eyes: 'star', mouth: 'open', arms: 'up', extra: 'sparkle' },
    think: { c: GREEN, eyes: 'side', mouth: 'flat', arms: 'chin' },
    oops: { c: RED, eyes: 'wide', brows: 'worried', mouth: 'o', arms: 'down' },
    sad: { c: RED, eyes: 'low', brows: 'worried', mouth: 'frown', arms: 'down', extra: 'tear' },
    worried: { c: GREEN, eyes: 'open', brows: 'worried', mouth: 'wavy', arms: 'down', extra: 'sweat' },
    wave: { c: GREEN, eyes: 'open', mouth: 'smile', arms: 'wave' },
    point: { c: GREEN, eyes: 'side', mouth: 'smile', arms: 'point' },
    trophy: { c: GOLD, eyes: 'shut-happy', mouth: 'open', arms: 'hold', extra: 'trophy' },
    sleep: { c: GREY, eyes: 'shut', mouth: 'flat', arms: 'down', extra: 'zz' }
  };

  // Wick: a candlestick with a face. Green on a good move, red on a bad one, as on a chart.
  function wick(mood, size, opts) {
    var m = MOODS[mood] || MOODS.happy, body = m.c[0], dark = m.c[1], w = size || 96, h = Math.round(w * 4 / 3), s = '';
    s += '<svg class="wick wick--' + (MOODS[mood] ? mood : 'happy') + (opts && opts.idle ? ' wick--idle' : '') + '" viewBox="0 0 120 160" width="' + w + '" height="' + h + '" aria-hidden="true" focusable="false">';
    s += '<ellipse cx="60" cy="153" rx="30" ry="5" fill="' + INK + '" opacity=".12"/><g class="wick__b">';
    s += '<path d="M60 ' + (m.extra === 'trophy' ? 26 : 6) + 'v' + (m.extra === 'trophy' ? 4 : 26) + 'M60 124v24" stroke="' + dark + '" stroke-width="7" stroke-linecap="round"/>';
    var A = {
      up: 'M31 78 15 52M89 78l16-26', down: 'M31 86l-12 16M89 86l12 16', wave: 'M31 86l-12 16M89 78l14-22M103 56l6-8',
      point: 'M31 86l-12 16M89 80h24', hold: 'M31 70 40 14M89 70l-9-56',
      chin: 'M31 88l-12 10M89 86c10 2 9 -10 -2 -6'
    };
    s += '<path d="' + A[m.arms] + '" stroke="' + dark + '" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>';
    if (m.extra === 'trophy') s += '<path d="M47 2h26v7a13 13 0 0 1-26 0z" fill="#ffd84d" stroke="#a87a00" stroke-width="2.5"/><path d="M47 5h-5a5 5 0 0 0 6 7M73 5h5a5 5 0 0 1-6 7" fill="none" stroke="#a87a00" stroke-width="2.5"/><path d="M56 22h8v4h-8z" fill="#a87a00"/>';
    s += '<rect x="28" y="28" width="64" height="98" rx="24" fill="' + body + '" stroke="' + dark + '" stroke-width="3"/>';
    s += '<rect x="37" y="38" width="9" height="56" rx="4.5" fill="#fff" opacity=".28"/>';
    var E = {
      open: '<ellipse cx="48" cy="64" rx="6.5" ry="8.5" fill="' + INK + '"/><ellipse cx="72" cy="64" rx="6.5" ry="8.5" fill="' + INK + '"/><circle cx="50.5" cy="60.5" r="2.4" fill="#fff"/><circle cx="74.5" cy="60.5" r="2.4" fill="#fff"/>',
      side: '<ellipse cx="50" cy="64" rx="6.5" ry="8.5" fill="' + INK + '"/><ellipse cx="74" cy="64" rx="6.5" ry="8.5" fill="' + INK + '"/><circle cx="53.5" cy="61" r="2.4" fill="#fff"/><circle cx="77.5" cy="61" r="2.4" fill="#fff"/>',
      wide: '<circle cx="48" cy="64" r="9" fill="#fff" stroke="' + INK + '" stroke-width="2.5"/><circle cx="72" cy="64" r="9" fill="#fff" stroke="' + INK + '" stroke-width="2.5"/><circle cx="48" cy="65" r="4.5" fill="' + INK + '"/><circle cx="72" cy="65" r="4.5" fill="' + INK + '"/>',
      low: '<ellipse cx="48" cy="67" rx="6" ry="6.5" fill="' + INK + '"/><ellipse cx="72" cy="67" rx="6" ry="6.5" fill="' + INK + '"/><circle cx="50" cy="65" r="2" fill="#fff"/><circle cx="74" cy="65" r="2" fill="#fff"/>',
      shut: '<path d="M42 66q6 5 12 0M66 66q6 5 12 0" stroke="' + INK + '" stroke-width="4" stroke-linecap="round" fill="none"/>',
      'shut-happy': '<path d="M42 67q6-7 12 0M66 67q6-7 12 0" stroke="' + INK + '" stroke-width="4" stroke-linecap="round" fill="none"/>',
      star: '<path d="M48 55l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7zM72 55l2.6 5.6 6 .7-4.5 4.1 1.2 6-5.3-3-5.3 3 1.2-6-4.5-4.1 6-.7z" fill="' + INK + '"/>'
    };
    s += E[m.eyes];
    if (m.brows === 'worried') s += '<path d="M40 52l13-4M80 52l-13-4" stroke="' + INK + '" stroke-width="3.5" stroke-linecap="round"/>';
    s += '<circle cx="40" cy="80" r="5.5" fill="#ff9ec0" opacity=".75"/><circle cx="80" cy="80" r="5.5" fill="#ff9ec0" opacity=".75"/>';
    var M = {
      smile: '<path d="M50 82q10 11 20 0" stroke="' + INK + '" stroke-width="4.5" stroke-linecap="round" fill="none"/>',
      open: '<path d="M49 81h22q0 14-11 14t-11-14z" fill="' + INK + '"/><path d="M53 89q7 5 14 0v1q-7 6-14 0z" fill="#ff7a9e"/>',
      o: '<ellipse cx="60" cy="87" rx="5.5" ry="6.5" fill="' + INK + '"/>',
      flat: '<path d="M53 86h14" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/>',
      frown: '<path d="M51 90q9-9 18 0" stroke="' + INK + '" stroke-width="4.5" stroke-linecap="round" fill="none"/>',
      wavy: '<path d="M50 87q3.5-4 7 0t7 0 7 0" stroke="' + INK + '" stroke-width="4" stroke-linecap="round" fill="none"/>'
    };
    s += M[m.mouth];
    if (m.extra === 'tear') s += '<path d="M76 74q4 7 0 9-4-2 0-9z" fill="#5aa9ff"/>';
    if (m.extra === 'sweat') s += '<path d="M88 40q6 9 0 12-6-3 0-12z" fill="#5aa9ff"/>';
    s += '</g>';
    if (m.extra === 'sparkle') s += '<path d="M14 26l3 7 7 3-7 3-3 7-3-7-7-3 7-3zM106 18l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM104 100l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#f2b705"/>';
    if (m.extra === 'zz') s += '<text x="94" y="30" font-family="Sora, sans-serif" font-size="16" font-weight="600" fill="' + dark + '">z</text><text x="104" y="16" font-family="Sora, sans-serif" font-size="12" font-weight="600" fill="' + dark + '">z</text>';
    return s + '</svg>';
  }

  // Glyphs on the path's nodes, drawn white on the node's fill (24px box).
  var G = {
    lesson: '<path d="M4 5.5C6.5 4.3 9.3 4.4 12 6c2.7-1.6 5.5-1.7 8-.5V19c-2.5-1.2-5.3-1.1-8 .5-2.7-1.6-5.5-1.7-8-.5z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 6v13.5" stroke="currentColor" stroke-width="2.2"/>',
    game: '<path d="M4 17.5 9 12l3.5 3L20 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 7h5v5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    challenge: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill="currentColor"/>',
    trophy: '<path d="M7 4h10v5a5 5 0 0 1-10 0z" fill="currentColor"/><path d="M7 6H4.5a3 3 0 0 0 3 4M17 6h2.5a3 3 0 0 1-3 4" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10 14h4v3h-4zM7.5 18.5h9V21h-9z" fill="currentColor"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="10" rx="2.5" fill="currentColor"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>',
    close: '<path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    back: '<path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    sound: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    mute: '<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    path: '<circle cx="7" cy="6" r="3" fill="currentColor"/><circle cx="17" cy="12" r="3" fill="currentColor"/><circle cx="7" cy="18" r="3" fill="currentColor"/><path d="M9.5 7.5l5 3M14.5 13.5l-5 3" stroke="currentColor" stroke-width="2"/>',
    medal: '<path d="M8 3h3l1 5-3 1zM16 3h-3l-1 5 3 1z" fill="currentColor"/><circle cx="12" cy="15" r="6" fill="currentColor"/>',
    book: '<path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v15.5H7.5A1.5 1.5 0 0 1 6 19z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/><path d="M6 17.5h12.5M9.5 7.5h5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>'
  };
  function glyph(name, size, cls) {
    return '<svg class="' + (cls || 'g') + '" viewBox="0 0 24 24" width="' + (size || 24) + '" height="' + (size || 24) + '" aria-hidden="true" focusable="false">' + (G[name] || '') + '</svg>';
  }

  // XP spark and streak flame, in their own colours.
  function xpIcon(size) {
    return '<svg class="ic-xp" viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) + '" aria-hidden="true" focusable="false">' +
      '<path d="M13.5 2 5 13.2h6L9.8 22 19 10.3h-6.1z" fill="#f2b705" stroke="#b37f00" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  }
  function flame(size, off) {
    var a = off ? '#b9b9b3' : '#ff7a1a', b = off ? '#dcdcd6' : '#ffc53d';
    return '<svg class="ic-flame" viewBox="0 0 24 24" width="' + (size || 20) + '" height="' + (size || 20) + '" aria-hidden="true" focusable="false">' +
      '<path d="M12.2 2c.6 3.5 4.3 5.4 5.6 8.6 1.7 4.2-.9 9.4-5.8 9.4-4.4 0-7.2-3.4-6.5-7.6.4-2.4 2-3.7 2.9-5.4.3 1.6.9 2.6 1.8 3.2-.2-3.3.4-6 2-8.2z" fill="' + a + '"/>' +
      '<path d="M12.3 11c.3 1.8 2.3 2.8 2.6 4.7.4 2.2-1.1 3.9-2.9 3.9-2 0-3.3-1.6-2.9-3.6.2-1 .8-1.6 1.2-2.4.2.6.5 1 .9 1.3 0-1.6.4-2.9 1.1-3.9z" fill="' + b + '"/></svg>';
  }
  function goalRing(fraction, size) {
    var r = 15, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, fraction)), z = size || 36;
    return '<svg class="ic-goal" viewBox="0 0 36 36" width="' + z + '" height="' + z + '" aria-hidden="true" focusable="false">' +
      '<circle cx="18" cy="18" r="' + r + '" fill="none" stroke="var(--surface)" stroke-width="5"/>' +
      (f > 0 ? '<circle cx="18" cy="18" r="' + r + '" fill="none" stroke="var(--up)" stroke-width="5" stroke-linecap="round" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 18 18)"/>' : '') + '</svg>';
  }

  // One small picture per unit, for its header: what the unit is about, drawn as a chart object.
  function unitArt(n) {
    var s = '<svg class="unit-art" viewBox="0 0 96 72" width="96" height="72" aria-hidden="true" focusable="false">';
    var up = '#1fae74', dn = '#e2445c', ink = 'currentColor';
    if (n === 1) { // three candles rising, a strike line
      s += '<path d="M6 46h84" stroke="' + ink + '" stroke-width="2" stroke-dasharray="4 4" opacity=".5"/>';
      [[20, 44, 18, dn], [44, 34, 22, up], [68, 18, 28, up]].forEach(function (c) {
        s += '<path d="M' + c[0] + ' ' + (c[1] - 8) + 'v' + (c[2] + 16) + '" stroke="' + c[3] + '" stroke-width="3" stroke-linecap="round"/>' +
          '<rect x="' + (c[0] - 7) + '" y="' + c[1] + '" width="14" height="' + c[2] + '" rx="3" fill="' + c[3] + '"/>';
      });
    } else if (n === 2) { // a bought CE: flat, then up
      s += '<path d="M6 40h84" stroke="' + ink + '" stroke-width="2" opacity=".35"/><path d="M8 52h40l40-40" fill="none" stroke="' + up + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="48" cy="52" r="5" fill="' + ink + '"/><path d="M8 52h40" stroke="' + dn + '" stroke-width="5" stroke-linecap="round"/>';
    } else if (n === 3) { // a clock at 15:30: hour hand between 3 and 4, minute hand on 6
      s += '<circle cx="48" cy="36" r="27" fill="none" stroke="' + ink + '" stroke-width="4"/>' +
        '<path d="M48 13v4M71 36h-4M48 59v-4M25 36h4" stroke="' + ink + '" stroke-width="3" stroke-linecap="round" opacity=".5"/>' +
        '<path d="M48 36l12.5 4.5" stroke="' + ink + '" stroke-width="5" stroke-linecap="round"/><path d="M48 36v19" stroke="' + dn + '" stroke-width="4" stroke-linecap="round"/>' +
        '<circle cx="48" cy="36" r="4" fill="' + ink + '"/>';
    } else if (n === 4) { // a chain table with the ATM row
      for (var i = 0; i < 4; i++) {
        var y = 10 + i * 14, atm = i === 2;
        s += '<rect x="8" y="' + y + '" width="80" height="10" rx="3" fill="' + (atm ? 'none' : ink) + '" opacity="' + (atm ? 1 : .18) + '"' + (atm ? ' stroke="#d0106f" stroke-width="2.5"' : '') + '/>' +
          '<rect x="10" y="' + (y + 2) + '" width="' + (10 + (i * 7) % 22) + '" height="6" rx="2" fill="' + up + '"/><rect x="' + (64 + (i * 5) % 12) + '" y="' + (y + 2) + '" width="' + (22 - (i * 5) % 12) + '" height="6" rx="2" fill="' + dn + '"/>';
      }
    } else { // a shield: the seller's hedge
      s += '<path d="M48 8l30 10v16c0 18-13 28-30 32C31 62 18 52 18 34V18z" fill="none" stroke="' + ink + '" stroke-width="4" stroke-linejoin="round"/>' +
        '<path d="M34 38l9 9 18-20" fill="none" stroke="' + up + '" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>';
    }
    return s + '</svg>';
  }

  // Badges: a coloured medal with its own mark; greyed until earned.
  var BADGE_MARKS = {
    'first-lesson': ['#2d7ff9', G.book], 'first-trade': ['#1fae74', G.game], 'perfect': ['#d0106f', G.check],
    'three-stars': ['#f2b705', G.challenge], 'streak-3': ['#ff7a1a', null], 'streak-7': ['#e8480c', null],
    'unit-1': ['#1fae74', null, 1], 'unit-2': ['#2d7ff9', null, 2], 'unit-3': ['#c98a00', null, 3], 'unit-4': ['#e2662f', null, 4], 'unit-5': ['#d0106f', null, 5],
    'level-5': ['#11998e', null, '5']
  };
  function badge(id, earned, size) {
    var b = BADGE_MARKS[id] || ['#888', G.challenge], col = earned ? b[0] : '#b9b9b3', dk = earned ? shade(col) : '#9d9d97', z = size || 72, s = '';
    s += '<svg class="badge-art" viewBox="0 0 72 80" width="' + z + '" height="' + Math.round(z * 80 / 72) + '" aria-hidden="true" focusable="false">';
    var mark = function (glyph) { return '<g transform="translate(24 ' + 22 + ')" color="#fff"><svg viewBox="0 0 24 24" width="24" height="24">' + glyph + '</svg></g>'; };
    var num = function (t, y, fs) { return '<text x="36" y="' + y + '" text-anchor="middle" font-family="Sora, sans-serif" font-size="' + fs + '" font-weight="600" fill="#fff">' + t + '</text>'; };
    if (/^streak/.test(id)) { // a flame
      s += '<path d="M37 3c3 12 18 19 22 31 6 17-6 40-23 40S7 60 12 41c2-9 8-14 11-20 1 6 4 10 7 12-1-12 2-22 7-30z" fill="' + col + '" stroke="' + dk + '" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M37 36c1 6 8 9 9 16 1 8-4 14-10 14-7 0-11-6-10-13 1-4 3-6 4-9 1 2 2 4 3 5 0-6 2-10 4-13z" fill="#fff" opacity=".3"/>' + num(id.split('-')[1], 62, 22);
    } else if (/^unit/.test(id)) { // a medallion on a ribbon, the unit's picture inside
      s += '<path d="M22 52 15 79l11-6 8 7 5-25zM50 52l7 27-11-6-8 7-5-25z" fill="' + dk + '"/>' +
        '<circle cx="36" cy="34" r="31" fill="' + col + '" stroke="' + dk + '" stroke-width="3"/><circle cx="36" cy="34" r="24" fill="#fff" opacity="' + (earned ? .92 : .5) + '"/>' +
        '<g transform="translate(15 18) scale(.44)" color="#1d1d1b">' + unitArt(b[2]).replace(/^<svg[^>]*>|<\/svg>$/g, '') + '</g>';
    } else if (id === 'three-stars') { // a gold star with a foil shine
      s += '<path d="M36 3l9.5 19.3 21.3 3.1-15.4 15 3.6 21.2L36 51.6 17 61.6l3.6-21.2L5.2 25.4l21.3-3.1z" fill="' + col + '" stroke="' + dk + '" stroke-width="3" stroke-linejoin="round"/>' +
        (earned ? '<path d="M26 22l8 24M34 14l10 30" stroke="#fff" stroke-width="4" opacity=".45" stroke-linecap="round"/>' : '') +
        '<path d="M22 66h28" stroke="' + dk + '" stroke-width="5" stroke-linecap="round"/><path d="M28 74h16" stroke="' + dk + '" stroke-width="5" stroke-linecap="round"/>';
    } else { // milestones: a shield
      s += '<path d="M22 50 16 78l12-6 8 8 6-28zM50 50l6 28-12-6-8 8-6-28z" fill="' + dk + '"/>' +
        '<path d="M36 3l29 12v22c0 17-12 27-29 33C19 64 7 54 7 37V15z" fill="' + col + '"/><path d="M36 10l22 9v17c0 13-9 21-22 26-13-5-22-13-22-26V19z" fill="#fff" opacity=".22"/>' +
        (b[1] ? mark(b[1]) : '') + (b[2] != null ? num(b[2], 45, 22) : '');
    }
    return s + '</svg>';
  }
  function shade(hex) { var n = parseInt(hex.slice(1), 16), f = .72; return 'rgb(' + Math.round((n >> 16) * f) + ',' + Math.round((n >> 8 & 255) * f) + ',' + Math.round((n & 255) * f) + ')'; }

  var Art = { wick: wick, glyph: glyph, xpIcon: xpIcon, flame: flame, goalRing: goalRing, unitArt: unitArt, badge: badge };
  if (typeof module !== 'undefined') module.exports = Art; else root.Art = Art;
})(this);
