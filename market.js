// Indian market model shared by all games: NSE index contracts, expiry calendar, volatility, fills, charges,
// margin and realistic price paths. Plain script (browser) + node module (tests). Depends on engine.js.
(function (root) {
  var Engine = typeof module !== 'undefined' ? require('./engine.js') : root.Engine;

  // Contract specs as of Jan 2026 series (NSE circular Nov 2025). Spot levels are typical, not live.
  var INDICES = {
    NIFTY: { name: 'NIFTY 50', spot: 24000, step: 50, lot: 65, expiry: 'weekly' },
    BANKNIFTY: { name: 'BANK NIFTY', spot: 54000, step: 100, lot: 30, expiry: 'monthly' }
  };
  var VIX = 14;               // India VIX, annualised % implied vol of the ATM NIFTY option.
  var TRADING_DAYS = 252;
  var OPEN = 9 * 60 + 15, CLOSE = 15 * 60 + 30; // minutes from midnight, IST
  var SESSION = CLOSE - OPEN; // 375 minutes

  // ---------- Contracts and calendar ----------
  function atm(index, spot) { var st = INDICES[index].step; return Math.round(spot / st) * st; }
  // n strikes each side of ATM.
  function strikes(index, spot, n) {
    var st = INDICES[index].step, a = atm(index, spot), out = [];
    for (var i = -n; i <= n; i++) out.push(a + i * st);
    return out;
  }

  // ponytail: NSE holidays ignored; a holiday Tuesday really moves expiry to the previous trading day.
  function nextExpiry(index, from) {
    var d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    var afterClose = from.getHours() * 60 + from.getMinutes() >= CLOSE;
    if (INDICES[index].expiry === 'weekly') {
      var add = (2 - d.getDay() + 7) % 7;           // 2 = Tuesday
      if (add === 0 && afterClose) add = 7;
      d.setDate(d.getDate() + add);
      return d;
    }
    for (var m = 0; m < 2; m++) {                    // last Tuesday of this month, else next month
      var last = new Date(d.getFullYear(), d.getMonth() + m + 1, 0);
      last.setDate(last.getDate() - ((last.getDay() - 2 + 7) % 7));
      if (last > d || (last.getTime() === d.getTime() && !afterClose)) return last;
    }
  }
  function isTradingDay(d) { return d.getDay() !== 0 && d.getDay() !== 6; }
  // Weekdays strictly after `from` up to and including `to`.
  function tradingDaysBetween(from, to) {
    var n = 0, d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    while (d < to) { d.setDate(d.getDate() + 1); if (isTradingDay(d) && d <= to) n++; }
    return n;
  }
  // Time to expiry in years, counting whole trading days plus the fraction of today's session left.
  function yearsToExpiry(from, expiry) {
    var mins = from.getHours() * 60 + from.getMinutes();
    var todayLeft = isTradingDay(from) ? Math.max(0, Math.min(1, (CLOSE - mins) / SESSION)) : 0; // no session on Sat/Sun
    return (tradingDaysBetween(from, expiry) + todayLeft) / TRADING_DAYS;
  }

  // ---------- Volatility and pricing ----------
  // Implied vol for one strike. VIX is the at-the-money level; out-of-the-money puts trade at a higher IV than
  // out-of-the-money calls (index skew). x = log-moneyness in standard deviations.
  // ponytail: fixed skew shape; real skew steepens in sell-offs and differs by expiry.
  function iv(o) { // {S, K, T, vix?}
    var a = (o.vix || VIX) / 100;
    if (!(o.T > 0)) return a;
    var x = Math.log(o.K / o.S) / (a * Math.sqrt(o.T));
    x = Math.max(-3, Math.min(3, x));
    return a * (1 - 0.10 * x + 0.04 * x * x);
  }
  // Fair (mid) premium per unit at the strike's IV, ticked to 0.05. Never below one tick while the option is alive.
  function premium(o) { // {type, S, K, T, vix?}
    var p = Math.round(Engine.price({ type: o.type, S: o.S, K: o.K, T: o.T, sigma: iv(o) }) * 20) / 20;
    return o.T > 0 ? Math.max(0.05, p) : p;
  }
  // Greeks per unit at the strike's IV: delta per point, gamma per point², theta per trading day, vega per 1 VIX point.
  function greeks(o) { return Engine.greeks({ type: o.type, S: o.S, K: o.K, T: o.T, sigma: iv(o) }); }

  // ---------- Fills ----------
  // You buy at the ask and sell at the bid. Spread is one tick on cheap options and about 0.2% on dear ones.
  function fill(o) { // {premium (mid), side:'buy'|'sell'}
    var spread = Math.max(0.05, Math.ceil(o.premium * 0.002 / 0.05) * 0.05);
    // round away from the mid so the bid is always below it and the ask above, even on cheap options
    var p = o.side === 'buy' ? Math.ceil((o.premium + spread / 2) * 20 - 1e-9) : Math.floor((o.premium - spread / 2) * 20 + 1e-9);
    return Math.max(0.05, p / 20);
  }

  // ---------- Charges ----------
  // Statutory + broker charges for ONE order. turnover = premium * qty. Rates from April 2026.
  // o: {side:'buy'|'sell', premium, qty, exercised?: intrinsic per unit when the buyer lets it settle ITM}
  var RATES = { brokerage: 20, sttSell: 0.0015, sttExercise: 0.0015, exchange: 0.00035, sebi: 0.000001, stamp: 0.00003, gst: 0.18 };
  function charges(o) {
    var turnover = o.premium * o.qty, c = {};
    c.brokerage = RATES.brokerage;
    c.stt = o.side === 'sell' ? turnover * RATES.sttSell : o.exercised ? o.exercised * o.qty * RATES.sttExercise : 0;
    c.exchange = turnover * RATES.exchange;
    c.sebi = turnover * RATES.sebi;
    c.stamp = o.side === 'buy' ? turnover * RATES.stamp : 0;
    c.gst = (c.brokerage + c.exchange + c.sebi) * RATES.gst;
    c.total = Math.round((c.brokerage + c.stt + c.exchange + c.sebi + c.stamp + c.gst) * 100) / 100;
    return c;
  }
  // Round trip for a BUYER: buy at p1, sell at p2 (or settled at intrinsic). Net P/L in rupees after charges.
  function netPnl(o) { // {buy, sell?, intrinsic?, qty}
    var inC = charges({ side: 'buy', premium: o.buy, qty: o.qty });
    var out = o.sell != null ? charges({ side: 'sell', premium: o.sell, qty: o.qty })
      : charges({ side: 'buy', premium: 0, qty: o.qty, exercised: o.intrinsic }); // settlement: STT on intrinsic, no brokerage
    if (o.sell == null) out.total -= out.brokerage + out.gst, out.brokerage = 0, out.gst = 0;
    var gross = ((o.sell != null ? o.sell : o.intrinsic) - o.buy) * o.qty;
    return { gross: gross, charges: Math.round((inC.total + out.total) * 100) / 100, net: Math.round((gross - inC.total - out.total) * 100) / 100 };
  }

  // ---------- Margin (sellers) ----------
  // Rupees blocked for a naked short option, about 8% of notional.
  // ponytail: real SPAN + exposure margin varies with strike and VIX (₹1.1–1.5 lakh per NIFTY lot in 2026).
  function shortMargin(o) { // {index, S, lots?}
    return Math.round(0.08 * o.S * INDICES[o.index].lot * (o.lots || 1));
  }
  // A defined-risk spread blocks roughly its maximum loss plus 10%.
  function spreadMargin(o) { // {index, width (points between strikes), credit (net premium received per unit), lots?}
    return Math.round((o.width - o.credit) * INDICES[o.index].lot * (o.lots || 1) * 1.1);
  }

  // ---------- Simulation ----------
  // Fat-tailed standard normal substitute: Student-t (df 4) scaled to unit variance. Index returns have fat tails.
  function fatZ(rand) {
    var u1 = Math.max(rand(), 1e-12), u2 = rand();
    var z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    var chi = 0; for (var i = 0; i < 4; i++) { var a = Math.max(rand(), 1e-12), b = rand(); var g = Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); chi += g * g; }
    return z / Math.sqrt(chi / 4) * Math.sqrt(0.5); // t4 has variance 2
  }
  // Daily closes plus a VIX path. Each day's move is drawn at that day's VIX; VIX mean-reverts to its starting level,
  // jumps when the index falls and eases when it rises (the leverage effect), which gives volatility clustering.
  // Returns {S: [...], vix: [...]}, both of length days + 1.
  function simulate(o) { // {S0, days, vix?, seed}
    var rand = Engine.rng(o.seed == null ? Date.now() : o.seed), v0 = o.vix || VIX;
    var S = o.S0, V = v0, Ss = [S], Vs = [V];
    for (var i = 0; i < o.days; i++) {
      var sig = V / 100 / Math.sqrt(TRADING_DAYS), r = -0.5 * sig * sig + sig * fatZ(rand);
      S = S * Math.exp(r);
      V = V + 0.05 * (v0 - V) - 6 * r * V + 0.04 * V * fatZ(rand);
      V = Math.max(8, Math.min(60, V));
      Ss.push(Math.round(S * 100) / 100); Vs.push(Math.round(V * 100) / 100);
    }
    return { S: Ss, vix: Vs };
  }
  function dailyPath(o) { return simulate(o).S; }
  // One session of ticks from 9:15 to 15:30. Opens with an overnight gap, vol is U-shaped (busy open and close).
  // Gap carries 36% of the day's variance and the session the other 64%. Returns [{t: minutesFromMidnight, S}].
  var U_RMS = Math.sqrt(1 + 1.6 / 3 + 0.64 / 5); // root-mean-square of the U multiplier below, so the session variance is exact
  function intradayPath(o) { // {prevClose, vix?, seed, stepMin?}
    var rand = Engine.rng(o.seed == null ? Date.now() : o.seed), step = o.stepMin || 5;
    var daySig = (o.vix || VIX) / 100 / Math.sqrt(TRADING_DAYS);
    var S = o.prevClose * Math.exp(daySig * 0.6 * fatZ(rand));
    var out = [{ t: OPEN, S: Math.round(S * 100) / 100 }];
    for (var t = OPEN + step; t <= CLOSE; t += step) {
      var frac = (t - OPEN) / SESSION, u = (1 + 0.8 * Math.pow(2 * frac - 1, 2)) / U_RMS;
      var sig = daySig * 0.8 * Math.sqrt(step / SESSION) * u;
      S = S * Math.exp(sig * fatZ(rand));
      out.push({ t: t, S: Math.round(S * 100) / 100 });
    }
    return out;
  }

  // ---------- Formatting ----------
  var inr = typeof Intl !== 'undefined' ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }) : null;
  function fmt(x) { var r = Math.round(x), s = inr ? inr.format(Math.abs(r)) : String(Math.abs(r)); return (r < 0 ? '-₹' : '₹') + s; }
  function hhmm(t) { return (Math.floor(t / 60) < 10 ? '0' : '') + Math.floor(t / 60) + ':' + (t % 60 < 10 ? '0' : '') + (t % 60); }

  var Market = { INDICES: INDICES, VIX: VIX, OPEN: OPEN, CLOSE: CLOSE, RATES: RATES, atm: atm, strikes: strikes, nextExpiry: nextExpiry,
    tradingDaysBetween: tradingDaysBetween, yearsToExpiry: yearsToExpiry, iv: iv, premium: premium, greeks: greeks, fill: fill,
    charges: charges, netPnl: netPnl, shortMargin: shortMargin, spreadMargin: spreadMargin,
    simulate: simulate, dailyPath: dailyPath, intradayPath: intradayPath, fmt: fmt, hhmm: hhmm };
  if (typeof module !== 'undefined') module.exports = Market; else root.Market = Market;
})(this);
