const assert = require('assert');
const M = require('../market.js');
const X = require('../games/expiry/logic.js');

// T goes to 0 at 15:30 and the premium is pure intrinsic then
assert.strictEqual(X.T(M.CLOSE), 0);
assert(X.T(M.OPEN) > 0);
assert.strictEqual(X.premiumAt('call', 23900, { t: M.CLOSE, S: 24037 }), 137);
assert.strictEqual(X.premiumAt('put', 24100, { t: M.CLOSE, S: 24037 }), 63);
assert.strictEqual(X.premiumAt('call', 24100, { t: M.CLOSE, S: 24037 }), 0);

// Flat NIFTY: OTM premium strictly decreases every tick until it hits 0
let prev = Infinity;
for (let t = M.OPEN; t <= M.CLOSE; t += 5) {
  const p = X.premiumAt('call', 24100, { t, S: 24000 });
  assert(p < prev || (p === 0 && prev === 0), 'not decreasing at ' + M.hhmm(t) + ': ' + prev + ' -> ' + p);
  prev = p;
}
assert.strictEqual(prev, 0);
const sp = X.split('call', 24100, { t: M.OPEN, S: 24000 });
assert(sp.intrinsic === 0 && sp.time === sp.premium && sp.premium > 0);

// Buy debits premium x 65
let r = X.newRound(7, 50000);
assert.strictEqual(r.path.length, 76);
const K = X.strikes(r)[3], p0 = X.premiumAt('call', K, X.tick(r));
X.buy(r, 'call', K);
assert.strictEqual(r.bankroll, Math.round((50000 - p0 * 65) * 100) / 100);

// Sell now: net after charges equals Market.netPnl
X.advance(r, 30);
assert.strictEqual(r.i, 6);
const p1 = X.premiumAt('call', K, X.tick(r));
X.sellNow(r);
const ref = M.netPnl({ buy: p0, sell: p1, qty: 65 });
assert.strictEqual(r.result.how, 'sold');
assert.strictEqual(r.result.net, ref.net);
assert.strictEqual(r.result.charges, ref.charges);
assert.strictEqual(r.bankroll, Math.round((50000 + ref.net) * 100) / 100);

// Find seeds whose close lands OTM / ITM for the top call strike
function play(seed, type, pick) {
  const g = X.newRound(seed, 50000), k = X.strikes(g)[pick];
  X.buy(g, type, k);
  while (!g.result) X.advance(g, 30);
  return g;
}
let otm, itm;
for (let s = 1; s < 500 && !(otm && itm); s++) {
  const g = play(s, 'call', 4), last = g.path[75].S;
  if (!otm && last < g.pos.K) otm = g;
  if (!itm && last > g.pos.K) itm = g;
}
// Expiry OTM lapses: exit 0, lose premium + buy charges only
assert.strictEqual(otm.result.how, 'lapsed');
assert.strictEqual(otm.result.exit, 0);
assert.strictEqual(otm.result.gross, -otm.pos.buy * 65);
assert.strictEqual(otm.result.net, -X.maxLoss(otm.pos.buy));
assert(/₹0 by 15:30/.test(otm.result.why));
// Expiry ITM settles at intrinsic
assert.strictEqual(itm.result.how, 'itm');
const iv = X.intrinsic('call', itm.pos.K, itm.path[75].S);
assert(iv > 0);
assert.strictEqual(itm.result.exit, iv);
assert.strictEqual(itm.result.net, M.netPnl({ buy: itm.pos.buy, intrinsic: iv, qty: 65 }).net);

// Summary: "looked like a winner" = peak >= 2x buy, independent of how it ended
const s = X.summary([
  { buy: 10, peak: 20, net: -650 },   // doubled, then lost
  { buy: 10, peak: 19.95, net: 100 }, // never doubled, won
  { buy: 5, peak: 12, net: 300 },     // doubled and won
  { buy: 8, peak: 8, net: -540 }
]);
assert.deepStrictEqual(s, { total: -790, looked: 2, won: 2 });


// Why-lines: an option bought ITM that lapses was not "all time value"; a CE whose index fell did not go "the right way but"
for (let sd = 1; sd < 400; sd++) {
  const g = X.newRound(sd, 50000), k = X.strikes(g)[0];
  X.buy(g, 'call', k);
  while (!g.result) X.advance(g, 30);
  if (g.result.how === 'lapsed') { assert(!/all time value/.test(g.result.why), g.result.why); break; }
}
const fell = X.newRound(1, 50000);
fell.path = fell.path.map((p, i) => ({ t: p.t, S: 24000 - i }));
X.buy(fell, 'call', 24100); while (!fell.result) X.advance(fell, 30);
assert(/^NIFTY fell 75 points and never reached 24100/.test(fell.result.why), fell.result.why);
// Sold on a flat index: the why names time decay as the cause of the loss
const flat = X.newRound(1, 50000);
flat.path = flat.path.map(p => ({ t: p.t, S: 24000 }));
X.buy(flat, 'call', 24100); X.advance(flat, 60); X.sellNow(flat);
assert(flat.result.net < 0 && /time value fell from/.test(flat.result.why), flat.result.why);

console.log('expiry ok');
