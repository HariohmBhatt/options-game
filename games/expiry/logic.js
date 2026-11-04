// Pure game logic for "Expiry Tuesday" (0DTE NIFTY options). Plain script for the browser, also loadable in node for tests.
(function (root) {
  var node = typeof module !== 'undefined';
  var Engine = node ? require('../../engine.js') : root.Engine;
  var Market = node ? require('../../market.js') : root.Market;
  var LOT = 65, ROUNDS = 5, START = 50000, PREV = 24000, EXPIRY = new Date(2026, 10, 10);

  function T(t) { return Market.yearsToExpiry(new Date(2026, 10, 10, Math.floor(t / 60), t % 60), EXPIRY); }
  function premiumAt(type, K, tick) { return Market.premium({ type: type, S: tick.S, K: K, T: T(tick.t) }); }
  function intrinsic(type, K, S) { return Math.round(Engine.payoff(type, S, K) * 20) / 20; }
  // Per-unit points: {premium, intrinsic, time}. Time value = premium - intrinsic.
  function split(type, K, tick) {
    var p = premiumAt(type, K, tick), iv = Math.min(p, intrinsic(type, K, tick.S));
    return { premium: p, intrinsic: iv, time: Math.round((p - iv) * 100) / 100 };
  }

  function newRound(seed, bankroll) {
    return { seed: seed, path: Market.intradayPath({ prevClose: PREV, vix: Market.VIX, seed: seed, stepMin: 5 }), i: 0, bankroll: bankroll, pos: null, result: null };
  }
  function tick(r) { return r.path[r.i]; }
  function strikes(r) { return Market.strikes('NIFTY', tick(r).S, 2); }
  function cost(type, K, r) { return premiumAt(type, K, tick(r)) * LOT; }

  // Debits premium x lot now; charges are taken when the trade closes (netPnl covers both legs).
  function buy(r, type, K) {
    var p = premiumAt(type, K, tick(r));
    r.pos = { type: type, K: K, buy: p, i: r.i, bank0: r.bankroll };
    r.bankroll = Math.round((r.bankroll - p * LOT) * 100) / 100;
    return r;
  }
  function advance(r, mins) {
    r.i = Math.min(r.path.length - 1, r.i + mins / 5);
    if (r.i === r.path.length - 1) close(r, 'expiry');
    return r;
  }
  function sellNow(r) { return close(r, 'sold'); }

  function close(r, how) {
    var p = r.pos, tk = tick(r), sell = premiumAt(p.type, p.K, tk), iv = intrinsic(p.type, p.K, tk.S);
    var pnl = how === 'sold' ? Market.netPnl({ buy: p.buy, sell: sell, qty: LOT }) : Market.netPnl({ buy: p.buy, intrinsic: iv, qty: LOT });
    var peak = 0, crossed = false;
    for (var j = p.i; j <= r.i; j++) {
      peak = Math.max(peak, premiumAt(p.type, p.K, r.path[j]));
      if (intrinsic(p.type, p.K, r.path[j].S) > 0) crossed = true;
    }
    if (how === 'expiry') how = iv > 0 ? 'itm' : 'lapsed';
    r.result = { how: how, exit: how === 'sold' ? sell : iv, peak: peak, crossed: crossed, S: tk.S, t: tk.t, gross: pnl.gross, charges: pnl.charges, net: pnl.net };
    r.result.why = explain(r, r.result);
    r.bankroll = Math.round((p.bank0 + pnl.net) * 100) / 100;
    return r;
  }

  function maxLoss(buyPts) { return buyPts * LOT + Market.netPnl({ buy: buyPts, intrinsic: 0, qty: LOT }).charges; }

  function explain(r, res) {
    var p = r.pos, ce = p.type === 'call', name = p.K + (ce ? ' CE' : ' PE'), f = Market.fmt;
    var move = Math.round(res.S - r.path[p.i].S), dir = (move >= 0 ? 'rose ' : 'fell ') + Math.abs(move) + ' points';
    var paid = f(p.buy * LOT), after = res.net > 0 ? ' After ' + f(res.charges) + ' charges you made ' + f(res.net) + '.' : ' After ' + f(res.charges) + ' charges you lost ' + f(-res.net) + '.';
    if (res.how === 'lapsed')
      return 'NIFTY ' + dir + ' but ' + (res.crossed ? 'closed on the wrong side of ' + p.K : 'never ' + (ce ? 'reached ' : 'fell to ') + p.K) +
        ', so your ' + (ce ? 'CE' : 'PE') + ' was all time value and it melted from ' + paid + ' to ₹0 by 15:30.';
    if (res.how === 'itm')
      return 'NIFTY closed at ' + res.S.toFixed(0) + ', ' + Math.abs(Math.round(res.S - p.K)) + ' points ' + (ce ? 'above' : 'below') + ' your ' + name +
        ' strike, so it settled at intrinsic value ' + f(res.exit * LOT) + ' (you paid ' + paid + '). All the time value was gone.' + after;
    var s = split(p.type, p.K, r.path[r.i]);
    return 'You sold your ' + name + ' at ' + Market.hhmm(res.t) + ' for ' + f(res.exit * LOT) + ' (paid ' + paid + '); ' + f(s.time * LOT) + ' of that was time value that would have melted by 15:30.' + after;
  }

  // history: [{buy, peak, net}] -> how many "looked like a winner" (peak >= 2x buy) vs actually won after charges.
  function summary(history) {
    return {
      total: Math.round(history.reduce(function (a, h) { return a + h.net; }, 0) * 100) / 100,
      looked: history.filter(function (h) { return h.peak >= 2 * h.buy; }).length,
      won: history.filter(function (h) { return h.net > 0; }).length
    };
  }

  var Expiry = { LOT: LOT, ROUNDS: ROUNDS, START: START, PREV: PREV, EXPIRY: EXPIRY, T: T, premiumAt: premiumAt, intrinsic: intrinsic, split: split,
    newRound: newRound, tick: tick, strikes: strikes, cost: cost, buy: buy, advance: advance, sellNow: sellNow, maxLoss: maxLoss, explain: explain, summary: summary };
  if (node) module.exports = Expiry; else root.Expiry = Expiry;
})(this);
