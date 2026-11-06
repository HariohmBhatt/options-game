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

// One P/L story: for every outcome of the three price games, the paragraph cites the table's biggest row (the one Wick's line is
// about) by its table name and value, never a figure grouped differently; the rows add up to the net; a spread settled past
// both strikes says so.
const Market = require('../market.js'), Ticket = require('../games/ticket/logic.js'), Expiry = require('../games/expiry/logic.js'), Seller = require('../games/seller/logic.js');
const fmt = Market.fmt, LEFTOVER = /Most of this|Biggest factor|biggest driver|Greeks shifting/;
let n = 0, capped = 0;
function check(tag, o) {
  const k = R.main(o.rows, o.net), p = R.story(o, fmt), sum = Object.values(o.rows).reduce((a, v) => a + v, 0);
  assert(Math.abs(sum - o.net) < 0.05, tag + ': rows add to ' + sum + ', net ' + o.net);
  assert(p.includes('Biggest line in the table: ' + R.NAME[k] + ', ' + fmt(o.rows[k]) + '.'), tag + ': paragraph does not cite ' + k + ': ' + p);
  assert(!LEFTOVER.test(p), tag + ': paragraph keeps a differently grouped figure: ' + p);
  // Wick's line is about the same row: it reads the same with every other row zeroed.
  const l = R.line(o), only = { direction: 0, time: 0, vol: 0, gamma: 0, costs: 0, [k]: o.rows[k] };
  if (o.lapsed) assert(/never got past/.test(l), tag);
  else if (o.capped) { capped++; assert(/beyond both strikes/.test(l) && /beyond both your strikes/.test(p), tag + ': capped spread: ' + l + ' / ' + p); }
  else assert.strictEqual(l, R.line({ rows: only, net: o.net, seller: o.seller }), tag + ': Wick talks about another row');
  n++;
}
for (let seed = 1; seed <= 12; seed++) for (const type of ['call', 'put']) for (const K of [Ticket.STRIKES[0], Ticket.STRIKES[Ticket.STRIKES.length - 1]]) for (const exit of [0, 1, 2, 9]) {
  const r = Ticket.newRound(seed, 1e6); Ticket.buy(r, type, K, 1);
  for (let d = 0; d < exit && !r.result; d++) Ticket.nextDay(r);
  if (!r.result) Ticket.sell(r);
  check('ticket ' + [seed, type, K, exit], { rows: R.rows.ticket(r.result), net: r.result.net, risk: r.ticket.premium * r.ticket.qty, lapsed: r.result.how === 'lapsed', why: r.result.why });
}
for (let seed = 1; seed <= 12; seed++) for (const type of ['call', 'put']) for (const j of [1, 4, 7]) for (const hold of [5, 60, 400]) {
  const r = Expiry.newRound(seed, 1e6); Expiry.advance(r, 30); const K = Expiry.strikes(r)[j];
  Expiry.buy(r, type, K, 1); Expiry.advance(r, hold); if (!r.result) Expiry.sellNow(r);
  check('expiry ' + [seed, type, j, hold], { rows: R.rows.expiry(r.result), net: r.result.net, risk: r.pos.buy * r.pos.qty, lapsed: r.result.how === 'lapsed', why: r.result.why });
}
for (let seed = 1; seed <= 10; seed++) for (const no of [1, 3, 4, 5]) for (const type of ['call', 'put']) for (const K of [Seller.STRIKES[2], Seller.STRIKES[4], Seller.STRIKES[6]]) for (const days of [0, 2, 9]) {
  const r = Seller.newRound(no, seed * 100 + no, 1e6); Seller.open(r, type, K, 100);
  for (let d = 0; d < days && !r.result; d++) Seller.nextDay(r);
  if (!r.result) Seller.buyBack(r);
  const pos = r.pos, res = r.result, K2 = pos.width && pos.legs[1].K;
  const past = pos.width && res.how === 'expiry' && (type === 'call' ? res.S >= K2 : res.S <= K2);
  check('seller ' + [seed, no, type, K, days], { rows: R.rows.seller(r, Seller), net: res.net, risk: pos.received, seller: true, why: res.why,
    capped: past ? { S: res.S, sold: pos.K, bought: K2, loss: pos.maxLoss } : null });
}
assert(capped > 0, 'no spread settled past both strikes in the sample');
console.log('result story ok: ' + n + ' outcomes, ' + capped + ' capped spreads');
