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

// Hint names the wrong field
const t = { side: 'sell', type: 'put', K: 23900 };
assert.strictEqual(P.hint(t, t), '');
assert.deepStrictEqual(P.wrongFields({ side: 'sell', type: 'put', K: 24100 }, t), ['K']);
assert.strictEqual(P.hint({ side: 'sell', type: 'put', K: 24100 }, t), 'Right shape, wrong strike: the line bends at 23900.');
assert(/^Wrong side:/.test(P.hint({ side: 'buy', type: 'put', K: 23900 }, t)));
assert(/^Wrong type: a PE/.test(P.hint({ side: 'sell', type: 'call', K: 23900 }, t)));
assert(/^Wrong side and type and strike:/.test(P.hint({ side: 'buy', type: 'call', K: 24000 }, t)));

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

console.log('payoff tests passed');
