// Pure game logic for "Seller's Week". Plain script for the browser, also loadable in node for tests.
(function (root) {
  var Market = typeof module !== 'undefined' ? require('../../market.js') : root.Market;
  var IDX = Market.INDICES.NIFTY, LOT = IDX.lot, S0 = IDX.spot, ROUNDS = 5, START = 200000, DAYS = 4;
  var START_AT = new Date(2026, 10, 4, 9, 15);           // Wed 4 Nov 2026, market open
  var EXPIRY = Market.nextExpiry('NIFTY', START_AT);       // Tue 10 Nov
  var DATES = [START_AT, new Date(2026, 10, 5, 9, 15), new Date(2026, 10, 6, 9, 15), new Date(2026, 10, 9, 9, 15), new Date(2026, 10, 10, 15, 30)];
  var STRIKES = Market.strikes('NIFTY', S0, 4);
  var GAP = { day: 3, move: -0.032, vix: 1.6 };            // Monday open
  var MARGIN = Market.shortMargin({ index: 'NIFTY', S: S0 });

  function r2(x) { return Math.round(x * 100) / 100; }
  function mode(no) { return no <= 3 ? 'naked' : 'spread'; }
  function isGap(no) { return no === 3 || no === 5; }

  function newRound(no, seed, bankroll) {
    var p = Market.simulate({ S0: S0, days: DAYS, vix: Market.VIX, seed: seed });
    if (isGap(no)) gapDay(p);
    return { no: no, seed: seed, mode: mode(no), gap: isGap(no), path: p, day: 0, bankroll: bankroll, pos: null, result: null, steps: [] };
  }
  // Force Monday to open 3.2% lower with VIX 1.6x; Tuesday keeps its simulated move from there.
  function gapDay(p) {
    var d = GAP.day, sRet = p.S[d + 1] / p.S[d], vRet = p.vix[d + 1] / p.vix[d];
    p.S[d] = r2(p.S[d - 1] * (1 + GAP.move)); p.vix[d] = r2(p.vix[d - 1] * GAP.vix);
    p.S[d + 1] = r2(p.S[d] * sRet); p.vix[d + 1] = r2(p.vix[d] * vRet);
    return p;
  }
  function gapPoints(r) { return Math.round(r.path.S[GAP.day - 1] * -GAP.move / 10) * 10; }

  function S(r) { return r.path.S[r.day]; }
  function vix(r) { return r.path.vix[r.day]; }
  function T(r, day) { return Market.yearsToExpiry(DATES[day == null ? r.day : day], EXPIRY); }
  function mid(r, type, K, day) { day = day == null ? r.day : day; return Market.premium({ type: type, S: r.path.S[day], K: K, T: T(r, day), vix: r.path.vix[day] }); }
  function bid(r, type, K) { return Market.fill({ premium: mid(r, type, K), side: 'sell' }); }
  function ask(r, type, K) { return Market.fill({ premium: mid(r, type, K), side: 'buy' }); }
  function longK(type, K, width) { return type === 'call' ? K + width : K - width; }

  // Legs: q = -1 sold, +1 bought. px = entry price per unit.
  function quote(r, type, K, width) {
    var legs = [{ K: K, q: -1, px: bid(r, type, K) }];
    if (width) legs.push({ K: longK(type, K, width), q: 1, px: ask(r, type, longK(type, K, width)) });
    var credit = r2(legs.reduce(function (a, l) { return a - l.q * l.px; }, 0));
    var entryC = r2(legs.reduce(function (a, l) { return a + Market.charges({ side: l.q < 0 ? 'sell' : 'buy', premium: l.px, qty: LOT }).total; }, 0));
    var margin = width ? Market.spreadMargin({ index: 'NIFTY', width: width, credit: credit }) : MARGIN;
    return { type: type, K: K, width: width || 0, legs: legs, credit: credit, received: r2(credit * LOT), entryC: entryC, margin: margin,
      maxLoss: width ? r2((width - credit) * LOT) : Infinity, S: S(r), day: r.day };
  }
  function open(r, type, K, width) { r.pos = quote(r, type, K, r.mode === 'spread' ? width : 0); return r; }

  // Price to close each leg now: buy back the short at the ask, sell the long at the bid.
  function exitPx(r, pos, l) {
    var m = mid(r, pos.type, l.K);
    return Market.fill({ premium: m, side: l.q < 0 ? 'buy' : 'sell' });
  }
  function intrinsic(type, S, K) { return r2(Math.max(0, type === 'call' ? S - K : K - S)); }
  function mtm(r, pos) { pos = pos || r.pos; return r2(pos.legs.reduce(function (a, l) { return a + l.q * (exitPx(r, pos, l) - l.px) * LOT; }, 0)); }
  // Position Greeks per lot (sold legs flip the sign): delta ₹ per NIFTY point, theta ₹ per day, vega ₹ per VIX point.
  function greeks(r, pos, day) {
    pos = pos || r.pos; day = day == null ? r.day : day;
    var o = { delta: 0, gamma: 0, theta: 0, vega: 0 };
    pos.legs.forEach(function (l) {
      var g = Market.greeks({ type: pos.type, S: r.path.S[day], K: l.K, T: T(r, day), vix: r.path.vix[day] });
      o.delta += l.q * g.delta * LOT; o.gamma += l.q * g.gamma * LOT; o.theta += l.q * g.theta * LOT; o.vega += l.q * g.vega * LOT;
    });
    return o;
  }

  // Close or settle. how: 'bought back' | 'expiry'.
  function outcome(r, pos, how) {
    var expiry = how === 'expiry', s = S(r), exitC = 0, gross = 0;
    var legs = pos.legs.map(function (l) {
      var px = expiry ? intrinsic(pos.type, s, l.K) : exitPx(r, pos, l);
      gross += l.q * (px - l.px) * LOT;
      if (!expiry) exitC += Market.charges({ side: l.q < 0 ? 'buy' : 'sell', premium: px, qty: LOT }).total;
      else if (l.q > 0 && px > 0) exitC += px * LOT * Market.RATES.sttExercise; // the bought leg pays STT on exercise; the seller pays none
      return { K: l.K, q: l.q, px: px };
    });
    gross = r2(gross); exitC = r2(exitC);
    var charges = r2(pos.entryC + exitC), net = r2(gross - charges);
    var paid = r2(legs.reduce(function (a, l) { return a + l.q * l.px * LOT; }, 0) * -1); // cost to close (positive = you paid)
    return { how: how, S: s, legs: legs, gross: gross, entryC: pos.entryC, exitC: exitC, charges: charges, net: net, paid: paid,
      rom: r2(net / pos.margin * 100), days: r.day - pos.day };
  }

  // Greeks-based attribution from entry day to now; residual makes it add up to gross exactly.
  function attribution(r, pos, gross) {
    var a = { direction: 0, time: 0, vol: 0 };
    for (var d = pos.day + 1; d <= r.day; d++) {
      var g = greeks(r, pos, d - 1), days = (T(r, d - 1) - T(r, d)) * 252;
      var dS = r.path.S[d] - r.path.S[d - 1];
      a.direction += g.delta * dS + 0.5 * g.gamma * dS * dS; // gamma term: a big gap hurts a seller faster than delta alone says
      a.time += g.theta * days;
      a.vol += g.vega * (r.path.vix[d] - r.path.vix[d - 1]);
    }
    a.direction = r2(a.direction); a.time = r2(a.time); a.vol = r2(a.vol);
    a.residual = r2(gross - a.direction - a.time - a.vol);
    return a;
  }

  function settle(r, how) {
    var pos = r.pos, res = outcome(r, pos, how);
    res.attr = attribution(r, pos, res.gross);
    if (pos.width) res.naked = outcome(r, { type: pos.type, legs: [pos.legs[0]], entryC: Market.charges({ side: 'sell', premium: pos.legs[0].px, qty: LOT }).total, margin: MARGIN, day: pos.day }, how);
    res.why = explain(r, pos, res);
    r.bankroll = r2(r.bankroll + res.net);
    r.result = res;
    return r;
  }
  function buyBack(r) { return settle(r, 'bought back'); }
  function nextDay(r) {
    if (r.result) return r;
    r.day++;
    if (r.day >= DAYS && r.pos) settle(r, 'expiry');
    return r;
  }

  function fmt(x) { return Market.fmt(x).replace('-', '\u2212'); } // true minus: the line never breaks between sign and number
  function pct(x) { return (Math.round(x * 10) / 10).toFixed(1) + '%'; }
  function name(type, K) { return K + (type === 'call' ? ' CE' : ' PE'); }
  function explain(r, pos, res) {
    var a = res.attr, call = pos.type === 'call', move = Math.round(res.S - pos.S);
    var drivers = [['time', a.time], ['direction', a.direction], ['vol', a.vol]].sort(function (x, y) { return Math.abs(y[1]) - Math.abs(x[1]); });
    var top = drivers[0], says = {
      time: 'time passed: ' + (res.days || 0) + ' day' + (res.days === 1 ? '' : 's') + ' of time value melted, which a seller keeps (' + fmt(a.time) + ')',
      direction: 'NIFTY moved ' + (move > 0 ? '+' : '') + move + ' points, ' + ((call ? move < 0 : move > 0) ? 'away from' : 'towards') + ' your sold ' + (call ? 'CE' : 'PE') + ' (' + fmt(a.direction) + ')',
      vol: 'India VIX went from ' + r.path.vix[pos.day].toFixed(1) + ' to ' + r.path.vix[r.day].toFixed(1) + ', and a seller loses when it rises (' + fmt(a.vol) + ')' };
    var s = res.days === 0 ? 'You closed straight away, so you paid the bid/ask spread and charges (' + fmt(res.charges) + ').'
      : 'The biggest driver: ' + says[top[0]] + '.';
    if (res.how === 'expiry') s += res.paid > 0 ? ' At expiry NIFTY was at ' + Math.round(res.S) + ', so you paid ' + fmt(res.paid) + ' in cash settlement (no STT on the seller).'
      : ' The option expired worthless at ' + Math.round(res.S) + ', so you kept the full ' + fmt(pos.received) + ' premium.';
    if (r.gap) s += ' The most a seller can make is the premium (' + fmt(pos.received) + '); on a gap day the loss can be many times that' +
      (pos.width ? ', unless the bought leg caps it, as here at ' + fmt(pos.maxLoss) + ' before charges.' : '.');
    if (pos.width && res.naked) s += ' Naked vs hedged: premium ' + fmt(pos.legs[0].px * LOT) + ' vs ' + fmt(pos.received) +
      ', margin ' + fmt(MARGIN) + ' vs ' + fmt(pos.margin) + ', max loss unlimited vs ' + fmt(pos.maxLoss) +
      ', net ' + fmt(res.naked.net) + ' vs ' + fmt(res.net) + ', return on margin ' + pct(res.naked.rom) + ' vs ' + pct(res.rom) + '.';
    return s;
  }

  function newGame(bankroll, salt) {
    var g = { roundNo: 1, salt: salt == null ? Date.now() % 100000 : salt, history: [], pick: { type: 'put', K: S0, width: 100 } };
    g.r = newRound(1, g.salt + 1000, bankroll); return g;
  }
  function nextRound(g) { g.roundNo++; g.r = newRound(g.roundNo, g.salt + g.roundNo * 1000, g.r.bankroll); return g; }
  function record(g) {
    var r = g.r;
    if (r.result && !g.history[r.no - 1]) g.history[r.no - 1] = { label: name(r.pos.type, r.pos.K) + (r.pos.width ? ' / ' + name(r.pos.type, r.pos.legs[1].K) : ''),
      mode: r.mode, received: r.pos.received, margin: r.pos.margin, net: r.result.net };
    return g;
  }
  function summary(g) {
    var h = g.history.filter(Boolean);
    return { total: r2(h.reduce(function (a, x) { return a + x.net; }, 0)),
      worst: h.reduce(function (a, x) { return Math.min(a, x.net); }, 0),
      maxMargin: h.reduce(function (a, x) { return Math.max(a, x.margin); }, 0),
      collected: r2(h.reduce(function (a, x) { return a + x.received; }, 0)),
      lost: r2(h.reduce(function (a, x) { return a + Math.min(0, x.net); }, 0) * -1) };
  }
  function serialize(g) { return JSON.stringify(g); }
  function restore(s) {
    try { var g = JSON.parse(s); return g && g.r && g.r.path && Array.isArray(g.r.path.S) && g.roundNo >= 1 && g.roundNo <= ROUNDS ? g : null; } catch (e) { return null; }
  }

  var Seller = { LOT: LOT, S0: S0, ROUNDS: ROUNDS, START: START, DAYS: DAYS, DATES: DATES, EXPIRY: EXPIRY, STRIKES: STRIKES, GAP: GAP, MARGIN: MARGIN,
    mode: mode, isGap: isGap, newRound: newRound, gapDay: gapDay, gapPoints: gapPoints, S: S, vix: vix, mid: mid, bid: bid, ask: ask, longK: longK,
    quote: quote, open: open, exitPx: exitPx, mtm: mtm, greeks: greeks, outcome: outcome, attribution: attribution, buyBack: buyBack, nextDay: nextDay,
    name: name, newGame: newGame, nextRound: nextRound, record: record, summary: summary, serialize: serialize, restore: restore };
  if (typeof module !== 'undefined') module.exports = Seller; else root.Seller = Seller;
})(this);
