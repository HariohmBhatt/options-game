const assert = require('assert');
const M = require('../market.js');
const T = require('../games/ticket/logic.js');
const LOT = 65;

// Round with a hand-made path so outcomes are known. path[0] = 24000, then days 1..DAYS.
function round(path) { const r = T.newRound(1, 100000); r.path = [24000].concat(path); return r; }
const flat = (v) => Array(T.DAYS).fill(v);

// Calendar: Wed 4 Nov -> Tue 10 Nov, 4 trading days, 3 strikes around ATM
assert.strictEqual(T.DAYS, 4);
assert.strictEqual(T.EXPIRY.getDay(), 2);
assert.deepStrictEqual(T.STRIKES, [23950, 24000, 24050]);
assert.strictEqual(T.LOT, LOT);
assert.strictEqual(T.daysLeft(round(flat(24000))), 4);

// Seeded path is reproducible
assert.deepStrictEqual(T.newRound(3, 1).path, T.newRound(3, 1).path);

// Premium x lot debited on buy
let r = round(flat(24000));
const p = T.premium(r, 'call', 24000);
assert(p > 50 && p < 300, 'premium ' + p);
T.buy(r, 'call', 24000);
assert.strictEqual(r.bankroll, Math.round((100000 - p * LOT) * 100) / 100);

// Flat index: option value (all time value at ATM) shrinks every day
let last = T.value(r);
for (let d = 1; d < T.DAYS; d++) {
  T.nextDay(r);
  const v = T.value(r);
  assert(v < last, 'day ' + d + ': ' + v + ' !< ' + last);
  last = v;
}

// Sell now: P/L after charges matches Market.netPnl, bankroll = start + net
r = round([24150].concat(flat(24150)));
T.buy(r, 'call', 24000); T.nextDay(r);
const sellAt = T.value(r);
T.sell(r);
const want = M.netPnl({ buy: r.ticket.premium, sell: sellAt, qty: LOT });
assert.strictEqual(r.result.how, 'sold');
assert.strictEqual(r.result.net, want.net);
assert.strictEqual(r.result.charges, want.charges);
assert(r.result.charges > 20, 'charges ' + r.result.charges);
assert.strictEqual(r.bankroll, Math.round((100000 + want.net) * 100) / 100);

// Sell after a flat day mentions time value melting
r = round(flat(24000));
T.buy(r, 'call', 24000); T.nextDay(r); T.sell(r);
assert(r.result.net < 0 && /time value melted/.test(r.result.why), r.result.why);

// Expiry OTM: lapses, loses premium x 65 plus buy-side charges only
r = round(flat(24010));
T.buy(r, 'call', 24050);
for (let i = 0; i < T.DAYS; i++) T.nextDay(r);
const buyC = M.charges({ side: 'buy', premium: r.ticket.premium, qty: LOT }).total;
assert.strictEqual(r.result.how, 'lapsed');
assert.strictEqual(r.result.exit, 0);
assert.strictEqual(r.result.charges, buyC);
assert.strictEqual(r.result.net, Math.round((-r.ticket.premium * LOT - buyC) * 100) / 100);
assert(/not a rupee more/.test(r.result.why), r.result.why);

// Expiry ITM: settles at intrinsic
r = round(flat(23800));
T.buy(r, 'put', 24000);
for (let i = 0; i < T.DAYS; i++) T.nextDay(r);
assert.strictEqual(r.result.how, 'auto');
assert.strictEqual(r.result.exit, 200);
assert.strictEqual(r.result.gross, (200 - r.ticket.premium) * LOT);
assert.strictEqual(r.result.net, M.netPnl({ buy: r.ticket.premium, intrinsic: 200, qty: LOT }).net);
assert(/intrinsic/.test(r.result.why), r.result.why);

// Flat index (moved < 1 point): say so, not "moved +0 points"
r = round([24000.3].concat(flat(24000)).slice(0, T.DAYS));
T.buy(r, 'call', 24000); T.nextDay(r); T.sell(r);
assert(!/[+-]0 points/.test(r.result.why) && /barely moved/.test(r.result.why), r.result.why);

// Premium rose a little but charges made the round a net loss: the why must not read like a win
r = round([24040].concat(flat(24040)).slice(0, T.DAYS));
T.buy(r, 'call', 24000); T.nextDay(r); T.sell(r);
assert(r.result.gross > 0 && r.result.net < 0, 'setup ' + r.result.gross + ' ' + r.result.net);
assert(/charges/.test(r.result.why) && /lost/.test(r.result.why), r.result.why);

console.log('ticket tests passed');
