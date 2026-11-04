const assert = require('assert');
const E = require('../engine.js');

// Known Black-Scholes value: S=100 K=100 T=1 sigma=0.2 r=0.05 -> call 10.4506, put 5.5735
const call = E.price({ type: 'call', S: 100, K: 100, T: 1, sigma: 0.2, r: 0.05 });
const put = E.price({ type: 'put', S: 100, K: 100, T: 1, sigma: 0.2, r: 0.05 });
assert(Math.abs(call - 10.4506) < 0.001, 'call ' + call);
assert(Math.abs(put - 5.5735) < 0.001, 'put ' + put);

// At expiry price == intrinsic value
assert.strictEqual(E.price({ type: 'call', S: 110, K: 100, T: 0, sigma: 0.3 }), 10);
assert.strictEqual(E.payoff('put', 90, 100), 10);
assert.strictEqual(E.payoff('put', 110, 100), 0);

// Seeded path is reproducible and has the right length
const a = E.pricePath({ S0: 100, sigma: 0.3, days: 20, seed: 42 });
const b = E.pricePath({ S0: 100, sigma: 0.3, days: 20, seed: 42 });
assert.deepStrictEqual(a, b);
assert.strictEqual(a.length, 21);
assert(a.every(x => x > 0));

console.log('engine ok');
