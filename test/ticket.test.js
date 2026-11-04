const assert = require('assert');
const M = require('../market.js');
const T = require('../games/ticket/logic.js');
const LOT = 65;

// Round with a hand-made path so outcomes are known. path[0] = 24000, then days 1..DAYS.
// VIX is held flat at 14 unless a test passes its own path.
function round(path, vix) { const r = T.newRound(1, 100000); r.path = [24000].concat(path); r.vix = vix || Array(T.DAYS + 1).fill(14); return r; }
const flat = (v) => Array(T.DAYS).fill(v);

// Calendar: Wed 4 Nov -> Tue 10 Nov, 4 trading days, 3 strikes around ATM
assert.strictEqual(T.DAYS, 4);
assert.strictEqual(T.EXPIRY.getDay(), 2);
assert.deepStrictEqual(T.STRIKES, [23950, 24000, 24050]);
assert.strictEqual(T.LOT, LOT);
assert.strictEqual(T.daysLeft(round(flat(24000))), 4);

// Seeded path (index and VIX) is reproducible
assert.deepStrictEqual(T.newRound(3, 1).path, T.newRound(3, 1).path);
assert.deepStrictEqual(T.newRound(3, 1).vix, T.newRound(3, 1).vix);
assert.strictEqual(T.newRound(3, 1).vix.length, T.DAYS + 1);

// Daily reprice uses that day's VIX
let r = round(flat(24000), [14, 20, 14, 14, 14]);
const pDay0 = T.premium(r, 'call', 24000);
T.nextDay(r);
assert.strictEqual(T.premium(r, 'call', 24000), M.premium({ type: 'call', S: 24000, K: 24000, T: T.T(r), vix: 20 }));
assert(T.premium(r, 'call', 24000) > pDay0, 'VIX 14 -> 20 must lift the premium despite a day of decay');

// Ask x lot debited on buy (ask above mid)
r = round(flat(24000));
const p = T.premium(r, 'call', 24000), a = M.fill({ premium: p, side: 'buy' });
assert(p > 50 && p < 300, 'premium ' + p);
assert(a > p);
T.buy(r, 'call', 24000);
assert.strictEqual(r.ticket.premium, a);
// bankroll shown while holding is after the buy charges too
assert.strictEqual(r.bankroll, Math.round((100000 - a * LOT - M.charges({ side: 'buy', premium: a, qty: LOT }).total) * 100) / 100);

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
const sellAt = T.bid(r);
assert(sellAt < T.value(r), 'bid below mid');
const bankBefore = r.bankroll;
T.sell(r);
assert(Math.abs(r.bankroll - bankBefore - (sellAt * LOT - M.charges({ side: 'sell', premium: sellAt, qty: LOT }).total)) < 0.02, 'sell credits bid x qty minus sell charges (buy charges were paid at entry)');
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
// (search for the index level where one day's move just beats a day of decay, so the test survives pricing changes)
r = null;
for (let s1 = 24001; s1 <= 24100 && !r; s1++) {
  const rr = round([s1].concat(flat(s1)).slice(0, T.DAYS));
  T.buy(rr, 'call', 24000); T.nextDay(rr); T.sell(rr);
  if (rr.result.gross > 0 && rr.result.net < 0) r = rr;
}
assert(r, 'no small-gain setup found between 24001 and 24100');
assert(/charges/.test(r.result.why) && /lost/.test(r.result.why), r.result.why);

// Attribution rows: NIFTY + time + VIX + other = mid-to-mid gross; minus spread + charges = net (within ₹1)
function sums(r) {
  const x = r.result.rows, s = x.direction + x.time + x.vol + x.other;
  assert(Math.abs(s - r.result.spread - r.result.gross) < 1, JSON.stringify(r.result));
  assert(Math.abs(s + x.costs - r.result.net) < 1, JSON.stringify(r.result));
}
for (let seed = 1; seed <= 30; seed++) {
  for (const days of [1, 2, T.DAYS]) {
    const rr = T.newRound(seed, 100000);
    T.buy(rr, seed % 2 ? 'call' : 'put', T.STRIKES[seed % 3], 1);
    for (let i = 0; i < days; i++) T.nextDay(rr);
    if (!rr.result) T.sell(rr);
    sums(rr);
    assert(/^Most of this (loss|gain) was /.test(rr.result.why), rr.result.why);
  }
}
// Biggest row named: flat NIFTY, flat VIX, held 2 days -> time
r = round(flat(24000));
T.buy(r, 'call', 24000); T.nextDay(r); T.nextDay(r); T.sell(r);
assert(/^Most of this loss was time passing/.test(r.result.why), r.result.why);
assert(r.result.rows.time < 0 && Math.abs(r.result.rows.direction) < 1);

// Lots = 2 doubles qty and max loss
r = round(flat(24000));
const q1 = T.quote(r, 'call', 24000, 1), q2 = T.quote(r, 'call', 24000, 2);
assert.strictEqual(q2.qty, 2 * LOT);
assert.strictEqual(q2.cost, Math.round(2 * q1.cost * 100) / 100);
assert(q2.maxLoss > 2 * q1.maxLoss - 25 && q2.maxLoss < 2 * q1.maxLoss, 'brokerage stays ₹20 per order: ' + q1.maxLoss + ' ' + q2.maxLoss);
T.buy(r, 'call', 24000, 2);
assert.strictEqual(r.ticket.qty, 130);
assert.strictEqual(r.bankroll, Math.round((100000 - q2.ask * 130 - q2.charges) * 100) / 100);
assert(Math.abs(T.greeks(r).delta - 130 * M.greeks({ type: 'call', S: 24000, K: 24000, T: T.T(r), vix: 14 }).delta) < 1e-9);

// Break-even: strike + ask + charges / qty, above the strike + ask for a CE, below strike - ask for a PE
assert(q1.breakeven > 24000 + q1.ask && q1.breakeven < 24000 + q1.ask + 2, q1.breakeven);
assert(T.quote(r, 'put', 24000, 1).breakeven < 24000 - T.quote(r, 'put', 24000, 1).ask);

// Buy blocked when unaffordable including charges: bankroll exactly the premium is not enough
r = round(flat(24000));
const q = T.quote(r, 'call', 24000, 1);
r.bankroll = q.cost;
assert(!T.quote(r, 'call', 24000, 1).ok);
T.buy(r, 'call', 24000, 1);
assert.strictEqual(r.ticket, null);
assert.strictEqual(r.bankroll, q.cost);
r.bankroll = q.maxLoss;
assert(T.quote(r, 'call', 24000, 1).ok);

// State round-trips through a fake localStorage
const store = {}; global.localStorage = { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
r = T.newRound(42, 90000); T.buy(r, 'put', 23950, 3); T.nextDay(r);
const game = { roundNo: 2, salt: 7, lots: 3, pick: { type: 'put', K: 23950 }, history: [{ label: 'x', pnl: -10 }], r: r };
localStorage.setItem('optionsgames.ticket.state', T.serialize(game));
const back = T.restore(localStorage.getItem('optionsgames.ticket.state'));
assert.deepStrictEqual(back, JSON.parse(JSON.stringify(game)));
T.nextDay(back.r); T.sell(back.r); assert(back.r.result, 'restored game keeps playing');
assert.strictEqual(T.restore(null), null);
assert.strictEqual(T.restore('{bad'), null);
assert.strictEqual(T.restore(JSON.stringify({ v: 2, g: { roundNo: 9 } })), null);

// A gain carried by the VIX rise must not say NIFTY's move beat time decay
r = round([24015, 24015, 24015, 24015], [14, 17, 14, 14, 14]); T.buy(r, 'call', 24000, 1); T.nextDay(r); T.sell(r);
assert(r.result.net > 0 && r.result.rows.direction + r.result.rows.time < 0);
assert(!/enough to beat/.test(r.result.why), r.result.why);
assert(/VIX rise/.test(r.result.why), r.result.why);

console.log('ticket tests passed');

// No strike chosen: buy does nothing
r = round(flat(24000));
T.buy(r, 'call', null);
assert.strictEqual(r.ticket, null); assert.strictEqual(r.bankroll, 100000);

// ITM at expiry but still a loss: the why uses the pick screen's break-even, charges included
r = round(flat(23950));
const qBe = T.quote(r, 'put', 24000, 1);
T.buy(r, 'put', 24000);
for (let i = 0; i < T.DAYS; i++) T.nextDay(r);
assert.strictEqual(r.result.how, 'auto'); assert(r.result.net < 0);
assert(r.result.why.includes('below ' + qBe.breakeven + ' (strike − ask − charges)'), r.result.why);
assert(qBe.breakeven < Math.round(24000 - qBe.ask), 'charges push the PE break-even below strike - ask');
assert.strictEqual(r.bankroll, Math.round((100000 + r.result.net) * 100) / 100);
console.log('ticket polish ok');
