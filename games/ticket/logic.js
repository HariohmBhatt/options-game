// Pure game logic for "NIFTY Weekly". Plain script for the browser, also loadable in node for tests.
(function (root) {
  var Market = typeof module !== 'undefined' ? require('../../market.js') : root.Market;
  var IDX = Market.INDICES.NIFTY, LOT = IDX.lot, S0 = IDX.spot, ROUNDS = 5, START = 100000, LOTS = [1, 2, 3];
  var START_AT = new Date(2026, 10, 4, 9, 15); // Wed 4 Nov 2026, market open
  var EXPIRY = Market.nextExpiry('NIFTY', START_AT); // Tue 10 Nov
  var DAYS = Market.tradingDaysBetween(START_AT, EXPIRY); // 4: Thu, Fri, Mon, Tue
  var STRIKES = Market.strikes('NIFTY', S0, 1);

  // Snapshot times: Wed 9:15, then each later trading day at 9:15, the last one is expiry Tue 15:30.
  var DATES = [START_AT];
  (function () {
    var d = new Date(START_AT);
    while (DATES.length <= DAYS) {
      d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9, 15);
      if (d.getDay() !== 0 && d.getDay() !== 6) DATES.push(d);
    }
    DATES[DAYS] = new Date(EXPIRY.getFullYear(), EXPIRY.getMonth(), EXPIRY.getDate(), 15, 30);
  })();

  function r2(x) { return Math.round(x * 100) / 100; }
  function label(t) { return t.K + (t.type === 'call' ? ' CE' : ' PE'); }
  function newRound(seed, bankroll) {
    var sim = Market.simulate({ S0: S0, days: DAYS, vix: Market.VIX, seed: seed });
    return { seed: seed, path: sim.S, vix: sim.vix, day: 0, bankroll: bankroll, ticket: null, result: null };
  }
  function now(r) { return DATES[r.day]; }
  function price(r) { return r.path[r.day]; }
  function vix(r) { return r.vix[r.day]; }
  function T(r) { return Market.yearsToExpiry(now(r), EXPIRY); }
  function daysLeft(r) { return Market.tradingDaysBetween(now(r), EXPIRY); }
  function opt(r, type, K) { return { type: type, S: price(r), K: K, T: T(r), vix: vix(r) }; }
  // Per-unit mid premium right now, at today's VIX (skew is inside Market.premium).
  function premium(r, type, K) { return Market.premium(opt(r, type, K)); }
  function ask(r, type, K) { return Market.fill({ premium: premium(r, type, K), side: 'buy' }); }
  function intrinsic(r) { var t = r.ticket; return r2(Math.max(0, t.type === 'call' ? price(r) - t.K : t.K - price(r))); }
  function value(r) { return premium(r, r.ticket.type, r.ticket.K); }
  function bid(r) { return Market.fill({ premium: value(r), side: 'sell' }); }
  // Whole-position Greeks in rupees: delta per NIFTY point, theta per trading day, vega per VIX point.
  function greeks(r) {
    var t = r.ticket, g = Market.greeks(opt(r, t.type, t.K));
    return { delta: g.delta * t.qty, theta: g.theta * t.qty, vega: g.vega * t.qty };
  }

  // Everything the buy screen needs for one choice.
  function quote(r, type, K, lots) {
    var qty = (lots || 1) * LOT, mid = premium(r, type, K), a = Market.fill({ premium: mid, side: 'buy' });
    var buyC = Market.charges({ side: 'buy', premium: a, qty: qty }).total;
    var settleStt = a * qty * Market.RATES.sttExercise; // STT on intrinsic at break-even (intrinsic ≈ ask)
    var maxLoss = r2(a * qty + buyC), be = (a + (buyC + settleStt) / qty) * (type === 'call' ? 1 : -1);
    return { qty: qty, mid: mid, ask: a, cost: r2(a * qty), charges: buyC, maxLoss: maxLoss, pct: maxLoss / r.bankroll * 100,
      ok: r.bankroll >= maxLoss, breakeven: Math.round(K + be) };
  }

  function buy(r, type, K, lots) {
    var q = quote(r, type, K, lots);
    if (!q.ok || r.ticket) return r;
    r.ticket = { type: type, K: K, lots: lots || 1, qty: q.qty, mid: q.mid, premium: q.ask, S: price(r), vix: vix(r), day: r.day,
      attr: { direction: 0, time: 0, vol: 0 } };
    r.bankroll = r2(r.bankroll - q.ask * q.qty);
    return r;
  }
  function settle(r, how) {
    var t = r.ticket, sold = how === 'sold', mid = sold ? value(r) : intrinsic(r), exit = sold ? bid(r) : mid;
    var pnl = sold ? Market.netPnl({ buy: t.premium, sell: exit, qty: t.qty }) : Market.netPnl({ buy: t.premium, intrinsic: exit, qty: t.qty });
    var a = t.attr, midGross = (mid - t.mid) * t.qty, spread = r2((t.premium - t.mid + mid - exit) * t.qty);
    r.bankroll = r2(r.bankroll + t.premium * t.qty + pnl.net);
    r.result = { how: sold ? 'sold' : exit > 0 ? 'auto' : 'lapsed', S: price(r), exit: exit, gross: pnl.gross, charges: pnl.charges, net: pnl.net,
      rows: { direction: r2(a.direction), time: r2(a.time), vol: r2(a.vol), other: r2(midGross - a.direction - a.time - a.vol), costs: -r2(spread + pnl.charges) },
      spread: spread };
    r.result.why = explain(t, r.result, r.day - t.day);
    return r;
  }
  function sell(r) { return r.ticket && !r.result ? settle(r, 'sold') : r; }
  function nextDay(r) {
    if (r.result || r.day >= DAYS) return r;
    var t = r.ticket, g, S1 = price(r), V1 = vix(r), T1 = T(r);
    if (t) g = Market.greeks(opt(r, t.type, t.K));
    r.day++;
    if (t) { // attribution with yesterday's Greeks; the Mon → Tue 15:30 step is 2 trading days of time
      t.attr.direction += g.delta * (price(r) - S1) * t.qty;
      t.attr.time += g.theta * t.qty * Math.round((T1 - T(r)) * 252);
      t.attr.vol += g.vega * (vix(r) - V1) * t.qty;
    }
    if (r.day >= DAYS && t) settle(r, 'expiry');
    return r;
  }

  function fm(x) { return Market.fmt(x).replace('-', '\u2212\u2060'); } // minus that never wraps away from ₹
  function pts(x) { return (x > 0 ? '+' : '') + Math.round(x); }
  var NAMES = { direction: "NIFTY's move", time: 'time passing', vol: 'the VIX change', other: 'the Greeks shifting as NIFTY, time and VIX moved', costs: 'the spread and charges' };
  // "Most of this loss was time passing (−₹2,600); NIFTY's move only cost ₹400."
  function biggest(res) {
    var rows = res.rows, keys = Object.keys(NAMES), sign = res.net < 0 ? -1 : 1;
    var same = keys.filter(function (k) { return rows[k] * sign > 0; });
    var k = (same.length ? same : keys).reduce(function (a, b) { return Math.abs(rows[b]) > Math.abs(rows[a]) ? b : a; });
    var s = 'Most of this ' + (sign < 0 ? 'loss' : 'gain') + ' was ' + NAMES[k] + ' (' + fm(rows[k]) + ')';
    var d = rows.direction;
    if (k !== 'direction') s += "; NIFTY's move only " + (d < 0 ? 'cost ' : 'added ') + fm(Math.abs(d));
    else if (k !== 'time') s += '; time passing ' + (rows.time < 0 ? 'cost ' : 'added ') + fm(Math.abs(rows.time));
    return s + '. ';
  }
  function explain(t, res, days) {
    var call = t.type === 'call', n = label(t), S = Math.round(res.S), P = fm(t.premium * t.qty), lead = days > 0 ? biggest(res) : '';
    if (res.how === 'lapsed')
      return lead + 'NIFTY ended at ' + S + ', ' + (call ? 'below' : 'above') + ' your ' + t.K + ' strike, so your ' + n + ' expired worthless. ' +
        'You lost the ' + P + ' premium plus ' + fm(res.charges) + ' charges and not a rupee more: you had the right to ' + (call ? 'buy' : 'sell') + ', never an obligation.';
    if (res.how === 'auto')
      return lead + 'At 15:30 on expiry Tuesday NIFTY was at ' + S + ', so your ' + n + ' settled at its intrinsic value of ' + res.exit.toFixed(2) + ' points (' + fm(res.exit * t.qty) + '). ' +
        (res.net >= 0 ? 'That beat the ' + P + ' premium and charges, so you made money.'
          : 'That was less than the ' + P + ' premium plus charges, so you still lost. To profit NIFTY had to finish ' + (call ? 'above ' : 'below ') + (call ? t.K + t.premium : t.K - t.premium).toFixed(0) + ' (strike ' + (call ? '+' : '−') + ' premium).');
    var move = res.S - t.S, from = t.premium.toFixed(2), to = res.exit.toFixed(2);
    var good = call === move > 0 && Math.abs(move) >= 1, bad = !good && Math.abs(move) >= 1;
    var moved = good || bad ? 'NIFTY moved ' + pts(move) + ' points' + (good ? ' your way' : ' against your ' + (call ? 'CE' : 'PE')) : 'NIFTY barely moved';
    if (days === 0) return 'You bought at the ask (' + from + ') and sold straight away at the bid (' + to + '), so the loss is the ' + fm(res.spread) + ' spread plus ' + fm(res.charges) + ' in charges.';
    var melt = days + ' day' + (days === 1 ? '' : 's') + ' of time value melted away';
    return lead + (res.exit < t.premium
      ? moved + (bad ? ', and ' : ', but ') + melt + (bad ? ' too' : '') + ', so the price fell from ' + from + ' (ask) to ' + to + ' (bid) and you sold for less than you paid.'
      : moved + (res.rows.direction + res.rows.time >= 0 ? ', enough to beat the ' + melt.replace(' melted away', ' lost')
        : ', not enough on its own to beat the ' + melt.replace(' melted away', ' lost') + '; ' + (res.rows.vol >= res.rows.other ? 'the VIX rise' : 'the Greeks shifting') + ' made up the rest') + ', so the price rose from ' + from + ' (ask) to ' + to + ' (bid)' +
        (res.net < 0 ? ', but not by enough to cover the ' + fm(res.charges) + ' in charges, so you still lost money.' : '.'));
  }

  // Whole game state <-> string for localStorage. restore returns null for anything that is not a valid saved game.
  function serialize(g) { return JSON.stringify({ v: 2, g: g }); }
  function restore(s) {
    try {
      var o = JSON.parse(s), g = o && o.v === 2 && o.g, r = g && g.r;
      if (!r || !(g.roundNo >= 1 && g.roundNo <= ROUNDS) || LOTS.indexOf(g.lots) < 0 || !Array.isArray(g.history) || !g.pick) return null;
      if (!Array.isArray(r.path) || r.path.length !== DAYS + 1 || !Array.isArray(r.vix) || r.vix.length !== DAYS + 1) return null;
      if (!isFinite(r.bankroll) || !(r.day >= 0 && r.day <= DAYS)) return null;
      return g;
    } catch (e) { return null; }
  }

  var Ticket = { DAYS: DAYS, ROUNDS: ROUNDS, START: START, LOT: LOT, LOTS: LOTS, S0: S0, STRIKES: STRIKES, DATES: DATES, EXPIRY: EXPIRY, label: label,
    newRound: newRound, now: now, price: price, vix: vix, T: T, daysLeft: daysLeft, premium: premium, ask: ask, bid: bid, intrinsic: intrinsic, value: value,
    greeks: greeks, quote: quote, buy: buy, sell: sell, nextDay: nextDay, explain: explain, serialize: serialize, restore: restore };
  if (typeof module !== 'undefined') module.exports = Ticket; else root.Ticket = Ticket;
})(this);
