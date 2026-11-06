const assert = require('assert');
const E = require('../engine.js');
const L = require('../lessons/content.js');
const Dial = require('../lessons/dial.js');
const M = require('../market.js');
const P = require('../games/payoff/logic.js');

const IDS = { 'u1-l1': 1, 'u1-l2': 1, 'u2-l1': 2, 'u2-l2': 2, 'u3-l1': 3, 'u3-l2': 3, 'u4-l1': 4, 'u4-l2': 4, 'u5-l1': 5, 'u5-l2': 5 };
assert.deepStrictEqual(L.ids, Object.keys(IDS));

const words = s => s.trim().split(/\s+/).length;
const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
// Every ₹ amount in Indian grouping: ₹1,00,000 not ₹100,000; decimals only as paise (₹7.80).
function rupees(s, where) {
  (s.match(/₹\d+(,\d+)*(\.\d+)?/g) || []).forEach(t => {
    const n = Number(t.slice(1).replace(/,/g, ''));
    const want = '₹' + (t.includes('.') ? new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 }).format(n) : inr.format(n));
    assert.strictEqual(t, want, 'grouping in ' + where);
  });
}
function text(s, max, where) {
  assert(typeof s === 'string' && s.length > 0 && s.length <= max, where + ' length ' + (s && s.length) + ': ' + s);
  assert(!s.includes('!'), 'exclamation in ' + where);
  assert(!/\b(unlock|powerful|seamless)/i.test(s), 'banned word in ' + where);
  rupees(s, where);
}
function validLeg(l) {
  return ['buy', 'sell'].includes(l.side) && ['call', 'put'].includes(l.type) && l.K % 50 === 0 && l.K >= 23800 && l.K <= 24200;
}
// P/L shape at expiry, premiums ignored: the sum of each leg's signed intrinsic value.
const LEVELS = [23500, 23800, 23900, 24000, 24050, 24100, 24200, 24500];
const shape = c => LEVELS.map(S => [].concat(c).reduce((a, l) => a + (l.side === 'buy' ? 1 : -1) * E.payoff(l.type, S, l.K), 0)).join();

// A dial's axis and range: shared by questions and teach-card dials.
function dialShape(d, at) {
  assert(['expiry', 'days', 'strike', 'spot'].includes(d.dial), at + ' dial axis ' + d.dial);
  if (d.dial === 'spot') assert(d.days > 0 && d.days <= 4 && !Array.isArray(d.pos), at + ' spot dial needs days left and one leg');
  assert(d.x.min < d.x.max && d.x.start >= d.x.min && d.x.start <= d.x.max && d.x.step > 0, at + ' dial range');
  if (d.dial === 'strike') assert(['call', 'put'].includes(d.pos.type) && d.pos.K === undefined, at + ' strike dial pos');
  else [].concat(d.pos).forEach(l => assert(validLeg(Object.assign({}, l, { K: 24000 })) && l.K % 50 === 0 && Math.abs(l.K - 24000) <= 500, at + ' dial leg ' + JSON.stringify(l)));
  if (d.dial === 'days') assert(d.x.max <= 4 && d.pos.K, at + ' days dial runs inside the 4-day week');
}

const kinds = {};
L.ids.forEach(id => {
  const ls = L.LESSONS[id];
  assert.strictEqual(ls.unit, IDS[id], id + ' unit');
  text(ls.title, 40, id + ' title');
  assert.strictEqual(ls.teach.length, 3, id + ' teach count');
  ls.teach.forEach((c, i) => {
    const at = id + ' teach ' + i;
    // Every card has exactly one thing to touch and a try line that says what to do; 30 words with that line.
    assert(c && typeof c === 'object', at + ' is plain text: give it something to touch');
    const vis = ['dial', 'chain', 'lot', 'cases', 'quote', 'margin'].filter(k => c[k]);
    assert.strictEqual(vis.length, 1, at + ' needs exactly one visual, has ' + vis);
    text(c.text, 220, at);
    text(c.try, 80, at + ' try'); assert(/^(Drag|Step|Tap|Sold)/.test(c.try), at + ' try line should start with what to do');
    const n = words(c.text) + words(c.try);
    assert(n <= 30, at + ' has ' + n + ' words');
    if (c.lot) assert(c.lot.pts > 0 && (!c.lot.label || c.lot.label.length <= 12), at + ' lot calculator');
    if (c.dial) { dialShape(c.dial, at); assert.strictEqual(c.dial.answer, undefined, at + ' explore dial has no answer'); }
    if (c.cases) {
      text(c.cases.head, 80, at + ' cases head'); assert.strictEqual(c.cases.pick.length, 2, at + ' two outcomes');
      c.cases.pick.forEach(p => {
        text(p.label, 18, at + ' outcome label'); assert(p.rows.length >= 1 && p.rows.length <= 2, at + ' outcome rows');
        p.rows.forEach(r => { text(r[0], 24, at + ' who'); assert(Number.isFinite(r[1]) && r[1] !== 0, at + ' ₹ ' + r[1]); text(r[2], 90, at + ' note'); });
      });
    }
    if (c.quote) { const o = L.quote(c.quote); assert(o.bid < o.mid && o.mid < o.ask && o.gap > 0, at + ' quote'); }
    if (c.margin) { const o = L.margin(c.margin, 1); assert(o.premium > 0 && o.margin > o.premium, at + ' margin'); }
    if (c.chain) {
      assert(c.chain.rows.length === 3 && c.chain.notes.length === 3 && c.chain.rows.includes(c.chain.spot), at + ' chain rows');
      c.chain.rows.forEach(K => assert(K % 50 === 0, at + ' strike ' + K));
      if (c.chain.oi) assert(c.chain.oi.length === 3 && c.chain.oi.every(r => r.length === 2), at + ' chain OI');
      c.chain.notes.forEach(n => text(n, 120, at + ' note'));
    }
  });
  assert.strictEqual(ls.questions.length, 6, id + ' question count');

  const used = new Set(), answers = new Set();
  let longest = 0; // the right answer should not be the giveaway longest option
  ls.questions.forEach((q, i) => {
    const at = id + ' q' + (i + 1);
    used.add(q.kind); kinds[q.kind] = (kinds[q.kind] || 0) + 1;
    text(q.prompt, 120, at + ' prompt');
    text(q.why, 200, at + ' why');
    if (q.kind === 'truefalse') { assert.strictEqual(typeof q.answer, 'boolean', at); answers.add(String(q.answer)); return; }
    if (q.kind === 'dial') {
      dialShape(q, at);
      assert(q.answer > q.x.min && q.answer <= q.x.max && q.tol >= 0, at + ' dial answer in range');
      // The goal is crossed in the step that ends at the answer, and the start position is not already right.
      const a = Dial.f(q, q.answer) - q.goal, b = Dial.f(q, q.answer - q.x.step) - q.goal;
      assert(a * b <= 1e-6, at + ' goal not crossed at the answer: ' + a + ', ' + b);
      assert.strictEqual(Dial.verdict(q, q.x.start), 'wrong', at + ' start is already right');
      assert.strictEqual(Dial.verdict(q, q.answer), 'right', at + ' answer is not right');
      text(Dial.answerText(q), 60, at + ' answer text');
      return;
    }
    if (q.kind === 'match') {
      assert(q.pairs.length >= 3 && q.pairs.length <= 4, at + ' pairs');
      q.pairs.forEach(p => { assert.strictEqual(p.length, 2, at); text(p[0], 60, at + ' term'); text(p[1], 60, at + ' meaning'); });
      assert.strictEqual(new Set(q.pairs.map(p => p[0])).size, q.pairs.length, at + ' duplicate term');
      assert.strictEqual(new Set(q.pairs.map(p => p[1])).size, q.pairs.length, at + ' duplicate meaning');
      return;
    }
    assert(['choice', 'payoff', 'numbers'].includes(q.kind), at + ' unknown kind ' + q.kind);
    const n = q.choices.length;
    assert(q.kind === 'choice' ? n >= 2 && n <= 4 : q.kind === 'payoff' ? n >= 2 && n <= 3 : n === 3, at + ' choice count');
    assert(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < n, at + ' answer index');
    answers.add(String(q.answer));
    if (q.kind === 'payoff') {
      q.choices.forEach(c => assert([].concat(c).length > 0 && [].concat(c).every(validLeg), at + ' leg ' + JSON.stringify(c)));
      assert.strictEqual(new Set(q.choices.map(shape)).size, n, at + ' two choices draw the same curve');
      return;
    }
    q.choices.forEach(c => text(c, 60, at + ' choice'));
    if (q.choices.every((c, j) => j === q.answer || c.length < q.choices[q.answer].length)) longest++;
    assert.strictEqual(new Set(q.choices).size, n, at + ' duplicate choice');
    if (q.kind === 'numbers') {
      q.choices.forEach(c => assert(/₹|NIFTY|points/.test(c), at + ' choice needs ₹ or points: ' + c));
      assert(q.calc && typeof q.calc.expr === 'string', at + ' needs calc');
      assert(/^[\d\s.+\-*/(),Mathaxmin]+$/.test(q.calc.expr), at + ' calc has unexpected characters');
      const want = Function('return (' + q.calc.expr + ')')();
      const got = Number(q.choices[q.answer].replace(/[^\d.]/g, ''));
      assert(Math.abs(want - got) < 0.005, at + ': calc ' + want + ' vs answer ' + got);
      q.choices.forEach((c, j) => j === q.answer || assert(Number(c.replace(/[^\d.]/g, '')) !== got, at + ' a wrong choice equals the answer'));
    }
  });
  assert(used.size >= 3, id + ' uses only ' + used.size + ' kinds');
  assert(used.has('payoff') || used.has('numbers') || used.has('dial'), id + ' needs a payoff, numbers or dial question');
  assert(longest <= 1, id + ': the right answer is the longest choice in ' + longest + ' questions');
  assert(answers.size > 1, id + ' correct answers all in the same position');
});

// The numbers on the teach cards, worked out again from market.js and the payoff maths.
{
  const T = (id, i) => L.LESSONS[id].teach[i], atm = M.premium({ type: 'call', S: 24000, K: 24000, T: 4 / 252 });
  assert.strictEqual(atm, 168.9); assert.strictEqual(P.premium('put', 24000), atm, 'ATM CE and PE cost the same at 24,000');
  // u1-l1: a right, not an obligation. Buyer and seller mirror each other; below the strike the buyer loses only the premium.
  const right = T('u1-l1', 0).cases.pick;
  [[23800, 0], [24300, 300]].forEach(([S, itm], k) => {
    const [buyer, seller] = right[k].rows, want = (itm - atm) * 65;
    assert(right[k].label.endsWith(S.toLocaleString('en-IN')), 'u1-l1 outcome ' + S);
    assert(Math.abs(buyer[1] - want) < 0.01 && Math.abs(seller[1] + want) < 0.01, 'u1-l1 P/L at ' + S + ': ' + buyer[1] + ', ' + seller[1]);
    if (itm) assert(buyer[2].includes('₹19,500') && seller[2].includes('₹19,500'), 'u1-l1 payout 300 × 65');
    else assert(/only the premium/.test(buyer[2]) && /Keeps the premium/.test(seller[2]), 'u1-l1 lapse');
  });
  // u1-l2: buy at the ask, sell at the bid; the gap is ₹26 a lot on the ATM CE.
  const q = L.quote(T('u1-l2', 2).quote);
  assert.deepStrictEqual([q.bid, q.mid, q.ask], [168.7, 168.9, 169.1]);
  assert.strictEqual(M.fmt(q.gap), '₹26'); assert.strictEqual(M.fmt(q.buy), '₹10,992'); assert.strictEqual(M.fmt(q.sell), '₹10,966');
  assert.strictEqual(q.buyCharges, M.charges({ side: 'buy', premium: 169.1, qty: 65 }).total);
  assert(q.sellCharges > q.buyCharges, 'selling pays STT on top');
  // u2-l1: the bought PE breaks even at 24,000 − 168.90 = 23,831.10.
  const pe = T('u2-l1', 1);
  assert(pe.try.includes(Math.floor(24000 - atm).toLocaleString('en-IN')) && Math.abs(Dial.f(pe.dial, 24000 - atm)) < 0.01, 'u2-l1 PE breakeven');
  // u3-l1: at 15:30 the 23,900 CE is worth its 100 points of intrinsic value, 100 × 65 = ₹6,500.
  const it = T('u3-l1', 0).dial;
  assert.strictEqual(it.goal, 6500); assert(T('u3-l1', 0).try.includes('₹6,500'));
  assert(Math.abs(Dial.f(it, 4) - 6500) < 0.01 && Dial.f(it, 3) > 6500, 'u3-l1 premium lands on intrinsic');
  // u3-l2: the 24,450 CE, 26.40 points, ₹1,716 a lot.
  assert.strictEqual(T('u3-l2', 2).lot.pts, 26.4); assert.strictEqual(M.fmt(26.4 * 65), '₹1,716');
  // u4-l1: each row's note quotes that strike's CE and PE.
  const ch = T('u4-l1', 0).chain;
  ch.rows.forEach((K, r) => assert(ch.notes[r].includes(P.pts(P.premium('call', K))) && ch.notes[r].includes(P.pts(P.premium('put', K))), 'u4-l1 note ' + K));
  // u4-l2: PCR 4.5 ÷ 5.1 = 0.88, and max pain is the strike where holders are paid least.
  const oi = T('u4-l2', 1).chain, sum = j => oi.oi.reduce((a, r) => a + r[j], 0);
  assert(Math.abs(sum(0) - 5.1) < 1e-9 && Math.abs(sum(1) - 4.5) < 1e-9 && (sum(1) / sum(0)).toFixed(2) === '0.88', 'u4-l2 PCR');
  assert(T('u4-l2', 1).text.includes('4.5 ÷ 5.1 = 0.88'));
  const crore = S => oi.rows.reduce((a, K, j) => a + (oi.oi[j][0] * Math.max(0, S - K) + oi.oi[j][1] * Math.max(0, K - S)) * 1e5 * 65 / 1e7, 0);
  const pays = oi.rows.map(crore); assert.deepStrictEqual(pays.map(Math.round), [176, 91, 208]);
  oi.notes.forEach((note, r) => assert.strictEqual(/max pain/.test(note), pays[r] === Math.min(...pays), 'u4-l2 max pain note ' + r));
  assert(oi.notes[1].includes('₹52 crore') && oi.notes[1].includes('₹39 crore'), oi.notes[1]);
  // u5-l1: ₹1,24,800 margin a lot against ₹10,979 premium: over 11 times. STT 0.15% of the premium.
  const mg = T('u5-l1', 1);
  [1, 3].forEach(n => {
    const o = L.margin(mg.margin, n);
    assert.strictEqual(o.margin, M.shortMargin({ index: 'NIFTY', S: 24000, lots: n })); assert.strictEqual(o.premium, atm * 65 * n);
    assert(Math.abs(o.stt - 0.0015 * o.premium) < 1e-9, 'u5-l1 STT');
  });
  assert(mg.text.includes(M.fmt(M.shortMargin({ index: 'NIFTY', S: 24000 }))), 'u5-l1 margin in the text');
  assert(Math.floor(124800 / (atm * 65)) === 11 && /over 11 times/.test(mg.try), 'u5-l1 margin ratio');
  // u5-l2: a slide fills the stop at 250; a 3% gap open fills at the first PE price, 722.40, with 3 days left.
  const [slide, gap] = T('u5-l2', 1).cases.pick, gapFill = M.premium({ type: 'put', S: 24000 * 0.97, K: 24000, T: 3 / 252 });
  assert.strictEqual(gapFill, 722.4);
  assert(Math.abs(slide.rows[0][1] + (250 - atm) * 65) < 0.01 && Math.abs(gap.rows[0][1] + (gapFill - atm) * 65) < 0.01, 'u5-l2 fills');
  assert(gap.rows[0][0].includes('722.40') && gap.rows[0][2].includes('23,280'), 'u5-l2 gap note');
}

// Spot dial: premium = intrinsic + time, and the time part is never negative.
{
  const q = { dial: 'spot', pos: { side: 'buy', type: 'call', K: 24000 }, days: 4 };
  assert.strictEqual(Math.round(Dial.f(q, 24000)), 10979, 'ATM CE with 4 days left');
  assert(/^₹12,825 = ₹3,250 intrinsic \+ ₹9,575 time$/.test(Dial.valueText(q, Dial.f(q, 24050), 24050)), Dial.valueText(q, Dial.f(q, 24050), 24050));
}
// A dial result says the pick, how far off and whether it counts.
{
  const q = L.LESSONS['u2-l1'].questions.find(x => x.kind === 'dial');
  assert.strictEqual(Dial.result(q, 24030), 'You picked 24,030, 138.90 points off; within 20 points counts, so this is a miss.');
  assert(/so this is right/.test(Dial.result(q, 24170)));
  const h = L.LESSONS['u3-l1'].questions.find(x => x.kind === 'dial');
  assert(/15 minutes off; within 15 minutes counts, so this is right/.test(Dial.result(h, 3.72)), Dial.result(h, 3.72));
}

// Daily review: same six all day, only from finished lessons, every kind before a repeat, unit 1 when nothing is finished.
{
  const all = L.ids.reduce((m, id) => (L.LESSONS[id].questions.forEach(q => m.set(q, id)), m), new Map());
  const done = ['u1-l1', 'u2-l1', 'u3-l2'];
  const a = L.daily(done, '2026-11-06'), b = L.daily(done, '2026-11-06'), c = L.daily(done, '2026-11-07');
  assert.strictEqual(a.title, 'Daily review'); assert.strictEqual(a.teach.length, 0);
  assert.strictEqual(a.questions.length, 6); assert.deepStrictEqual(a.questions, b.questions, 'daily mix changes within a day');
  assert.notDeepStrictEqual(a.questions.map(q => q.prompt), c.questions.map(q => q.prompt), 'daily mix is the same on the next day');
  assert.strictEqual(new Set(a.questions).size, 6, 'daily repeats a question');
  a.questions.concat(c.questions).forEach(q => assert(done.includes(all.get(q)), 'daily question from an unfinished lesson: ' + q.prompt));
  const ks = a.questions.map(q => q.kind); assert.strictEqual(new Set(ks).size, Math.min(6, new Set([].concat(...done.map(id => L.LESSONS[id].questions.map(q => q.kind)))).size), 'daily mix repeats a kind too early: ' + ks);
  L.daily([], '2026-11-06').questions.forEach(q => assert(['u1-l1', 'u1-l2'].includes(all.get(q)), 'fallback is not unit 1'));
  L.daily(['u1-play', 'daily'], '2026-11-06').questions.forEach(q => assert(['u1-l1', 'u1-l2'].includes(all.get(q)), 'non-lesson nodes count as lessons'));
}

console.log('lessons ok', JSON.stringify(kinds));
