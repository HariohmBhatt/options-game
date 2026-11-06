const assert = require('assert');
const P = require('../games/payoff/logic.js');
const M = require('../market.js');

const near = (a, b) => assert(Math.abs(a - b) < 1e-6, a + ' != ' + b);

// NIFTY ladder around spot 24000, x range spot ± 600
assert.deepStrictEqual(P.STRIKES, [23900, 23950, 24000, 24050, 24100]);
assert.deepStrictEqual(P.STRIKES, M.strikes('NIFTY', 24000, 2));
assert.strictEqual(P.LOT, 65);
const c = P.curve({ side: 'buy', type: 'call', K: 24000 });
assert.strictEqual(c[0][0], 23400);
assert.strictEqual(c[c.length - 1][0], 24600);
assert.strictEqual(P.premium('call', 24000), M.premium({ type: 'call', S: 24000, K: 24000, T: 4 / 252 }));

// Long CE: breakeven = K + premium (points), max loss = premium × 65 in rupees, gain unlimited
const lc = { side: 'buy', type: 'call', K: 24100 };
const pc = P.premium('call', 24100);
assert(pc > 0);
near(P.stats(lc).breakeven, 24100 + pc);
near(P.stats(lc).maxLoss, pc * 65);
assert.strictEqual(P.stats(lc).maxGain, Infinity);
near(P.pl(lc, 24600), (500 - pc) * 65);
near(P.pl(lc, 23400), -pc * 65);

// Long PE: max loss = premium × 65; short PE: max gain = premium × 65
near(P.stats({ side: 'buy', type: 'put', K: 24000 }).maxLoss, P.premium('put', 24000) * 65);
near(P.stats({ side: 'sell', type: 'put', K: 23900 }).maxGain, P.premium('put', 23900) * 65);

// Short CE: max gain = premium, max loss unlimited
const sc = P.stats({ side: 'sell', type: 'call', K: 24000 });
near(sc.maxGain, P.premium('call', 24000) * 65);
assert.strictEqual(sc.maxLoss, Infinity);
assert.strictEqual(P.money(sc.maxLoss), 'unlimited');
assert.strictEqual(P.money(7800), '₹7,800');

// NSE naming
assert.strictEqual(P.name(lc), 'BUY 24100 CE');
assert.strictEqual(P.name({ side: 'sell', type: 'put', K: 23900 }), 'SELL 23900 PE');

// Round-trip charges = buy + sell orders on 1 lot
const p0 = P.premium('call', 24000);
near(sc.charges, M.charges({ side: 'buy', premium: p0, qty: 65 }).total + M.charges({ side: 'sell', premium: p0, qty: 65 }).total);

// YMAX covers the largest |P/L| of all 20 positions, and is a round number
assert.strictEqual(P.all().length, 20);
const peak = Math.max(...P.all().flatMap(pos => P.curve(pos).map(p => Math.abs(p[1]))));
assert(P.YMAX >= peak && P.YMAX < peak * 1.5, P.YMAX + ' vs ' + peak);
assert.strictEqual(P.YMAX % (P.YSTEP / 2), 0);

// Hint names the wrong field and the bend's direction, never the target strike
P.all().forEach(g => P.all().forEach(tg => { if (g.K !== tg.K) assert(!P.hint(g, tg).includes(String(tg.K)), P.hint(g, tg)); }));
const t = { side: 'sell', type: 'put', K: 23900 };
assert.strictEqual(P.hint(t, t), '');
assert.deepStrictEqual(P.wrongFields({ side: 'sell', type: 'put', K: 24100 }, t), ['K']);
assert.strictEqual(P.hint({ side: 'sell', type: 'put', K: 24100 }, t), 'Right shape, wrong strike: the target bends to the left of 24100, at a lower strike.');
assert(/^Wrong side:/.test(P.hint({ side: 'buy', type: 'put', K: 23900 }, t)));
assert(/^Wrong type: a PE/.test(P.hint({ side: 'sell', type: 'call', K: 23900 }, t)));
// Every wrong field is explained, in order, in natural wording
assert.strictEqual(P.hint({ side: 'buy', type: 'put', K: 24000 }, { side: 'sell', type: 'put', K: 24100 }),
  'Wrong side and strike: a seller collects the premium, so the flat part sits above zero. And the target bends to the right of 24000, at a higher strike.');
const h3 = P.hint({ side: 'buy', type: 'call', K: 24000 }, t);
assert(/^Wrong side, type and strike: a seller collects .* A PE \(put\) only pays .* And the target bends to the left of 24000, at a lower strike\.$/.test(h3), h3);

// Charges line: round trip = open + close orders; if it expires worthless only the opening order applies
const lcS = P.stats(lc);
near(lcS.chargesOpen, M.charges({ side: 'buy', premium: pc, qty: 65 }).total);
near(lcS.charges, lcS.chargesOpen + M.charges({ side: 'sell', premium: pc, qty: 65 }).total);
near(P.stats(t).chargesOpen, M.charges({ side: 'sell', premium: P.premium('put', 23900), qty: 65 }).total);
assert(lcS.chargesOpen > 20 && lcS.chargesOpen < lcS.charges);

// Breakeven and points always show 2 decimals with Indian grouping
assert.strictEqual(P.pts(24168.9), '24,168.90');

// Puzzles: 8, reproducible, all four shapes, no duplicates
const a = P.puzzles(7), b = P.puzzles(7);
assert.deepStrictEqual(a, b);
assert.strictEqual(a.length, 8);
assert.strictEqual(new Set(a.map(p => p.side + p.type)).size, 4);
assert.strictEqual(new Set(a.map(p => p.side + p.type + p.K)).size, 8);

// Explanation in NSE terms with the rupee figure
const rs = M.fmt(P.stats(t).premiumRs);
assert(P.explain(t).startsWith('You sold a 23900 PE and collected ' + rs + ': you keep it if NIFTY stays above 23900 on Tuesday, and lose ₹65 for every point below 23,'), P.explain(t));
assert(P.explain(lc).includes(M.fmt(pc * 65)));

// ---------- Level 2: spreads ----------
assert.strictEqual(P.SPREADS.length, 4);
const sp = name => P.SPREADS.find(x => x.name === name).legs;
const prem = l => P.premium(l.type, l.K);

// Spread curve = sum of the legs' curves
P.SPREADS.forEach(({ legs }) => {
  const c2 = P.curve(legs), c0 = P.curve(legs[0]), c1 = P.curve(legs[1]);
  c2.forEach((p, n) => near(p[1], Math.round((c0[n][1] + c1[n][1]) * 100) / 100));
});

// Bull call spread: max loss = net debit × 65, max gain = (width − net debit) × 65
const bull = sp('Bull call spread'), bs = P.spreadStats(bull), debit = prem(bull[0]) - prem(bull[1]);
assert(bs.debit);
near(bs.net, Math.round(debit * 100) / 100);
near(bs.maxLoss, Math.round(debit * 65 * 100) / 100);
near(bs.maxGain, Math.round((100 - debit) * 65 * 100) / 100);
near(bs.breakevens[0], Math.round((24000 + debit) * 100) / 100);

// Short strangle: max gain = net credit × 65, loss unlimited
const ss = P.spreadStats(sp('Short strangle')), credit = prem(sp('Short strangle')[0]) + prem(sp('Short strangle')[1]);
assert(!ss.debit);
near(ss.maxGain, Math.round(credit * 65 * 100) / 100);
assert.strictEqual(ss.maxLoss, Infinity);

// Long straddle: breakevens = K ± total premium
const st = P.spreadStats(sp('Long straddle')), tot = prem(sp('Long straddle')[0]) + prem(sp('Long straddle')[1]);
assert.deepStrictEqual(st.breakevens, [Math.round((24000 - tot) * 100) / 100, Math.round((24000 + tot) * 100) / 100]);
assert.strictEqual(st.maxGain, Infinity);
near(st.maxLoss, Math.round(tot * 65 * 100) / 100);

// Leg order does not matter
P.SPREADS.forEach(({ legs }) => {
  const rev = legs.slice().reverse();
  assert(P.sameLegs(rev, legs));
  assert.strictEqual(P.spreadHint(rev, legs), '');
  assert.deepStrictEqual(P.spreadStats(rev), P.spreadStats(legs));
});
assert(!P.sameLegs([bull[0], bull[0]], bull));
assert(/^Leg 1 is right\. Leg 2: .*right of 24050/.test(P.spreadHint([bull[0], { side: 'sell', type: 'call', K: 24050 }], bull)));
assert(/Add leg 2/.test(P.spreadHint([bull[0]], bull)));
// A wrong leg's hint talks about what that leg does to the combined line, not a lone option's flat part
const h2 = P.spreadHint([bull[0], { side: 'buy', type: 'call', K: 24050 }], bull);
assert.strictEqual(h2, 'Leg 1 is right. Leg 2: wrong side and strike. This option is sold: past its strike it tilts the line down. Its bend is to the right of 24050, at a higher strike.');
assert(!/flat part/.test(P.spreadHint([{ side: 'buy', type: 'call', K: 24100 }, { side: 'buy', type: 'put', K: 23900 }], sp('Short strangle'))));
const pe = { side: 'buy', type: 'put', K: 24000 };
assert.strictEqual(P.spreadHint([pe, pe], sp('Long straddle')), 'Leg 1 is right. Leg 2: wrong type. It is a CE: it acts to the right of its strike (NIFTY above).');

assert(P.spreadExplain({ name: 'Bull call spread', legs: bull }).includes(M.fmt(bs.maxGain)));

// Reload-safe state: round trip rebuilds the same puzzle list from the seed; bad input gives null
const sv = { level: 1, seed: 1730700000000, i: 3, scores: { 1: 2, 2: 0 }, legs: [{ side: 'sell', type: 'put' }], missed: true, solved: false, done: false };
const back = P.restore(P.serialize(sv));
assert.deepStrictEqual(back.list, P.puzzles(sv.seed));
assert.deepStrictEqual({ ...back, list: undefined }, { ...sv, list: undefined });
assert.strictEqual(P.serialize(back), P.serialize(sv));
const st2 = P.restore(P.serialize({ level: 2, seed: 5, i: 1, scores: { 1: 8, 2: 1 }, legs: [bull[0], { side: 'sell' }], missed: false, solved: true }));
assert.strictEqual(st2.list, P.SPREADS); assert(st2.solved && !st2.done);
assert.deepStrictEqual(st2.legs, [bull[0], { side: 'sell' }]);
[null, '', '{', '{}', 'null', JSON.stringify({ ...sv, i: 8 }), JSON.stringify({ ...sv, level: 3 }), JSON.stringify({ ...sv, legs: [] }),
  JSON.stringify({ ...sv, legs: [{}, {}] }), JSON.stringify({ ...sv, legs: [{ K: 24025 }] }), JSON.stringify({ ...sv, scores: { 1: -1, 2: 0 } }),
  JSON.stringify({ ...sv, seed: 'x' })].forEach(s => assert.strictEqual(P.restore(s), null, String(s)));

console.log('payoff tests passed');
