const assert = require('assert');
const M = require('../market.js');
const G = require('../games/seller/logic.js');
const LOT = 65;
const r2 = (x) => Math.round(x * 100) / 100;

// Round with a hand-made path: S[0] = 24000, vix flat at 14 unless given.
function round(no, S, vix) { const r = G.newRound(no, 1, 200000); r.path = { S: [24000].concat(S), vix: vix || Array(5).fill(14) }; return r; }
const toExpiry = (r) => { for (let i = 0; i < G.DAYS; i++) G.nextDay(r); return r; };

assert.strictEqual(G.STRIKES.length, 9);
assert.strictEqual(G.DATES[4].getDay(), 2);
assert.strictEqual(G.MARGIN, M.shortMargin({ index: 'NIFTY', S: 24000 }));
assert(G.MARGIN > 120000 && G.MARGIN < 130000);

// Entry: credits bid x 65 to premium received, blocks shortMargin, sell-side charges (STT) on entry
let r = round(1, [24000, 24000, 24000, 24000]);
const bid = M.fill({ premium: G.mid(r, 'call', 24100), side: 'sell' });
G.open(r, 'call', 24100);
assert.strictEqual(r.pos.received, r2(bid * LOT));
assert.strictEqual(r.pos.margin, G.MARGIN);
assert.strictEqual(r.pos.entryC, M.charges({ side: 'sell', premium: bid, qty: LOT }).total);
assert(M.charges({ side: 'sell', premium: bid, qty: LOT }).stt > 0);
assert.strictEqual(r.bankroll, 200000); // premium is not free cash

// Short Greeks signs: short CE delta < 0, theta > 0, vega < 0
const g = G.greeks(r);
assert(g.delta < 0 && g.theta > 0 && g.vega < 0, JSON.stringify(g));
r = round(1, [24000, 24000, 24000, 24000]); G.open(r, 'put', 23900);
assert(G.greeks(r).delta > 0, 'short PE delta positive');

// OTM expiry: keep full premium, only entry charges
r = round(1, [24000, 24050, 24020, 24010]); G.open(r, 'call', 24100); toExpiry(r);
assert.strictEqual(r.result.how, 'expiry');
assert.strictEqual(r.result.exitC, 0);
assert.strictEqual(r.result.net, r2(r.pos.received - r.pos.entryC));
assert.strictEqual(r.bankroll, r2(200000 + r.result.net));
assert(/kept the full/.test(r.result.why), r.result.why);

// ITM expiry: pay intrinsic x 65, no STT (no exit charges) for the seller
r = round(1, [24000, 24100, 24200, 24300]); G.open(r, 'call', 24100); toExpiry(r);
assert.strictEqual(r.result.paid, 200 * LOT);
assert.strictEqual(r.result.exitC, 0);
assert.strictEqual(r.result.net, r2(r.pos.received - 200 * LOT - r.pos.entryC));

// Buy back: net = (bid - ask) x 65 - entry - exit charges
r = round(1, [24050, 24050, 24050, 24050]); G.open(r, 'put', 24000); G.nextDay(r);
const ask = M.fill({ premium: G.mid(r, 'put', 24000), side: 'buy' });
const entryBid = r.pos.legs[0].px;
assert.strictEqual(G.mtm(r), r2((entryBid - ask) * LOT));
G.buyBack(r);
const exitC = M.charges({ side: 'buy', premium: ask, qty: LOT }).total;
assert.strictEqual(r.result.net, r2(r2((entryBid - ask) * LOT) - r.pos.entryC - exitC));

// Gap day: Monday S = Fri x (1 - 3.2%), vix x 1.6, on rounds 3 and 5 only
for (const no of [3, 5]) {
  const raw = M.simulate({ S0: 24000, days: 4, vix: M.VIX, seed: 77 }), gr = G.newRound(no, 77, 1);
  assert.strictEqual(gr.path.S[3], r2(raw.S[2] * 0.968));
  assert.strictEqual(gr.path.vix[3], r2(raw.vix[2] * 1.6));
  assert(G.gapPoints(gr) >= 700 && G.gapPoints(gr) <= 850, G.gapPoints(gr));
}
assert.deepStrictEqual(G.newRound(1, 77, 1).path, M.simulate({ S0: 24000, days: 4, vix: M.VIX, seed: 77 }));

// Spread: net credit = sold bid - bought ask; margin = spreadMargin; max loss = (width - credit) x 65
r = round(4, [24000, 24000, 24000, 24000]); G.open(r, 'put', 24000, 200);
const sb = M.fill({ premium: G.mid(r, 'put', 24000), side: 'sell' }), la = M.fill({ premium: G.mid(r, 'put', 23800), side: 'buy' });
assert.strictEqual(r.pos.legs[1].K, 23800);
assert.strictEqual(r.pos.credit, r2(sb - la));
assert.strictEqual(r.pos.margin, M.spreadMargin({ index: 'NIFTY', width: 200, credit: r.pos.credit }));
assert.strictEqual(r.pos.maxLoss, r2((200 - r.pos.credit) * LOT));
assert(r.pos.margin < G.MARGIN / 5);

// Spread settlement, both legs ITM: gross loss capped at (width - credit) x 65
r = round(5, [23900, 23500, 23000, 22900]); G.open(r, 'put', 24000, 100); toExpiry(r);
assert.strictEqual(r.result.gross, -r2((100 - r.pos.credit) * LOT));
assert(r.result.net < r.result.gross && r.result.net > r.result.gross - 200);
assert(r.result.naked.net < r.result.net * 5, 'naked loses far more on the same path');
assert(/Naked vs hedged/.test(r.result.why) && /gap day/.test(r.result.why), r.result.why);

// Attribution sums to gross within ₹1, on random and gap paths, naked and spread
for (let seed = 1; seed <= 20; seed++) for (const no of [1, 3, 4, 5]) {
  const rr = G.newRound(no, seed, 200000); G.open(rr, seed % 2 ? 'call' : 'put', 24000, 100);
  if (seed % 3) toExpiry(rr); else { G.nextDay(rr); G.nextDay(rr); G.buyBack(rr); }
  const a = rr.result.attr;
  assert(Math.abs(a.direction + a.time + a.vol + a.residual - rr.result.gross) < 1, JSON.stringify(a));
  if (no <= 3) assert(a.time > 0, 'time is positive for a naked seller');
}
// Gap with a naked PE: direction is the biggest driver and it is a loss
r = G.newRound(3, 5, 200000); G.open(r, 'put', 24000); toExpiry(r);
assert(r.result.attr.direction < -15000 && /NIFTY moved/.test(r.result.why), r.result.why);

// Serialize / restore round-trip; garbage restores to null
const game = G.newGame(200000, 42); G.open(game.r, 'call', 24100); G.nextDay(game.r);
const back = G.restore(G.serialize(game));
assert.deepStrictEqual(back, JSON.parse(JSON.stringify(game)));
assert.strictEqual(G.mtm(back.r), G.mtm(game.r));
assert.strictEqual(G.restore('{bad'), null);
assert.strictEqual(G.restore('{"x":1}'), null);

// Game flow: 5 rounds, history + summary
const gg = G.newGame(200000, 9);
for (let i = 1; i <= 5; i++) {
  assert.strictEqual(gg.r.mode, i <= 3 ? 'naked' : 'spread');
  G.open(gg.r, 'put', 24000, 200); toExpiry(gg.r); G.record(gg);
  if (i < 5) G.nextRound(gg);
}
const s = G.summary(gg);
assert.strictEqual(s.total, r2(gg.history.reduce((a, x) => a + x.net, 0)));
assert.strictEqual(s.maxMargin, G.MARGIN);
assert.strictEqual(gg.r.bankroll, r2(200000 + s.total));

console.log('seller tests passed');
