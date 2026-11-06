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

// A position settled at expiry gets settlement rows, not Greeks: premium, settlement, charges; they add up to the net.
const capRows = R.settlement({ sell: true, type: 'put', K: 23900, K2: 23800, S: 23453.6, qty: 65, premium: 2165, settle: 6500, net: -4428 });
assert.deepStrictEqual(Object.keys(capRows.rows), ['received', 'payout', 'charges']);
assert.strictEqual(capRows.why.payout, 'NIFTY ended 23,454, past both strikes: the full 100-point width × 65');
assert.strictEqual(Math.round(capRows.rows.charges), -93);
const sb = R.breakdown(capRows.rows, capRows.why, -4428, String);
assert.deepStrictEqual(sb.match(/<tr[^>]*><td>[^<]+/g).map((s) => s.replace(/<[^>]+>/g, '')), ['Premium received', 'Paid out at settlement', 'Charges', 'Net P/L']);
assert(!/Time passed|NIFTY moved/.test(sb), 'a settled spread shows Greek rows');
const lapsed = R.settlement({ type: 'call', K: 24000, S: 23910.5, qty: 65, premium: 3686, settle: 0, net: -3721 });
assert.deepStrictEqual(Object.keys(lapsed.rows), ['paid', 'settle', 'charges']);
assert(/below your 24000 strike: worth ₹0/.test(lapsed.why.settle), lapsed.why.settle);

// The lead-in reads as a sentence about the biggest row, with the row's own value (signed).
assert(R.story({ rows: { direction: -400, time: 7758, vol: 0, gamma: 0, costs: -60 }, net: 7298, seller: true }, String).startsWith('Time did most of the work: +7758 of time value melted in your favour.'));
assert(R.story({ rows: { direction: -2894, time: 500, vol: 0, gamma: -10, costs: -60 }, net: -2464 }, String).startsWith('NIFTY moving against you cost the most: -2894.'));

// One P/L story: for every outcome of the three price games, the paragraph opens with the table's biggest row (the one Wick's
// line is about) and its value, never a figure grouped differently; the rows add up to the net; a position settled at expiry
// shows settlement rows, and a spread settled past both strikes says so.
const Market = require('../market.js'), Ticket = require('../games/ticket/logic.js'), Expiry = require('../games/expiry/logic.js'), Seller = require('../games/seller/logic.js');
const fmt = Market.fmt, LEFTOVER = /Most of this|Biggest factor|biggest driver|Greeks shifting|Biggest line/;
const WORD = { direction: /^NIFTY moving/, time: /^Time /, vol: /^The VIX change/, gamma: /^Gamma/, costs: /^The spread and charges/,
  paid: /^The premium you paid/, settle: /^The settlement/, received: /^The premium did/, payout: /^Paying out at settlement/, charges: /^Charges/ };
const GREEK = ['direction', 'time', 'vol', 'gamma', 'costs'], SETTLED = ['paid', 'received', 'settle', 'payout', 'charges'];
let n = 0, capped = 0, settled = 0, worthless = 0;
function check(tag, o, atExpiry) {
  const k = R.main(o.rows, o.net), p = R.story(o, fmt), sum = Object.values(o.rows).reduce((a, v) => a + v, 0), v = o.rows[k];
  assert(Math.abs(sum - o.net) < 0.05, tag + ': rows add to ' + sum + ', net ' + o.net);
  assert(Object.keys(o.rows).every((x) => (atExpiry ? SETTLED : GREEK).includes(x)), tag + ': ' + (atExpiry ? 'settled position shows Greek rows' : 'closed position shows settlement rows'));
  if (atExpiry) settled++;
  const first = p.slice(0, p.indexOf('. ') + 1 || p.length);
  assert(WORD[k].test(first) && first.includes((v > 0 ? '+' : '') + fmt(v)), tag + ': paragraph does not open with ' + k + ' ' + fmt(v) + ': ' + p);
  assert(!LEFTOVER.test(p), tag + ': paragraph keeps a differently grouped figure: ' + p);
  // Wick's line is about the same row: it reads the same with every other row zeroed.
  const l = R.line(o), only = Object.assign({}, ...Object.keys(o.rows).map((x) => ({ [x]: x === k ? v : 0 })));
  if (o.lapsed) assert(/never got past/.test(l), tag);
  else if (o.capped) {
    capped++;
    assert(k === 'payout' && /past both strikes/.test(l) && /past both your strikes/.test(p) && p.includes('full ' + o.capped.width + '-point width'), tag + ': capped spread: ' + l + ' / ' + p);
  }
  else assert.strictEqual(l, R.line({ rows: only, net: o.net, seller: o.seller, worthless: o.worthless }), tag + ': Wick talks about another row');
  // A sold option that settled at ₹0 says so, in Wick's line and the paragraph, never "outweighed anything settlement took".
  if (o.worthless && k === 'received') { worthless++; assert(/expired worthless/.test(l) && /expired worthless/.test(p) && !/outweighed/.test(l), tag + ': worthless expiry: ' + l + ' / ' + p); }
  n++;
}
for (let seed = 1; seed <= 12; seed++) for (const type of ['call', 'put']) for (const K of [Ticket.STRIKES[0], Ticket.STRIKES[Ticket.STRIKES.length - 1]]) for (const exit of [0, 1, 2, 9]) {
  const r = Ticket.newRound(seed, 1e6); Ticket.buy(r, type, K, 1);
  for (let d = 0; d < exit && !r.result; d++) Ticket.nextDay(r);
  if (!r.result) Ticket.sell(r);
  const res = r.result, t = r.ticket, exp = res.how !== 'sold';
  const set = exp && R.settlement({ type: t.type, K: t.K, S: res.S, qty: t.qty, premium: t.premium * t.qty, settle: res.exit * t.qty, net: res.net });
  check('ticket ' + [seed, type, K, exit], { rows: set ? set.rows : R.rows.ticket(res), net: res.net, risk: t.premium * t.qty, lapsed: res.how === 'lapsed', why: res.why }, exp);
}
for (let seed = 1; seed <= 12; seed++) for (const type of ['call', 'put']) for (const j of [1, 4, 7]) for (const hold of [5, 60, 400]) {
  const r = Expiry.newRound(seed, 1e6); Expiry.advance(r, 30); const K = Expiry.strikes(r)[j];
  Expiry.buy(r, type, K, 1); Expiry.advance(r, hold); if (!r.result) Expiry.sellNow(r);
  const res = r.result, pos = r.pos, exp = res.how !== 'sold';
  const set = exp && R.settlement({ type: pos.type, K: pos.K, S: res.S, qty: pos.qty, premium: pos.buy * pos.qty, settle: res.exit * pos.qty, net: res.net });
  check('expiry ' + [seed, type, j, hold], { rows: set ? set.rows : R.rows.expiry(res), net: res.net, risk: pos.buy * pos.qty, lapsed: res.how === 'lapsed', why: res.why }, exp);
}
for (let seed = 1; seed <= 10; seed++) for (const no of [1, 3, 4, 5]) for (const type of ['call', 'put']) for (const K of [Seller.STRIKES[2], Seller.STRIKES[4], Seller.STRIKES[6]]) for (const days of [0, 2, 9]) {
  const r = Seller.newRound(no, seed * 100 + no, 1e6); Seller.open(r, type, K, 100);
  for (let d = 0; d < days && !r.result; d++) Seller.nextDay(r);
  if (!r.result) Seller.buyBack(r);
  const pos = r.pos, res = r.result, exp = res.how === 'expiry';
  const set = exp && R.settlement({ sell: true, type: pos.type, K: pos.K, K2: pos.width && pos.legs[1].K, S: res.S, qty: Seller.LOT, premium: pos.received, settle: res.paid, net: res.net });
  check('seller ' + [seed, no, type, K, days], { rows: set ? set.rows : R.rows.seller(r, Seller), net: res.net, risk: pos.received, seller: true, why: res.why, capped: set && set.capped, worthless: set && set.worthless }, exp);
}
assert(capped > 0, 'no spread settled past both strikes in the sample');
assert(settled > 0, 'no position settled at expiry in the sample');
assert(worthless > 0, 'no worthless seller expiry in the sample');
console.log('result story ok: ' + n + ' outcomes, ' + settled + ' settled at expiry, ' + capped + ' capped spreads, ' + worthless + ' expired worthless');
