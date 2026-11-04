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

// Greeks, same textbook case: delta 0.6368 / -0.3632, gamma 0.01876, vega 0.3752 per 1%, call theta -6.414/yr
const gc = E.greeks({ type: 'call', S: 100, K: 100, T: 1, sigma: 0.2, r: 0.05 });
const gp = E.greeks({ type: 'put', S: 100, K: 100, T: 1, sigma: 0.2, r: 0.05 });
assert(Math.abs(gc.delta - 0.6368) < 0.001, 'delta ' + gc.delta);
assert(Math.abs(gp.delta + 0.3632) < 0.001, 'put delta ' + gp.delta);
assert(Math.abs(gc.gamma - 0.01876) < 0.0001, 'gamma ' + gc.gamma);
assert(Math.abs(gc.vega - 0.3752) < 0.001, 'vega ' + gc.vega);
assert(Math.abs(gc.theta * 252 + 6.414) < 0.01, 'theta ' + gc.theta);
assert(Math.abs(gp.gamma - gc.gamma) < 1e-12 && Math.abs(gp.vega - gc.vega) < 1e-12);
// Finite-difference check of delta and theta
const bump = E.price({ type: 'call', S: 100.01, K: 100, T: 1, sigma: 0.2, r: 0.05 }) - call;
assert(Math.abs(bump / 0.01 - gc.delta) < 0.001);
const later = E.price({ type: 'call', S: 100, K: 100, T: 1 - 1 / 252, sigma: 0.2, r: 0.05 }) - call;
assert(Math.abs(later - gc.theta) < 0.001, 'theta fd ' + later + ' vs ' + gc.theta);
// At expiry: delta is 0 or ±1, nothing else
assert.deepStrictEqual(E.greeks({ type: 'put', S: 90, K: 100, T: 0, sigma: 0.2 }), { delta: -1, gamma: 0, theta: 0, vega: 0 });

// Seeded path is reproducible and has the right length
const a = E.pricePath({ S0: 100, sigma: 0.3, days: 20, seed: 42 });
const b = E.pricePath({ S0: 100, sigma: 0.3, days: 20, seed: 42 });
assert.deepStrictEqual(a, b);
assert.strictEqual(a.length, 21);
assert(a.every(x => x > 0));

console.log('engine ok');
