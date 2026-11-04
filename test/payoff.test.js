const assert = require('assert');
const P = require('../games/payoff/logic.js');

const near = (a, b) => assert(Math.abs(a - b) < 1e-9, a + ' != ' + b);

// Long call: breakeven = K + premium, loss capped at premium, gain unlimited
const lc = { side: 'buy', type: 'call', K: 110 };
const pc = P.premium('call', 110);
assert(pc > 0);
near(P.stats(lc).breakeven, Math.round((110 + pc) * 100) / 100);
near(P.stats(lc).maxLoss, pc);
assert.strictEqual(P.stats(lc).maxGain, Infinity);
near(P.pl(lc, 150), 40 - pc);
near(P.pl(lc, 50), -pc);

// Short put: max gain = premium
const sp = { side: 'sell', type: 'put', K: 90 };
near(P.stats(sp).maxGain, P.premium('put', 90));

// Long put: max loss = premium
near(P.stats({ side: 'buy', type: 'put', K: 100 }).maxLoss, P.premium('put', 100));

// Short call: max gain = premium, max loss unlimited
const sc = P.stats({ side: 'sell', type: 'call', K: 100 });
near(sc.maxGain, P.premium('call', 100));
assert.strictEqual(sc.maxLoss, Infinity);
assert.strictEqual(P.money(sc.maxLoss), 'unlimited');

// Curve spans 50..150
const c = P.curve(lc);
assert.strictEqual(c[0][0], 50);
assert.strictEqual(c[c.length - 1][0], 150);

// Hint names the wrong field
const t = { side: 'sell', type: 'put', K: 90 };
assert.strictEqual(P.hint(t, t), '');
assert.deepStrictEqual(P.wrongFields({ side: 'sell', type: 'put', K: 110 }, t), ['K']);
assert.strictEqual(P.hint({ side: 'sell', type: 'put', K: 110 }, t), 'Right shape, wrong strike: the line bends at 90.');
assert(/^Wrong side:/.test(P.hint({ side: 'buy', type: 'put', K: 90 }, t)));
assert(/^Wrong type:/.test(P.hint({ side: 'sell', type: 'call', K: 90 }, t)));
assert(/^Wrong side and type and strike:/.test(P.hint({ side: 'buy', type: 'call', K: 100 }, t)));

// Puzzles: 8, reproducible, all four shapes, no duplicates
const a = P.puzzles(7), b = P.puzzles(7);
assert.deepStrictEqual(a, b);
assert.strictEqual(a.length, 8);
assert.strictEqual(new Set(a.map(p => p.side + p.type)).size, 4);
assert.strictEqual(new Set(a.map(p => p.side + p.type + p.K)).size, 8);

// Explanation matches the spec example shape
assert(/^You sold a put at 90: you keep the \d+\.\d\d premium if the stock stays above 90/.test(P.explain(t)));

console.log('payoff tests passed');
