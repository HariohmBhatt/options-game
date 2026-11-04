// Pure game logic for "Expiry Tuesday" (0DTE NIFTY options). Plain script for the browser, also loadable in node for tests.
(function (root) {
  var node = typeof module !== 'undefined';
  var Engine = node ? require('../../engine.js') : root.Engine;
  var Market = node ? require('../../market.js') : root.Market;
  var LOT = 65, ROUNDS = 5, START = 50000, PREV = 24000, EXPIRY = new Date(2026, 10, 10), STEP = 5, SESSION = 375;

  function T(t) { return Market.yearsToExpiry(new Date(2026, 10, 10, Math.floor(t / 60), t % 60), EXPIRY); }
  function premiumAt(type, K, tick, vix) { return Market.premium({ type: type, S: tick.S, K: K, T: T(tick.t), vix: vix }); }
  function intrinsic(type, K, S) { return Math.round(Engine.payoff(type, S, K) * 20) / 20; }
  function r2(x) { return Math.round(x * 100) / 100; }
  // Per-unit points: {premium, intrinsic, time}. Time value = premium - intrinsic.
  function split(type, K, tick, vix) {
    var p = premiumAt(type, K, tick, vix), iv = Math.min(p, intrinsic(type, K, tick.S));
    return { premium: p, intrinsic: iv, time: r2(p - iv) };
  }
  // Greeks for the whole position (per unit × qty).
  function greeksAt(type, K, tick, vix, qty) {
    var g = Market.greeks({ type: type, S: tick.S, K: K, T: T(tick.t), vix: vix });
    return { delta: g.delta * qty, theta: g.theta * qty, thetaHour: g.theta * qty / 6.25, vega: g.vega * qty, gamma: g.gamma * qty };
  }

  function makePath(seed, vix) { return Market.intradayPath({ prevClose: PREV, vix: vix, seed: seed, stepMin: STEP }); }
  // The day's VIX comes from the shared VIX-coupled simulator, so it varies round to round (12–18 typically).
  function newRound(seed, bankroll) {
    var vix = Market.simulate({ S0: PREV, days: 1, seed: seed }).vix[1];
    return { seed: seed, vix: vix, path: makePath(seed, vix), i: 0, bankroll: bankroll, pos: null, result: null };
  }
  function tick(r) { return r.path[r.i]; }
  function strikes(r) { return Market.strikes('NIFTY', tick(r).S, 4); }
  function moneyness(type, K, S) {
    var a = Market.atm('NIFTY', S);
    return K === a ? 'ATM' : (type === 'call' ? K < a : K > a) ? 'ITM' : 'OTM';
  }
  // What a buy would cost right now: you pay the ask, plus buy-side charges.
  function quote(r, type, K, lots) {
    var qty = (lots || 1) * LOT, mid = premiumAt(type, K, tick(r), r.vix), ask = Market.fill({ premium: mid, side: 'buy' });
    var ch = Market.charges({ side: 'buy', premium: ask, qty: qty }).total, need = r2(ask * qty + ch);
    return { mid: mid, ask: ask, qty: qty, cost: r2(ask * qty), charges: ch, need: need, maxLoss: maxLoss(ask, qty), ok: !r.pos && !r.result && r.bankroll >= need };
  }
  function cost(type, K, r, lots) { return quote(r, type, K, lots).cost; }

  function buy(r, type, K, lots) {
    if (!K) return r; // no strike picked yet
    var q = quote(r, type, K, lots);
    if (!q.ok) return r;
    // peak is the highest BID seen, so it compares with what you could actually have sold for
    r.pos = { type: type, K: K, lots: lots || 1, qty: q.qty, buy: q.ask, mid: q.mid, i: r.i, bank0: r.bankroll, peak: Market.fill({ premium: q.mid, side: 'sell' }), dir: 0, time: 0 };
    r.bankroll = r2(r.bankroll - q.need);
    return r;
  }
  // Moves the clock whether or not a position is open. Attribution uses the Greeks at the start of each 5-minute step.
  function advance(r, mins) {
    if (r.result) return r;
    var last = r.path.length - 1, p = r.pos;
    for (var n = 0; n < mins / STEP && r.i < last; n++) {
      if (p) {
        var g = greeksAt(p.type, p.K, tick(r), r.vix, p.qty), S0 = tick(r).S;
        p.time += g.theta * STEP / SESSION;
        r.i++;
        p.dir += g.delta * (tick(r).S - S0);
        p.peak = Math.max(p.peak, Market.fill({ premium: premiumAt(p.type, p.K, tick(r), r.vix), side: 'sell' }));
      } else r.i++;
    }
    if (r.i === last) {
      if (p) close(r, 'expiry');
      else r.result = { how: 'none', gross: 0, charges: 0, net: 0, peak: 0, S: tick(r).S, t: tick(r).t,
        why: 'You watched the whole session without buying, so you made and lost nothing. Sitting out is a real choice.' };
    }
    return r;
  }
  function sellNow(r) { return r.pos && !r.result ? close(r, 'sold') : r; }

  function close(r, how) {
    var p = r.pos, tk = tick(r), mid = premiumAt(p.type, p.K, tk, r.vix), bid = Market.fill({ premium: mid, side: 'sell' }), iv = intrinsic(p.type, p.K, tk.S);
    var sold = how === 'sold', pnl = sold ? Market.netPnl({ buy: p.buy, sell: bid, qty: p.qty }) : Market.netPnl({ buy: p.buy, intrinsic: iv, qty: p.qty });
    var crossed = false;
    for (var j = p.i; j <= r.i; j++) if (intrinsic(p.type, p.K, r.path[j].S) > 0) crossed = true;
    if (how === 'expiry') how = iv > 0 ? 'itm' : 'lapsed';
    // Mid-to-mid P/L splits into direction + time + gamma (residual); the spread you paid crossing ask/bid is separate.
    var grossMid = ((sold ? mid : iv) - p.mid) * p.qty, spread = r2((p.buy - p.mid) * p.qty + (sold ? (mid - bid) * p.qty : 0));
    var attr = { direction: r2(p.dir), time: r2(p.time), gamma: r2(grossMid - p.dir - p.time), spread: spread, charges: pnl.charges };
    r.result = { how: how, exit: sold ? bid : iv, mid: mid, peak: p.peak, crossed: crossed, S: tk.S, t: tk.t, gross: r2(pnl.gross), charges: pnl.charges, net: pnl.net, attr: attr };
    r.result.why = explain(r, r.result);
    r.bankroll = r2(p.bank0 + pnl.net);
    return r;
  }

  function maxLoss(buyPts, qty) { qty = qty || LOT; return r2(buyPts * qty + Market.netPnl({ buy: buyPts, intrinsic: 0, qty: qty }).charges); }

  var ROW = { direction: "NIFTY's direction", time: 'time decay', gamma: 'gamma (your delta changed as NIFTY moved)', costs: 'the bid/ask spread and charges' };
  function biggest(a) {
    var rows = { direction: a.direction, time: a.time, gamma: a.gamma, costs: -(a.spread + a.charges) }, k = 'direction';
    for (var x in rows) if (Math.abs(rows[x]) > Math.abs(rows[k])) k = x;
    return { key: k, value: rows[k] };
  }

  function explain(r, res) {
    var p = r.pos, ce = p.type === 'call', name = p.K + (ce ? ' CE' : ' PE'), f = Market.fmt, q = p.qty;
    var move = Math.round(res.S - r.path[p.i].S), dir = move === 0 ? 'was flat' : (move > 0 ? 'rose ' : 'fell ') + Math.abs(move) + ' points';
    var paid = f(p.buy * q), after = res.net > 0 ? ' After ' + f(res.charges) + ' charges you made ' + f(res.net) + '.' : ' After ' + f(res.charges) + ' charges you lost ' + f(-res.net) + '.';
    var b = biggest(res.attr), big = ' Biggest factor: ' + ROW[b.key] + ' (' + f(b.value) + ').';
    var rightWay = ce ? move > 0 : move < 0;
    if (res.how === 'lapsed')
      return 'NIFTY ' + dir + (rightWay ? ' but ' : ' and ') + (res.crossed || res.S === p.K ? 'closed ' + (res.S === p.K ? 'exactly at ' : 'on the wrong side of ') + p.K + ', so your ' + (ce ? 'CE' : 'PE') + ' had no intrinsic value left'
        : 'never ' + (ce ? 'reached ' : 'fell to ') + p.K + ', so your ' + (ce ? 'CE' : 'PE') + ' was all time value') + ' and it went from ' + paid + ' to ₹0 by 15:30.' + big;
    if (res.how === 'itm')
      return 'NIFTY closed at ' + res.S.toFixed(0) + ', ' + Math.abs(Math.round(res.S - p.K)) + ' points ' + (ce ? 'above' : 'below') + ' your ' + name +
        ' strike, so it settled at intrinsic value ' + f(res.exit * q) + ' (you paid ' + paid + '). All the time value was gone.' + after + big;
    var s = split(p.type, p.K, r.path[r.i], r.vix), s0 = split(p.type, p.K, r.path[p.i], r.vix);
    return 'While you held, NIFTY ' + dir + ' and time value ' + (s.time > s0.time ? 'rose' : 'fell') + ' from ' + f(s0.time * q) + ' to ' + f(s.time * q) + '. You sold your ' + name + ' at ' + Market.hhmm(res.t) + ' at the bid for ' + f(res.exit * q) + ' (paid ' + paid + ' at the ask); ' + f(s.time * q) + ' of its value was time value that would have melted by 15:30.' + after + big;
  }

  // history: [{buy, peak, net}] -> how many "looked like a winner" (highest bid >= 2x buy) vs actually won after charges, and the worst loss.
  function summary(history) {
    return {
      total: r2(history.reduce(function (a, h) { return a + h.net; }, 0)),
      looked: history.filter(function (h) { return h.buy && h.peak >= 2 * h.buy; }).length,
      won: history.filter(function (h) { return h.net > 0; }).length,
      worst: history.reduce(function (a, h) { return Math.min(a, h.net); }, 0)
    };
  }

  // Game state <-> string for localStorage. The price path is rebuilt from the seed, so it is not stored.
  function serialize(g) {
    var r = {}; for (var k in g.r) if (k !== 'path') r[k] = g.r[k];
    var o = {}; for (k in g) o[k] = k === 'r' ? r : g[k];
    return JSON.stringify(o);
  }
  function restore(s) {
    try {
      var g = JSON.parse(s);
      if (!g || !g.r || !isFinite(g.r.seed) || !isFinite(g.r.vix) || !isFinite(g.r.bankroll) || !Array.isArray(g.history)) return null;
      g.r.path = makePath(g.r.seed, g.r.vix);
      if (!(g.r.i >= 0 && g.r.i < g.r.path.length)) return null;
      return g;
    } catch (e) { return null; }
  }

  var Expiry = { LOT: LOT, ROUNDS: ROUNDS, START: START, PREV: PREV, EXPIRY: EXPIRY, T: T, premiumAt: premiumAt, intrinsic: intrinsic, split: split, greeksAt: greeksAt,
    newRound: newRound, tick: tick, strikes: strikes, moneyness: moneyness, quote: quote, cost: cost, buy: buy, advance: advance, sellNow: sellNow, maxLoss: maxLoss,
    biggest: biggest, explain: explain, summary: summary, serialize: serialize, restore: restore };
  if (node) module.exports = Expiry; else root.Expiry = Expiry;
})(this);
