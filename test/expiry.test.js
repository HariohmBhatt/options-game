const assert = require('assert');
const M = require('../market.js');
const X = require('../games/expiry/logic.js');

// T goes to 0 at 15:30 and the premium is pure intrinsic then
assert.strictEqual(X.T(M.CLOSE), 0);
assert(X.T(M.OPEN) > 0);
assert.strictEqual(X.premiumAt('call', 23900, { t: M.CLOSE, S: 24037 }), 137);
assert.strictEqual(X.premiumAt('put', 24100, { t: M.CLOSE, S: 24037 }), 63);
assert.strictEqual(X.premiumAt('call', 24100, { t: M.CLOSE, S: 24037 }), 0);

// Flat NIFTY: OTM premium strictly decreases every tick until it sits at the 0.05 floor, then 0 at the close
let prev = Infinity;
for (let t = M.OPEN; t <= M.CLOSE; t += 5) {
  const p = X.premiumAt('call', 24100, { t, S: 24000 });
  assert(p < prev || (p === prev && p <= 0.05), 'not decreasing at ' + M.hhmm(t) + ': ' + prev + ' -> ' + p);
  prev = p;
}
assert.strictEqual(prev, 0);
const sp = X.split('call', 24100, { t: M.OPEN, S: 24000 });
assert(sp.intrinsic === 0 && sp.time === sp.premium && sp.premium > 0);

// Nine strikes, ATM ±200
let r = X.newRound(7, 50000);
assert.strictEqual(r.path.length, 76);
assert(r.vix > 8 && r.vix < 30 && r.vix === M.simulate({ S0: 24000, days: 1, seed: 7 }).vix[1]);
const ks = X.strikes(r);
assert.strictEqual(ks.length, 9);
assert.strictEqual(ks[8] - ks[0], 400);
assert.strictEqual(X.moneyness('call', ks[4], X.tick(r).S), 'ATM');
assert.strictEqual(X.moneyness('call', ks[0], X.tick(r).S), 'ITM');
assert.strictEqual(X.moneyness('put', ks[0], X.tick(r).S), 'OTM');

// Watching advances the clock without a position
X.advance(r, 30); X.advance(r, 5);
assert.strictEqual(r.i, 7); assert.strictEqual(r.pos, null); assert.strictEqual(r.result, null);
r = X.newRound(7, 50000); X.advance(r, 200); assert.strictEqual(r.i, 40);

// Buy at tick 40 uses that tick's price, T and the round's VIX; debits ask x qty + buy charges
const K = X.strikes(r)[4], tk40 = r.path[40];
const mid0 = M.premium({ type: 'call', S: tk40.S, K, T: X.T(tk40.t), vix: r.vix }), p0 = M.fill({ premium: mid0, side: 'buy' });
assert(X.T(tk40.t) < X.T(M.OPEN));
X.buy(r, 'call', K);
assert.strictEqual(r.pos.i, 40); assert.strictEqual(r.pos.mid, mid0); assert.strictEqual(r.pos.buy, p0); assert(p0 > mid0);
assert.strictEqual(r.bankroll, Math.round((50000 - p0 * 65 - M.charges({ side: 'buy', premium: p0, qty: 65 }).total) * 100) / 100);
X.buy(r, 'put', K); assert.strictEqual(r.pos.type, 'call'); // one position per round

// Sell now at the bid: net after charges equals Market.netPnl
X.advance(r, 30);
assert.strictEqual(r.i, 46);
const p1 = M.fill({ premium: X.premiumAt('call', K, X.tick(r), r.vix), side: 'sell' });
X.sellNow(r);
const ref = M.netPnl({ buy: p0, sell: p1, qty: 65 });
assert.strictEqual(r.result.how, 'sold');
assert.strictEqual(r.result.exit, p1);
assert.strictEqual(r.result.net, ref.net);
assert.strictEqual(r.result.charges, ref.charges);
assert.strictEqual(r.bankroll, Math.round((50000 + ref.net) * 100) / 100);
// sell credits bid x qty (minus sell charges) on top of the post-buy bankroll
const afterBuy = 50000 - p0 * 65 - M.charges({ side: 'buy', premium: p0, qty: 65 }).total;
assert(Math.abs(r.bankroll - (afterBuy + p1 * 65 - M.charges({ side: 'sell', premium: p1, qty: 65 }).total)) < 0.02);
X.advance(r, 30); assert.strictEqual(r.i, 46); // round over

// lots = 3 triples qty and cost
const r3 = X.newRound(9, 50000), q1 = X.quote(r3, 'put', X.strikes(r3)[4], 1), q3 = X.quote(r3, 'put', X.strikes(r3)[4], 3);
assert.strictEqual(q3.qty, 195); assert.strictEqual(q3.cost, Math.round(q1.cost * 3 * 100) / 100);
X.buy(r3, 'put', X.strikes(r3)[4], 3); assert.strictEqual(r3.pos.qty, 195);

// Unaffordable blocks: bankroll below ask x qty + charges
const poor = X.newRound(9, 50000), kk = X.strikes(poor)[2], qq = X.quote(poor, 'call', kk, 1);
poor.bankroll = qq.need - 1;
assert.strictEqual(X.quote(poor, 'call', kk, 1).ok, false);
X.buy(poor, 'call', kk, 1); assert.strictEqual(poor.pos, null); assert.strictEqual(poor.bankroll, qq.need - 1);
poor.bankroll = qq.need; X.buy(poor, 'call', kk, 1); assert.strictEqual(poor.bankroll, 0);

// Attribution: direction + time + gamma - spread = gross (fill to fill), net = gross - charges
for (let sd = 1; sd < 60; sd++) {
  const g = X.newRound(sd, 50000); X.advance(g, 5 * (sd % 30));
  X.buy(g, sd % 2 ? 'call' : 'put', X.strikes(g)[sd % 9], 1 + sd % 3);
  if (sd % 3) while (!g.result) X.advance(g, 30); else { X.advance(g, 60); X.sellNow(g); }
  const a = g.result.attr;
  assert(Math.abs(a.direction + a.time + a.gamma - a.spread - g.result.gross) < 1, JSON.stringify([sd, a, g.result.gross]));
  assert(Math.abs(g.result.gross - g.result.charges - g.result.net) < 0.02);
  assert(a.time <= 0);
}

// Watching to 15:30 without buying ends the round at zero
const idle = X.newRound(3, 50000); X.advance(idle, 400);
assert.strictEqual(idle.result.how, 'none'); assert.strictEqual(idle.bankroll, 50000);

// State serialize/restore round-trips, path rebuilt from the seed
const st = { roundNo: 2, base: 10, lots: 2, pick: { type: 'put', K: 23900 }, history: [{ label: 'x', buy: 3, peak: 4, net: -200 }], start: 50000, view: 'play' };
st.r = X.newRound(11, 49000); X.advance(st.r, 60); X.buy(st.r, 'put', X.strikes(st.r)[3], 2); X.advance(st.r, 25);
const back = X.restore(X.serialize(st));
assert.deepStrictEqual(back, st);
assert(!/path/.test(X.serialize(st)));
X.advance(back.r, 30); X.advance(st.r, 30); assert.deepStrictEqual(back.r, st.r);
assert.strictEqual(X.restore('{bad'), null); assert.strictEqual(X.restore('{"r":{}}'), null);

// Find seeds whose close lands OTM / ITM for the top call strike
function play(seed, type, pick) {
  const g = X.newRound(seed, 50000), k = X.strikes(g)[pick];
  X.buy(g, type, k);
  while (!g.result) X.advance(g, 30);
  return g;
}
let otm, itm;
for (let s = 1; s < 500 && !(otm && itm); s++) {
  const g = play(s, 'call', 6), last = g.path[75].S;
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
assert.deepStrictEqual(s, { total: -790, looked: 2, won: 2, worst: -650 });


// Why-lines: an option bought ITM that lapses was not "all time value"; a CE whose index fell did not go "the right way but"
for (let sd = 1; sd < 400; sd++) {
  const g = X.newRound(sd, 50000), k = X.strikes(g)[2];
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

// NIFTY closes exactly on the strike: intrinsic 0, lapses, and the text says it closed at the strike (not "the wrong side")
const pin = X.newRound(11, 50000); X.advance(pin, 370);
const pinK = X.strikes(pin)[4]; X.buy(pin, 'call', pinK); pin.path[75] = { t: M.CLOSE, S: pinK }; X.advance(pin, 5);
assert(pin.result.how === 'lapsed' && pin.result.exit === 0, pin.result.how);
assert(/exactly at/.test(pin.result.why) && !/wrong side/.test(pin.result.why), pin.result.why);

console.log('expiry ok');
