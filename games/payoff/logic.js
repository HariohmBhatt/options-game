// Payoff Painter pure logic. Plain script (browser) and node module (tests).
(function (root) {
  var Engine = typeof module !== 'undefined' ? require('../../engine.js') : root.Engine;
  var STRIKES = [80, 90, 100, 110, 120];
  var S_MIN = 50, S_MAX = 150;

  function premium(type, K) {
    return Math.round(Engine.price({ type: type, S: 100, K: K, T: 30 / 252, sigma: 0.35 }) * 100) / 100;
  }

  // pos = {side: 'buy'|'sell', type: 'call'|'put', K}
  function pl(pos, S) {
    var sign = pos.side === 'buy' ? 1 : -1;
    return sign * (Engine.payoff(pos.type, S, pos.K) - premium(pos.type, pos.K));
  }

  function curve(pos) {
    var pts = [];
    for (var S = S_MIN; S <= S_MAX; S++) pts.push([S, pl(pos, S)]);
    return pts;
  }

  // Infinity means unlimited. Put gains/losses are capped by the stock falling to 0.
  function stats(pos) {
    var p = premium(pos.type, pos.K), call = pos.type === 'call', buy = pos.side === 'buy';
    var be = call ? pos.K + p : pos.K - p;
    var big = call ? Infinity : pos.K - p;
    return {
      premium: p, breakeven: Math.round(be * 100) / 100,
      maxLoss: buy ? p : Math.round(big * 100) / 100,
      maxGain: buy ? Math.round(big * 100) / 100 : p
    };
  }

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
        ? 'a call only moves when the stock is ABOVE the strike, so the slope is on the right.'
        : 'a put only moves when the stock is BELOW the strike, so the slope is on the left.'
    }[w[0]];
    return 'Wrong ' + w.map(function (f) { return NAMES[f]; }).join(' and ') + ': ' + tip;
  }

  function money(x) { return x === Infinity ? 'unlimited' : x.toFixed(2); }

  function explain(pos) {
    var s = stats(pos), K = pos.K, p = s.premium.toFixed(2), be = s.breakeven.toFixed(2);
    if (pos.side === 'buy' && pos.type === 'call')
      return 'You bought a call at ' + K + ' for ' + p + ': the most you can lose is that premium, and you profit more and more as the stock rises above ' + be + '.';
    if (pos.side === 'buy')
      return 'You bought a put at ' + K + ' for ' + p + ': the most you can lose is that premium, and you profit more and more as the stock falls below ' + be + '.';
    if (pos.type === 'call')
      return 'You sold a call at ' + K + ': you keep the ' + p + ' premium if the stock stays below ' + K + ', but you lose more and more as it rises above ' + be + ', with no ceiling because a stock can rise forever.';
    return 'You sold a put at ' + K + ': you keep the ' + p + ' premium if the stock stays above ' + K + ', but you lose more and more as it falls below ' + be + '.';
  }

  // 8 puzzles: one of each shape first (so all four appear), then 4 more, shuffled.
  function puzzles(seed) {
    var rand = Engine.rng(seed), all = [];
    ['buy', 'sell'].forEach(function (side) {
      ['call', 'put'].forEach(function (type) {
        STRIKES.forEach(function (K) { all.push({ side: side, type: type, K: K }); });
      });
    });
    function shuffle(a) {
      for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rand() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; }
      return a;
    }
    shuffle(all);
    var seen = {}, first = [], rest = [];
    all.forEach(function (p) {
      var k = p.side + p.type;
      if (seen[k]) rest.push(p); else { seen[k] = 1; first.push(p); }
    });
    return shuffle(first.concat(rest.slice(0, 4)));
  }

  var Payoff = { STRIKES: STRIKES, S_MIN: S_MIN, S_MAX: S_MAX, premium: premium, pl: pl, curve: curve, stats: stats,
    wrongFields: wrongFields, hint: hint, money: money, explain: explain, puzzles: puzzles };
  if (typeof module !== 'undefined') module.exports = Payoff; else root.Payoff = Payoff;
})(this);
