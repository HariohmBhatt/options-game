// Pure game logic for "The Ticket". Plain script for the browser, also loadable in node for tests.
(function (root) {
  var Engine = typeof module !== 'undefined' ? require('../../engine.js') : root.Engine;
  var DAYS = 10, SIGMA = 0.4, S0 = 100, ROUNDS = 5, START = 1000, STRIKES = [95, 100, 105];

  function r2(x) { return Math.round(x * 100) / 100; }
  function premium(type, K) { return r2(Engine.price({ type: type, S: S0, K: K, T: DAYS / 252, sigma: SIGMA })); }
  function newRound(seed, bankroll) {
    return { seed: seed, path: Engine.pricePath({ S0: S0, sigma: SIGMA, days: DAYS, seed: seed }), day: 0, bankroll: bankroll, ticket: null, result: null };
  }
  function price(r) { return r.path[r.day]; }
  function intrinsic(r) { return r2(Engine.payoff(r.ticket.type, price(r), r.ticket.K)); }

  function buy(r, type, K) {
    var p = premium(type, K);
    r.ticket = { type: type, K: K, premium: p };
    r.bankroll = r2(r.bankroll - p);
    return r;
  }
  function settle(r, how) {
    var pay = intrinsic(r);
    r.bankroll = r2(r.bankroll + pay);
    r.result = { how: pay > 0 ? how : 'lapsed', S: price(r), payoff: pay, pnl: r2(pay - r.ticket.premium) };
    r.result.why = explain(r.ticket, r.result);
    return r;
  }
  // Use the ticket early. Caller should only offer this when intrinsic > 0.
  function exercise(r) { return settle(r, 'exercised'); }
  function nextDay(r) {
    r.day++;
    if (r.day >= DAYS) settle(r, 'auto');
    return r;
  }

  function explain(t, res) {
    var call = t.type === 'call', act = call ? 'buy' : 'sell', S = res.S.toFixed(2), P = t.premium.toFixed(2);
    if (res.how === 'lapsed')
      return 'The price ended at ' + S + ', ' + (call ? 'below' : 'above') + ' your strike of ' + t.K +
        ', so the right to ' + act + ' at ' + t.K + ' was worthless. You let it expire and your loss was capped at the ' + P + ' premium.';
    var used = res.how === 'auto' ? 'At expiry your ticket was in the money, so it was used automatically: ' : 'You used your ticket: ';
    used += 'you could ' + act + ' at ' + t.K + ' while the stock was at ' + S + ', worth ' + res.payoff.toFixed(2) + '. ';
    var be = (call ? t.K + t.premium : t.K - t.premium).toFixed(2);
    return used + (res.pnl >= 0
      ? 'That beat the ' + P + ' premium you paid, so you made money.'
      : 'That was less than the ' + P + ' premium, so you still lost a little. To profit the price had to get ' + (call ? 'above ' : 'below ') + be + ' (strike ' + (call ? '+' : '-') + ' premium).');
  }

  var Ticket = { DAYS: DAYS, ROUNDS: ROUNDS, START: START, STRIKES: STRIKES, premium: premium, newRound: newRound,
    price: price, intrinsic: intrinsic, buy: buy, exercise: exercise, nextDay: nextDay, explain: explain };
  if (typeof module !== 'undefined') module.exports = Ticket; else root.Ticket = Ticket;
})(this);
