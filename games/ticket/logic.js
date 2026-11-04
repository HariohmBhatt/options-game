// Pure game logic for "NIFTY Weekly". Plain script for the browser, also loadable in node for tests.
(function (root) {
  var Market = typeof module !== 'undefined' ? require('../../market.js') : root.Market;
  var IDX = Market.INDICES.NIFTY, LOT = IDX.lot, S0 = IDX.spot, ROUNDS = 5, START = 100000;
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
    return { seed: seed, path: Market.dailyPath({ S0: S0, days: DAYS, vix: Market.VIX, seed: seed }), day: 0, bankroll: bankroll, ticket: null, result: null };
  }
  function now(r) { return DATES[r.day]; }
  function price(r) { return r.path[r.day]; }
  function T(r) { return Market.yearsToExpiry(now(r), EXPIRY); }
  function daysLeft(r) { return Market.tradingDaysBetween(now(r), EXPIRY); }
  // Per-unit premium you could buy/sell at right now.
  function premium(r, type, K) { return Market.premium({ type: type, S: price(r), K: K, T: T(r) }); }
  function intrinsic(r) { var t = r.ticket; return r2(Math.max(0, t.type === 'call' ? price(r) - t.K : t.K - price(r))); }
  function value(r) { return premium(r, r.ticket.type, r.ticket.K); }

  function buy(r, type, K) {
    var p = premium(r, type, K);
    r.ticket = { type: type, K: K, premium: p, S: price(r), day: r.day };
    r.bankroll = r2(r.bankroll - p * LOT);
    return r;
  }
  function settle(r, how) {
    var t = r.ticket, exit = how === 'sold' ? value(r) : intrinsic(r);
    var pnl = how === 'sold' ? Market.netPnl({ buy: t.premium, sell: exit, qty: LOT }) : Market.netPnl({ buy: t.premium, intrinsic: exit, qty: LOT });
    r.bankroll = r2(r.bankroll + t.premium * LOT + pnl.net);
    r.result = { how: how === 'sold' ? 'sold' : exit > 0 ? 'auto' : 'lapsed', S: price(r), exit: exit, gross: pnl.gross, charges: pnl.charges, net: pnl.net };
    r.result.why = explain(t, r.result, r.day - t.day);
    return r;
  }
  function sell(r) { return settle(r, 'sold'); }
  function nextDay(r) {
    r.day++;
    if (r.day >= DAYS && r.ticket) settle(r, 'expiry');
    return r;
  }

  function pts(x) { return (x > 0 ? '+' : '') + Math.round(x); }
  function explain(t, res, days) {
    var call = t.type === 'call', n = label(t), S = Math.round(res.S), P = Market.fmt(t.premium * LOT);
    if (res.how === 'lapsed')
      return 'NIFTY ended at ' + S + ', ' + (call ? 'below' : 'above') + ' your ' + t.K + ' strike, so your ' + n + ' expired worthless. ' +
        'You lost the ' + P + ' premium plus ' + Market.fmt(res.charges) + ' charges and not a rupee more: you had the right to ' + (call ? 'buy' : 'sell') + ', never an obligation.';
    if (res.how === 'auto')
      return 'At 15:30 on expiry Tuesday NIFTY was at ' + S + ', so your ' + n + ' settled at its intrinsic value of ' + res.exit.toFixed(2) + ' points (' + Market.fmt(res.exit * LOT) + '). ' +
        (res.net >= 0 ? 'That beat the ' + P + ' premium and charges, so you made money.'
          : 'That was less than the ' + P + ' premium plus charges, so you still lost. To profit NIFTY had to finish ' + (call ? 'above ' : 'below ') + (call ? t.K + t.premium : t.K - t.premium).toFixed(0) + ' (strike ' + (call ? '+' : '−') + ' premium).');
    var move = res.S - t.S, from = t.premium.toFixed(2), to = res.exit.toFixed(2);
    var good = call === move > 0 && Math.abs(move) >= 1, bad = !good && Math.abs(move) >= 1;
    var moved = good || bad ? 'NIFTY moved ' + pts(move) + ' points' + (good ? ' your way' : ' against your ' + (call ? 'CE' : 'PE')) : 'NIFTY barely moved';
    if (days === 0) return 'You sold straight away at about the price you paid (' + from + ' → ' + to + '), so the loss is mostly the ' + Market.fmt(res.charges) + ' in charges.';
    var melt = days + ' day' + (days === 1 ? '' : 's') + ' of time value melted away';
    return res.exit < t.premium
      ? moved + (bad ? ', and ' : ', but ') + melt + (bad ? ' too' : '') + ', so your premium fell from ' + from + ' to ' + to + ' and you sold for less than you paid.'
      : moved + ', enough to beat the ' + melt.replace(' melted away', ' lost') + ', so your premium rose from ' + from + ' to ' + to +
        (res.net < 0 ? ', but not by enough to cover the ' + Market.fmt(res.charges) + ' in charges, so you still lost money.' : '.');
  }

  var Ticket = { DAYS: DAYS, ROUNDS: ROUNDS, START: START, LOT: LOT, S0: S0, STRIKES: STRIKES, DATES: DATES, EXPIRY: EXPIRY, label: label,
    newRound: newRound, now: now, price: price, T: T, daysLeft: daysLeft, premium: premium, intrinsic: intrinsic, value: value,
    buy: buy, sell: sell, nextDay: nextDay, explain: explain };
  if (typeof module !== 'undefined') module.exports = Ticket; else root.Ticket = Ticket;
})(this);
