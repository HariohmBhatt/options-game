const assert = require('assert');
const M = require('../market.js');

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
// 4 trading days Wed->Tue (Thu, Fri, Mon, Tue)
assert.strictEqual(M.tradingDaysBetween(wed, new Date(2026, 10, 10)), 4);
const T = M.yearsToExpiry(wed, new Date(2026, 10, 10));
assert(T > 4 / 252 && T < 5 / 252, 'T ' + T);
// At 15:30 on expiry day T is 0
assert.strictEqual(M.yearsToExpiry(new Date(2026, 10, 10, 15, 30), new Date(2026, 10, 10)), 0);

// Premium ticks to 0.05 and ATM call ~ ATM put when r = 0
const c = M.premium({ type: 'call', S: 24000, K: 24000, T: 4 / 252 });
const p = M.premium({ type: 'put', S: 24000, K: 24000, T: 4 / 252 });
assert(Math.abs(c - p) < 0.06 && c > 100 && c < 200, 'atm premium ' + c);
assert(Math.abs(c * 20 - Math.round(c * 20)) < 1e-9);

// Charges: buy 1 lot NIFTY at 150 -> brokerage 20 + stamp + exchange + sebi + gst, no STT
const buy = M.charges({ side: 'buy', premium: 150, qty: 65 });
assert.strictEqual(buy.stt, 0);
assert(buy.total > 20 && buy.total < 30, 'buy charges ' + buy.total);
const sell = M.charges({ side: 'sell', premium: 150, qty: 65 });
assert(Math.abs(sell.stt - 150 * 65 * 0.0015) < 1e-9);
// A scalp that gains 1 point on 1 lot (₹65 gross) is a net loss after charges
const rt = M.netPnl({ buy: 150, sell: 151, qty: 65 });
assert.strictEqual(rt.gross, 65);
assert(rt.net < 0, 'net ' + rt.net);
// Settlement ITM: STT on intrinsic, no second brokerage
const st = M.netPnl({ buy: 150, intrinsic: 300, qty: 65 });
assert.strictEqual(st.gross, 150 * 65);
assert(st.charges > 20 && st.charges < 60, 'settle charges ' + st.charges);

// Paths: reproducible, right length, positive, realistic scale
const a = M.dailyPath({ S0: 24000, days: 20, seed: 1 }), b = M.dailyPath({ S0: 24000, days: 20, seed: 1 });
assert.deepStrictEqual(a, b);
assert.strictEqual(a.length, 21);
assert(a.every(x => x > 20000 && x < 28000));
const d = M.intradayPath({ prevClose: 24000, seed: 3 });
assert.strictEqual(d[0].t, M.OPEN);
assert.strictEqual(d[d.length - 1].t, M.CLOSE);
assert.strictEqual(d.length, 76);
assert(d.every(x => x.S > 22000 && x.S < 26000));

// Rupee formatting with Indian grouping
assert.strictEqual(M.fmt(105603.4), '₹1,05,603');
assert.strictEqual(M.fmt(-1234567), '-₹12,34,567');
assert.strictEqual(M.hhmm(M.OPEN), '09:15');

console.log('market ok');
