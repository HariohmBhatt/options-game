// Payoff Painter pure logic. Plain script (browser) and node module (tests).
(function (root) {
  var node = typeof module !== 'undefined';
  var Engine = node ? require('../../engine.js') : root.Engine;
  var Market = node ? require('../../market.js') : root.Market;
  var IDX = Market.INDICES.NIFTY, SPOT = IDX.spot, LOT = IDX.lot;
  var STRIKES = Market.strikes('NIFTY', SPOT, 2);
  var S_MIN = SPOT - 600, S_MAX = SPOT + 600;
  var T = 4 / 252; // NIFTY weekly with 4 trading days left

  // Premium in index points.
  function premium(type, K) {
    return Market.premium({ type: type, S: SPOT, K: K, T: T, vix: Market.VIX });
  }
  function r2(x) { return Math.round(x * 100) / 100; }

  // pos = {side: 'buy'|'sell', type: 'call'|'put', K}. P/L at expiry in rupees for 1 lot.
  function pl(pos, S) {
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
      charges: r2(Market.charges({ side: 'buy', premium: p, qty: LOT }).total + Market.charges({ side: 'sell', premium: p, qty: LOT }).total)
    };
  }

  function name(pos) { return pos.side.toUpperCase() + ' ' + pos.K + ' ' + (pos.type === 'call' ? 'CE' : 'PE'); }

  function wrongFields(guess, target) {
    return ['side', 'type', 'K'].filter(function (f) { return guess[f] !== target[f]; });
  }

  var NAMES = { side: 'side', type: 'type', K: 'strike' };
  function hint(guess, target) {
    var w = wrongFields(guess, target);
    if (!w.length) return '';
    if (w.length === 1 && w[0] === 'K') return 'Right shape, wrong strike: the line bends at ' + target.K + '.';
    var tip = {
      side: target.side === 'buy'
        ? 'a buyer pays the premium, so the flat part sits BELOW zero and the loss is capped.'
        : 'a seller collects the premium, so the flat part sits ABOVE zero and the loss keeps growing.',
      type: target.type === 'call'
        ? 'a CE (call) only pays when NIFTY ends ABOVE the strike, so the slope is on the right.'
        : 'a PE (put) only pays when NIFTY ends BELOW the strike, so the slope is on the left.'
    }[w[0]];
    return 'Wrong ' + w.map(function (f) { return NAMES[f]; }).join(' and ') + ': ' + tip;
  }

  function money(x) { return x === Infinity ? 'unlimited' : Market.fmt(x); }
  function pts(x) { return x.toLocaleString('en-IN', { maximumFractionDigits: 2 }); }

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
  all().forEach(function (pos) { curve(pos).forEach(function (p) { peak = Math.max(peak, Math.abs(p[1])); }); });
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

  var Payoff = { SPOT: SPOT, LOT: LOT, STRIKES: STRIKES, S_MIN: S_MIN, S_MAX: S_MAX, YMAX: YMAX, YSTEP: YSTEP, all: all,
    premium: premium, pl: pl, curve: curve, stats: stats, name: name, wrongFields: wrongFields, hint: hint, money: money,
    pts: pts, explain: explain, puzzles: puzzles };
  if (node) module.exports = Payoff; else root.Payoff = Payoff;
})(this);
