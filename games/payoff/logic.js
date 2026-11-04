// Payoff Painter pure logic. Plain script (browser) and node module (tests).
(function (root) {
  var node = typeof module !== 'undefined';
  var Engine = node ? require('../../engine.js') : root.Engine;
  var Market = node ? require('../../market.js') : root.Market;
  var IDX = Market.INDICES.NIFTY, SPOT = IDX.spot, LOT = IDX.lot;
  var STRIKES = Market.strikes('NIFTY', SPOT, 2);
  var S_MIN = SPOT - 600, S_MAX = SPOT + 600;
  var T = 4 / 252; // NIFTY weekly with 4 trading days left

  // Level 2 targets: two-leg positions.
  var SPREADS = [
    { name: 'Bull call spread', legs: [{ side: 'buy', type: 'call', K: 24000 }, { side: 'sell', type: 'call', K: 24100 }] },
    { name: 'Bear put spread', legs: [{ side: 'buy', type: 'put', K: 24000 }, { side: 'sell', type: 'put', K: 23900 }] },
    { name: 'Long straddle', legs: [{ side: 'buy', type: 'call', K: 24000 }, { side: 'buy', type: 'put', K: 24000 }] },
    { name: 'Short strangle', legs: [{ side: 'sell', type: 'call', K: 24100 }, { side: 'sell', type: 'put', K: 23900 }] }
  ];

  // Premium in index points.
  function premium(type, K) {
    return Market.premium({ type: type, S: SPOT, K: K, T: T, vix: Market.VIX });
  }
  function r2(x) { return Math.round(x * 100) / 100; }

  // pos = {side: 'buy'|'sell', type: 'call'|'put', K}, or an array of them (a spread: the legs' P/L added).
  // P/L at expiry in rupees for 1 lot.
  function pl(pos, S) {
    if (Array.isArray(pos)) return r2(pos.reduce(function (a, leg) { return a + pl(leg, S); }, 0));
    var sign = pos.side === 'buy' ? 1 : -1;
    return r2(sign * (Engine.payoff(pos.type, S, pos.K) - premium(pos.type, pos.K)) * LOT);
  }

  // Step 10 lands on every strike (multiples of 50), so the bend is drawn exactly.
  function curve(pos) {
    var pts = [];
    for (var S = S_MIN; S <= S_MAX; S += 10) pts.push([S, pl(pos, S)]);
    return pts;
  }

  // Breakeven in index points, max loss/gain in rupees per lot. Infinity means unlimited.
  // A put's gain/loss is capped by NIFTY falling to 0.
  function stats(pos) {
    var p = premium(pos.type, pos.K), call = pos.type === 'call', buy = pos.side === 'buy';
    var big = call ? Infinity : r2((pos.K - p) * LOT), prem = r2(p * LOT);
    return {
      premium: p, premiumRs: prem, breakeven: r2(call ? pos.K + p : pos.K - p),
      maxLoss: buy ? prem : big, maxGain: buy ? big : prem,
      charges: r2(Market.charges({ side: 'buy', premium: p, qty: LOT }).total + Market.charges({ side: 'sell', premium: p, qty: LOT }).total),
      chargesOpen: Market.charges({ side: pos.side, premium: p, qty: LOT }).total // the only order if it expires worthless
    };
  }

  function name(pos) { return pos.side.toUpperCase() + ' ' + pos.K + ' ' + (pos.type === 'call' ? 'CE' : 'PE'); }

  function wrongFields(guess, target) {
    return ['side', 'type', 'K'].filter(function (f) { return guess[f] !== target[f]; });
  }

  var NAMES = { side: 'side', type: 'type', K: 'strike' };
  function fieldList(w) {
    var names = w.map(function (f) { return NAMES[f]; });
    return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  }
  function hint(guess, target) {
    var w = wrongFields(guess, target);
    if (!w.length) return '';
    if (w.length === 1 && w[0] === 'K') return 'Right shape, wrong strike: the line bends at ' + target.K + '.';
    var tip = {
      side: target.side === 'buy'
        ? 'a buyer pays the premium, so the flat part sits below zero.'
        : 'a seller collects the premium, so the flat part sits above zero.',
      type: target.type === 'call'
        ? 'a CE (call) only pays when NIFTY ends above the strike, so the slope is on the right.'
        : 'a PE (put) only pays when NIFTY ends below the strike, so the slope is on the left.',
      K: 'the line bends at ' + target.K + ', not ' + guess.K + '.'
    };
    return 'Wrong ' + fieldList(w) + ': ' + w.map(function (f, n) {
      var t = tip[f];
      return n === 0 ? t : (n === w.length - 1 ? 'And ' + t : t.charAt(0).toUpperCase() + t.slice(1));
    }).join(' ');
  }

  function money(x) { return x === Infinity ? 'unlimited' : Market.fmt(x); }
  function pts(x) { return x.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function explain(pos) {
    var s = stats(pos), K = pos.K, rs = Market.fmt(s.premiumRs), be = pts(s.breakeven), per = Market.fmt(LOT);
    var opt = K + (pos.type === 'call' ? ' CE' : ' PE');
    if (pos.side === 'buy')
      return 'You bought a ' + opt + ' for ' + rs + ': that is the most you can lose, and you make ' + per + ' for every point NIFTY ends ' +
        (pos.type === 'call' ? 'above ' : 'below ') + be + ' on Tuesday.';
    if (pos.type === 'call')
      return 'You sold a ' + opt + ' and collected ' + rs + ': you keep it if NIFTY stays below ' + K + ' on Tuesday, and lose ' + per +
        ' for every point above ' + be + ', with no ceiling.';
    return 'You sold a ' + opt + ' and collected ' + rs + ': you keep it if NIFTY stays above ' + K + ' on Tuesday, and lose ' + per +
      ' for every point below ' + be + '.';
  }

  function all() {
    var out = [];
    ['buy', 'sell'].forEach(function (side) {
      ['call', 'put'].forEach(function (type) {
        STRIKES.forEach(function (K) { out.push({ side: side, type: type, K: K }); });
      });
    });
    return out;
  }

  // Chart y range: largest |P/L| of any position, rounded up to a half power of ten, so no curve is clipped.
  var peak = 0;
  all().concat(SPREADS.map(function (sp) { return sp.legs; })).forEach(function (pos) { curve(pos).forEach(function (p) { peak = Math.max(peak, Math.abs(p[1])); }); });
  var YSTEP = Math.pow(10, Math.floor(Math.log10(peak)));
  var YMAX = Math.ceil(peak / (YSTEP / 2)) * (YSTEP / 2);

  // 8 puzzles: one of each shape first (so all four appear), then 4 more, shuffled.
  function puzzles(seed) {
    var rand = Engine.rng(seed), list = all();
    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    shuffle(list);
    var seen = {}, first = [], rest = [];
    list.forEach(function (p) {
      var k = p.side + p.type;
      if (seen[k]) rest.push(p); else { seen[k] = 1; first.push(p); }
    });
    return shuffle(first.concat(rest.slice(0, 4)));
  }

  // ---------- Level 2: spreads (two legs) ----------
  function key(leg) { return leg.side + leg.type + leg.K; }
  function sameLegs(a, b) { return a.map(key).sort().join() === b.map(key).sort().join(); }

  // P/L in points per unit, unrounded, so breakevens come out exact.
  function rawPts(legs, S) {
    return legs.reduce(function (a, l) { return a + (l.side === 'buy' ? 1 : -1) * (Engine.payoff(l.type, S, l.K) - premium(l.type, l.K)); }, 0);
  }
  // net > 0: premium paid (debit), net < 0: received (credit), in points. Max loss/gain in rupees, Infinity = unlimited.
  function spreadStats(legs) {
    var net = r2(legs.reduce(function (a, l) { return a + (l.side === 'buy' ? 1 : -1) * premium(l.type, l.K); }, 0));
    var ks = legs.map(function (l) { return l.K; }).sort(function (a, b) { return a - b; });
    var xs = [0].concat(ks, [ks[ks.length - 1] + 1]); // P/L is straight between these; the last pair gives the right-hand slope
    var vs = xs.map(function (S) { return rawPts(legs, S); });
    var slope = vs[vs.length - 1] - vs[vs.length - 2];
    var be = [];
    for (var n = 0; n < xs.length - 2; n++) {
      var a = vs[n], b = vs[n + 1];
      if (a === 0) be.push(xs[n]); else if (a * b < 0) be.push(xs[n] + a / (a - b) * (xs[n + 1] - xs[n]));
    }
    if (slope && vs[vs.length - 2] * slope < 0) be.push(xs[xs.length - 2] - vs[vs.length - 2] / slope);
    var top = Math.max.apply(null, vs.slice(0, -1)), low = Math.min.apply(null, vs.slice(0, -1));
    return {
      net: net, netRs: r2(Math.abs(net) * LOT), debit: net > 0,
      maxGain: slope > 1e-9 ? Infinity : r2(top * LOT), maxLoss: slope < -1e-9 ? Infinity : r2(-low * LOT),
      breakevens: be.map(r2).filter(function (x, n, arr) { return arr.indexOf(x) === n; })
    };
  }
  function spreadExplain(sp) {
    var st = spreadStats(sp.legs), f = Market.fmt, be = st.breakevens.map(pts), alone = f(premium(sp.legs[0].type, sp.legs[0].K) * LOT);
    return {
      'Bull call spread': 'A bull call spread caps your gain at ' + f(st.maxGain) + ' but cuts the cost from ' + alone + ' to ' + f(st.netRs) + ', so it needs a smaller move to break even.',
      'Bear put spread': 'A bear put spread caps your gain at ' + f(st.maxGain) + ' but cuts the cost from ' + alone + ' to ' + f(st.netRs) + ', so NIFTY needs to fall less to break even.',
      'Long straddle': 'A long straddle is a bet on a big move either way: you pay ' + f(st.netRs) + ' for both legs and profit only if NIFTY ends below ' + be[0] + ' or above ' + be[1] + '.',
      'Short strangle': 'A short strangle collects ' + f(st.netRs) + ' and keeps all of it if NIFTY stays between 23,900 and 24,100. It still makes some profit anywhere between ' + be[0] + ' and ' + be[1] + ', but past those the loss keeps growing.'
    }[sp.name];
  }
  // Hint for a two-leg guess: which legs are already right, and what is wrong with the others.
  function spreadHint(guessLegs, target) {
    if (sameLegs(guessLegs, target)) return '';
    if (guessLegs.length < target.length) return 'This line is two options added together: tap "Add leg 2" and build the second one.';
    var g = guessLegs.map(function (l, n) { return { l: l, n: n + 1 }; }), t = target.slice();
    g = g.filter(function (x) { var j = t.map(key).indexOf(key(x.l)); if (j < 0) return true; t.splice(j, 1); return false; });
    if (g.length === 2 && wrongFields(g[0].l, t[1]).length + wrongFields(g[1].l, t[0]).length <
        wrongFields(g[0].l, t[0]).length + wrongFields(g[1].l, t[1]).length) t.reverse(); // pair each leg with the closest target leg
    return (g.length === 1 ? 'Leg ' + (3 - g[0].n) + ' is right. ' : '') +
      g.map(function (x, n) { return 'Leg ' + x.n + ': ' + legHint(x.l, t[n]); }).join(' ');
  }
  // A leg on its own has no visible flat part in a spread, so say what the leg does to the combined line.
  function legHint(guess, target) {
    var w = wrongFields(guess, target), tip = {
      side: target.side === 'buy' ? 'This option is bought: past its strike it tilts the line up.' : 'This option is sold: past its strike it tilts the line down.',
      type: target.type === 'call' ? 'It is a CE: it acts to the right of its strike (NIFTY above).' : 'It is a PE: it acts to the left of its strike (NIFTY below).',
      K: 'Its bend is at ' + target.K + ', not ' + guess.K + '.'
    };
    return 'wrong ' + fieldList(w) + '. ' + w.map(function (f) { return tip[f]; }).join(' ');
  }

  var Payoff = { SPOT: SPOT, LOT: LOT, STRIKES: STRIKES, S_MIN: S_MIN, S_MAX: S_MAX, YMAX: YMAX, YSTEP: YSTEP, all: all,
    premium: premium, pl: pl, curve: curve, stats: stats, name: name, wrongFields: wrongFields, hint: hint, money: money,
    pts: pts, explain: explain, puzzles: puzzles, SPREADS: SPREADS, sameLegs: sameLegs, spreadStats: spreadStats,
    spreadExplain: spreadExplain, spreadHint: spreadHint };
  if (node) module.exports = Payoff; else root.Payoff = Payoff;
})(this);
