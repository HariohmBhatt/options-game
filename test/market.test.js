const assert = require('assert');
const M = require('../market.js');
const E = require('../engine.js');

// Strikes snap to the index step
assert.deepStrictEqual(M.strikes('NIFTY', 24012, 2), [23900, 23950, 24000, 24050, 24100]);
assert.deepStrictEqual(M.strikes('BANKNIFTY', 54060, 1), [54000, 54100, 54200]);

// Expiry: Wed 4 Nov 2026 -> NIFTY next Tuesday 10 Nov; BANKNIFTY last Tuesday of Nov = 24 Nov
const wed = new Date(2026, 10, 4, 10, 0);
assert.strictEqual(M.nextExpiry('NIFTY', wed).getDate(), 10);
assert.strictEqual(M.nextExpiry('BANKNIFTY', wed).getDate(), 24);
// On expiry Tuesday before close, expiry is today; after close it is next week
assert.strictEqual(M.nextExpiry('NIFTY', new Date(2026, 10, 10, 11, 0)).getDate(), 10);
assert.strictEqual(M.nextExpiry('NIFTY', new Date(2026, 10, 10, 16, 0)).getDate(), 17);
// BANKNIFTY after November's last Tuesday -> 29 Dec; from 31 Dec -> 26 Jan 2027
assert.strictEqual(M.nextExpiry('BANKNIFTY', new Date(2026, 10, 25)).getDate(), 29);
assert.strictEqual(M.nextExpiry('BANKNIFTY', new Date(2026, 11, 31)).getMonth(), 0);
// 4 trading days Wed->Tue (Thu, Fri, Mon, Tue)
assert.strictEqual(M.tradingDaysBetween(wed, new Date(2026, 10, 10)), 4);
const T = M.yearsToExpiry(wed, new Date(2026, 10, 10));
assert(T > 4 / 252 && T < 5 / 252, 'T ' + T);
// At 15:30 on expiry day T is 0; at 09:15 it is exactly one session
assert.strictEqual(M.yearsToExpiry(new Date(2026, 10, 10, 15, 30), new Date(2026, 10, 10)), 0);
assert.strictEqual(M.yearsToExpiry(new Date(2026, 10, 10, 9, 15), new Date(2026, 10, 10)), 1 / 252);
// From a weekend only Mon + Tue count: Sun 8 Nov 10:00 -> Tue 10 Nov is 2 trading days, not 2.88
assert.strictEqual(M.yearsToExpiry(new Date(2026, 10, 8, 10, 0), new Date(2026, 10, 10)), 2 / 252);

// Premium ticks to 0.05 and ATM call ~ ATM put when r = 0
const c = M.premium({ type: 'call', S: 24000, K: 24000, T: 4 / 252 });
const p = M.premium({ type: 'put', S: 24000, K: 24000, T: 4 / 252 });
assert(Math.abs(c - p) < 0.06 && c > 100 && c < 200, 'atm premium ' + c);
assert(Math.abs(c * 20 - Math.round(c * 20)) < 1e-9);
// Skew: an OTM put carries more IV than the ATM, an OTM call less; ATM IV == VIX
assert.strictEqual(M.iv({ S: 24000, K: 24000, T: 4 / 252 }), 0.14);
const ivPut = M.iv({ S: 24000, K: 23700, T: 4 / 252 }), ivCall = M.iv({ S: 24000, K: 24300, T: 4 / 252 });
assert(ivPut > 0.14 && ivCall < 0.14, 'skew ' + ivPut + ' ' + ivCall);
assert(M.premium({ type: 'put', S: 24000, K: 23700, T: 4 / 252 }) > M.premium({ type: 'call', S: 24000, K: 24300, T: 4 / 252 }));
// A live far-OTM option never shows below one tick; at expiry OTM is worth 0 and ITM is intrinsic
assert.strictEqual(M.premium({ type: 'call', S: 24000, K: 26000, T: 1 / 252 }), 0.05);
assert.strictEqual(M.premium({ type: 'call', S: 24000, K: 24100, T: 0 }), 0);
assert.strictEqual(M.premium({ type: 'call', S: 24150, K: 24100, T: 0 }), 50);
// Flat index on expiry day: OTM premiums never rise as the clock runs (skew must not create a bump)
[23800, 23500, 24200, 24500].forEach(K => {
  const type = K < 24000 ? 'put' : 'call';
  let prev = Infinity;
  for (let m = M.OPEN; m <= M.CLOSE; m += 5) {
    const Tm = M.yearsToExpiry(new Date(2026, 10, 10, Math.floor(m / 60), m % 60), new Date(2026, 10, 10));
    const pm = M.premium({ type, S: 24000, K, T: Tm });
    assert(pm <= prev + 1e-9, K + ' rose at ' + M.hhmm(m) + ': ' + prev + ' -> ' + pm);
    prev = pm;
  }
});
// Greeks per unit use the strike's IV; ATM weekly call delta ~0.5, theta negative, vega positive
const g = M.greeks({ type: 'call', S: 24000, K: 24000, T: 4 / 252 });
assert(g.delta > 0.48 && g.delta < 0.56 && g.theta < 0 && g.vega > 0, JSON.stringify(g));

// Fills: buy at the ask, sell at the bid, one tick minimum
assert(M.fill({ premium: 170, side: 'buy' }) > 170 && M.fill({ premium: 170, side: 'sell' }) < 170);
assert(M.fill({ premium: 170, side: 'buy' }) - M.fill({ premium: 170, side: 'sell' }) <= 0.4);
assert.strictEqual(M.fill({ premium: 5, side: 'buy' }), 5.05);
assert.strictEqual(M.fill({ premium: 0.05, side: 'sell' }), 0.05);

// Charges: buy 1 lot NIFTY at 150 -> brokerage 20 + stamp + exchange + sebi + gst, no STT
const buy = M.charges({ side: 'buy', premium: 150, qty: 65 });
assert.strictEqual(buy.stt, 0);
assert(buy.total > 20 && buy.total < 30, 'buy charges ' + buy.total);
const sell = M.charges({ side: 'sell', premium: 150, qty: 65 });
assert(Math.abs(sell.stt - 150 * 65 * 0.0015) < 1e-9);
// A scalp that gains 1 point on 1 lot (₹65 gross) is a net loss after charges at this premium
const rt = M.netPnl({ buy: 150, sell: 151, qty: 65 });
assert.strictEqual(rt.gross, 65);
assert(rt.net < 0, 'net ' + rt.net);
// Settlement ITM: STT on intrinsic, no second brokerage
const st = M.netPnl({ buy: 150, intrinsic: 300, qty: 65 });
assert.strictEqual(st.gross, 150 * 65);
assert(st.charges > 20 && st.charges < 60, 'settle charges ' + st.charges);

// Margin: a naked short NIFTY lot blocks about ₹1.25 lakh; a 100-point spread for 30 credit blocks ~₹5,000
assert.strictEqual(M.shortMargin({ index: 'NIFTY', S: 24000 }), 124800);
assert.strictEqual(M.spreadMargin({ index: 'NIFTY', width: 100, credit: 30 }), 5005);

// Simulation: reproducible, right length, VIX stays in range and moves against the index
const a = M.simulate({ S0: 24000, days: 20, seed: 1 }), b = M.simulate({ S0: 24000, days: 20, seed: 1 });
assert.deepStrictEqual(a, b);
assert.strictEqual(a.S.length, 21); assert.strictEqual(a.vix.length, 21);
assert(a.vix.every(v => v >= 8 && v <= 60));
assert.deepStrictEqual(M.dailyPath({ S0: 24000, days: 20, seed: 1 }), a.S);
// Realised vol over a long run matches VIX within 10%, returns are fat-tailed and driftless
const long = M.simulate({ S0: 24000, days: 20000, vix: 14, seed: 7 });
const rets = long.S.slice(1).map((s, i) => Math.log(s / long.S[i]));
const mean = rets.reduce((x, y) => x + y, 0) / rets.length;
const v2 = rets.reduce((x, r) => x + (r - mean) ** 2, 0) / rets.length;
const kurt = rets.reduce((x, r) => x + (r - mean) ** 4, 0) / rets.length / (v2 * v2);
const realised = Math.sqrt(v2 * 252);
assert(Math.abs(realised - 0.14) < 0.014, 'realised vol ' + realised);
assert(kurt > 3, 'kurtosis ' + kurt);
assert(Math.abs(mean) < 2e-4, 'drift ' + mean);
// Leverage effect: VIX changes are negatively correlated with index returns
let cov = 0; for (let i = 0; i < rets.length; i++) cov += rets[i] * (long.vix[i + 1] - long.vix[i]);
assert(cov < 0, 'leverage');
// Intraday: 76 ticks, session vol matches the daily sigma within 10%, gap carries ~60% of it
const d = M.intradayPath({ prevClose: 24000, seed: 3 });
assert.strictEqual(d[0].t, M.OPEN); assert.strictEqual(d[d.length - 1].t, M.CLOSE); assert.strictEqual(d.length, 76);
assert(d.every(x => x.S > 22000 && x.S < 26000));
const daySig = 0.14 / Math.sqrt(252);
let g2 = 0, s2 = 0, N = 2000;
for (let i = 0; i < N; i++) {
  const s = M.intradayPath({ prevClose: 24000, seed: 1000 + i });
  g2 += Math.log(s[0].S / 24000) ** 2; s2 += Math.log(s[s.length - 1].S / 24000) ** 2;
}
assert(Math.abs(Math.sqrt(g2 / N) / daySig - 0.6) < 0.09, 'gap ' + Math.sqrt(g2 / N) / daySig);
assert(Math.abs(Math.sqrt(s2 / N) / daySig - 1) < 0.1, 'session ' + Math.sqrt(s2 / N) / daySig);

// Rupee formatting with Indian grouping; tiny negatives are not shown as -₹0
assert.strictEqual(M.fmt(105603.4), '₹1,05,603');
assert.strictEqual(M.fmt(-1234567), '-₹12,34,567');
assert.strictEqual(M.fmt(12345678), '₹1,23,45,678');
assert.strictEqual(M.fmt(-0.4), '₹0');
assert.strictEqual(M.hhmm(M.OPEN), '09:15');

console.log('market ok');
