const assert = require('assert');
const R = require('../games/result.js');

// Breakdown: the same five rows plus Net P/L, in order
const html = R.breakdown({ direction: 100, time: -50, vol: 0, gamma: 3, costs: -20 }, { direction: 'a', time: 'b', vol: 'c', gamma: 'd', costs: 'e' }, 33, String);
assert.deepStrictEqual(html.match(/<tr[^>]*><td>[^<]+/g).map((s) => s.replace(/<[^>]+>/g, '')),
  ['NIFTY moved', 'Time passed', 'VIX changed', 'Gamma (delta changed as NIFTY moved)', 'Spread and charges', 'Net P/L']);
assert(/class="total"/.test(html));

// Wick's mood by outcome
assert.strictEqual(R.mood({ net: 6000, risk: 10000 }), 'wow');
assert.strictEqual(R.mood({ net: 100, risk: 10000 }), 'cheer');
assert.strictEqual(R.mood({ net: -100, risk: 10000 }), 'oops');
assert.strictEqual(R.mood({ net: -9000, risk: 10000 }), 'sad');
assert.strictEqual(R.mood({ net: -10000, risk: 10000, lapsed: true }), 'think');

// The line names the row that did most on the side of the result
const rows = { direction: 400, time: -2600, vol: -100, gamma: 50, costs: -60 };
assert.strictEqual(R.main(rows, -2310), 'time');
assert.strictEqual(R.line({ rows, net: -2310 }), 'Time value melted faster than NIFTY moved.');
assert.strictEqual(R.main(rows, 500), 'direction');
assert.strictEqual(R.line({ rows: { direction: -10, time: 900, vol: 0, gamma: 0, costs: -40 }, net: 850, seller: true }), 'Time value melted, and as the seller you kept it.');
assert.strictEqual(R.line({ rows: { direction: 0, time: 0, vol: 0, gamma: 0, costs: -40 }, net: -40 }), 'The spread and charges were the whole story: nothing else had time to move.');
console.log('result ok');
