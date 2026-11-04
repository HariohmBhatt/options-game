const assert = require('assert');
const T = require('../games/ticket/logic.js');

// Round with a hand-made path so outcomes are known. path[0] = 100, then days 1..10.
function round(path) { const r = T.newRound(1, 1000); r.path = [100].concat(path); return r; }
const flat = (v) => Array(T.DAYS).fill(v);

// Seeded path is reproducible
assert.deepStrictEqual(T.newRound(3, 1000).path, T.newRound(3, 1000).path);

// Premium deducted on buy
let r = round(flat(100));
const p = T.premium('call', 100);
assert(p > 0 && p < 10, 'premium ' + p);
T.buy(r, 'call', 100);
assert.strictEqual(r.bankroll, Math.round((1000 - p) * 100) / 100);

// Exercise ITM call early: payoff = S - K
r = round([110].concat(flat(90)));
T.buy(r, 'call', 100); T.nextDay(r);
assert.strictEqual(T.intrinsic(r), 10);
T.exercise(r);
assert.strictEqual(r.result.how, 'exercised');
assert.strictEqual(r.result.payoff, 10);
assert.strictEqual(r.result.pnl, Math.round((10 - r.ticket.premium) * 100) / 100);
assert.strictEqual(r.bankroll, Math.round((1000 - r.ticket.premium + 10) * 100) / 100);

// Exercise ITM put early: payoff = K - S
r = round(flat(88));
T.buy(r, 'put', 95); T.nextDay(r); T.exercise(r);
assert.strictEqual(r.result.payoff, 7);
assert.strictEqual(r.result.pnl, Math.round((7 - r.ticket.premium) * 100) / 100);

// OTM at expiry lapses: P/L = -premium, explanation says loss was capped
r = round(flat(101));
T.buy(r, 'call', 105);
for (let i = 0; i < T.DAYS; i++) T.nextDay(r);
assert.strictEqual(r.result.how, 'lapsed');
assert.strictEqual(r.result.payoff, 0);
assert.strictEqual(r.result.pnl, -r.ticket.premium);
assert(/capped/.test(r.result.why), r.result.why);

// ITM at expiry auto-exercises
r = round(flat(90));
T.buy(r, 'put', 100);
for (let i = 0; i < T.DAYS; i++) T.nextDay(r);
assert.strictEqual(r.result.how, 'auto');
assert.strictEqual(r.result.payoff, 10);
assert(/automatically/.test(r.result.why), r.result.why);

console.log('ticket tests passed');
