const assert = require('assert');
const M = require('../market.js');
const X = require('../games/chain/logic.js');

// Deterministic per seed, 11 strikes, ATM closest to spot, spot not stuck at 24000
assert.deepStrictEqual(JSON.stringify(X.build(7)), JSON.stringify(X.build(7)));
assert.notStrictEqual(X.build(7).spot, X.build(8).spot);
assert.strictEqual(X.T, M.yearsToExpiry(new Date(2026, 10, 4, 9, 15), new Date(2026, 10, 10)));

for (const seed of [...Array(300).keys()].map(i => i + 1).concat(1978, 7050, 16238)) {
  const c = X.build(seed), R = c.rows;
  assert.strictEqual(R.length, 11);
  R.forEach(r => assert(Math.abs(c.spot - c.atm) <= Math.abs(c.spot - r.K), 'ATM not closest, seed ' + seed));
  assert.strictEqual(c.atm, R[5].K);
  assert(Math.abs(c.spot - c.atm) < 25, 'spot halfway between strikes: ATM is ambiguous, seed ' + seed);
  for (let i = 1; i < R.length; i++) {
    assert(R[i].ce.ltp < R[i - 1].ce.ltp, 'CE LTP must fall as strike rises');
    assert(R[i].pe.ltp > R[i - 1].pe.ltp, 'PE LTP must rise as strike rises');
  }
  R.forEach(r => {
    assert(r.ce.ltp >= Math.max(0, c.spot - r.K) - 0.05 && r.pe.ltp >= Math.max(0, r.K - c.spot) - 0.05, 'LTP below intrinsic');
    assert.strictEqual(r.ce.itm, r.K < c.spot); assert.strictEqual(r.pe.itm, r.K > c.spot);
    [r.ce, r.pe].forEach(s => {
      assert(Number.isInteger(s.oi) && s.oi > 0 && Number.isInteger(s.vol));
      assert(s.vol >= s.oi * 0.3 - 1 && s.vol <= s.oi * 1.2 + 1);
      assert(Math.abs(s.chg) >= s.oi * 0.05 - 1 && Math.abs(s.chg) <= s.oi * 0.4 + 1, 'chg OI out of 5-40%');
    });
  });
  // Skew: 200-OTM PE IV > 200-OTM CE IV
  assert(X.row(c, c.atm - 200).pe.iv > X.row(c, c.atm + 200).ce.iv);
  // Walls unique per side
  ['ce', 'pe'].forEach(s => {
    const max = Math.max(...R.map(r => r[s].oi));
    assert.strictEqual(R.filter(r => r[s].oi === max).length, 1);
    assert.strictEqual(X.wallK(c, s), R.find(r => r[s].oi === max).K);
  });
  // PCR and max pain
  const sum = s => R.reduce((a, r) => a + r[s].oi, 0);
  assert.strictEqual(c.pcr, sum('pe') / sum('ce'));
  assert(Math.abs(c.pcr - 1) >= 0.04, 'PCR too close to 1 to ask about');
  assert(R.some(r => r.K === c.maxPain));
  assert(c.straddle === Math.round((X.row(c, c.atm).ce.ltp + X.row(c, c.atm).pe.ltp) * 100) / 100);
}

// Max pain on a tiny hand-made chain, against an independent re-implementation
const tiny = [
  { K: 100, ce: { oi: 10 }, pe: { oi: 50 } },
  { K: 110, ce: { oi: 20 }, pe: { oi: 30 } },
  { K: 120, ce: { oi: 60 }, pe: { oi: 5 } }
];
// buyers' payout: at 100 = puts 110:30*10 + 120:5*20 = 400; at 110 = calls 10*10 + puts 5*10 = 150; at 120 = calls 10*20 + 20*10 = 400
function brute(rows) {
  let best, bestK;
  for (const s of rows.map(r => r.K)) {
    let p = 0;
    for (const r of rows) { if (s > r.K) p += r.ce.oi * (s - r.K); if (s < r.K) p += r.pe.oi * (r.K - s); }
    if (best === undefined || p < best) { best = p; bestK = s; }
  }
  return { K: bestK, pain: best };
}
assert.deepStrictEqual(brute(tiny), { K: 110, pain: 150 });
assert.deepStrictEqual(X.maxPain(tiny), brute(tiny));
assert.strictEqual(X.painAt(tiny, 100), 400);
assert.strictEqual(X.pcr(tiny), 85 / 90);
for (let seed = 1; seed <= 50; seed++) { const c = X.build(seed); assert.strictEqual(c.maxPain, brute(c.rows).K); }

// Probability uses |delta|
const c = X.build(42), K = c.atm + 200;
const d = M.greeks({ type: 'put', S: c.spot, K: c.atm - 200, T: X.T, vix: c.vix }).delta;
assert(d < 0 && X.prob(c, 'put', c.atm - 200) === Math.abs(d));
assert.strictEqual(X.prob(c, 'call', K), Math.abs(M.greeks({ type: 'call', S: c.spot, K, T: X.T, vix: c.vix }).delta));
assert.deepStrictEqual(X.probChoices(0.34), { right: 35, list: [5, 35, 50] });
assert.deepStrictEqual(X.probChoices(0.02).right, 5);
assert.strictEqual(new Set(X.probChoices(0.5).list).size, 3);

// Questions: answers checked for each kind
const qs = X.questions(c);
assert.strictEqual(qs.length, 8);
assert(qs.every(q => q.why && q.text));
assert(/NIFTY \d{2},\d{3}\.\d\d\./.test(qs[0].text), 'spot in Indian grouping');
assert(X.check(qs[0], { K: c.atm }) && !X.check(qs[0], { K: c.atm + 50 }));
assert(X.check(qs[0], { K: c.atm, type: 'call' }), 'a cell tap on the ATM row still picks the strike');
assert(X.check(qs[1], { K: X.wallK(c, 'ce') }) && !X.check(qs[1], { K: X.wallK(c, 'ce') + 50 }));
assert(/call wall/.test(qs[1].why) && /resistance/.test(qs[1].why));
assert(X.check(qs[2], { K: X.wallK(c, 'pe') }) && /support/.test(qs[2].why));
const dear = X.dearest(c);
assert(c.rows.every(r => r.ce.ltp <= dear.ltp && r.pe.ltp <= dear.ltp));
assert(X.check(qs[3], { K: dear.K, type: dear.type }));
assert(!X.check(qs[3], { K: dear.K }), 'the option question needs a CE or PE, not a strike');
assert(!X.check(qs[3], { K: dear.K, type: dear.type === 'call' ? 'put' : 'call' }));
assert(/intrinsic value/.test(qs[3].why));
assert(/PE: index puts carry higher IV/.test(qs[4].choices[qs[4].answer]));
assert(X.check(qs[4], qs[4].answer) && !X.check(qs[4], (qs[4].answer + 1) % 3));
assert.notDeepStrictEqual([0, 1, 2].map(s => X.questions(X.build(s)).find(q => q.rot != null).rot), [0, 0, 0], 'skew answer position varies');
assert.strictEqual(qs[5].answer, c.pcr > 1 ? 0 : 1); assert(/above 1 means more put OI/.test(qs[5].why));
assert(X.check(qs[6], { K: c.maxPain }) && !X.check(qs[6], { K: c.maxPain + 50 }) && !X.check(qs[6], { K: c.maxPain - 50 }));
assert(/is the lowest/.test(qs[6].why));
// Max pain is worked out row by row: each strike's payout, the answer's the smallest, shown precisely enough to tell apart
assert(qs[6].reveal && /^₹[\d,.]+ crore$/.test(qs[6].payout(c.maxPain)));
for (let seed = 1; seed <= 50; seed++) {
  const cc = X.build(seed), q = X.questions(cc)[6], v = cc.rows.map(r => q.payout(r.K)), m = q.payout(cc.maxPain);
  assert.strictEqual(v.filter(x => x === m).length, 1, 'seed ' + seed + ': max pain payout not unique on screen: ' + m);
}
assert.strictEqual(qs[7].choices[qs[7].answer], '~' + X.probChoices(X.prob(c, 'call', K)).right + '%');
assert(/delta ≈ probability of expiring in the money/.test(qs[7].why));
assert(!X.check(qs[7], (qs[7].answer + 1) % 3));

// Indian grouping for plain numbers
assert.strictEqual(X.num(1234567), '12,34,567');
assert.strictEqual(X.num(-50000), '-50,000');

console.log('chain ok');
