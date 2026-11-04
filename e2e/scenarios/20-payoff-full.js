// Game 2: all 8 Level 1 puzzles and the 4 Level 2 spreads. Every other one gets a deliberate wrong guess first (one or two wrong
// fields) and the hint must name every wrong field; then the right answer. Next ignores taps for 0.5 s after it appears.
const P = require('../play');
const FROZEN = 1762230000000; // fixed Date.now at load so the puzzle list can be read back from Payoff.puzzles(seed)
const ALT = { side: { buy: 'sell', sell: 'buy' }, type: { call: 'put', put: 'call' } };
const NAMES = { side: /side/i, type: /type/i, K: /strike/i };
const WRONG = [['side'], ['type', 'K'], ['K'], ['side', 'type']];

async function guess(page, h, legs) {
  for (let i = 0; i < legs.length; i++) {
    if (i && (await P.visible(page, /add leg 2/i))) await h.clickText(/add leg 2/i);
    await P.payoffSet(page, h, legs[i], i);
  }
  await h.clickText(/^check$/i);
  return page.locator('#result').innerText();
}
function spoil(leg, fields) {
  const w = Object.assign({}, leg);
  for (const f of fields) w[f] = f === 'K' ? (w.K === 24000 ? 24100 : 24000) : ALT[f][w[f]];
  return w;
}
const progress = (page) => page.locator('#progress').innerText();

module.exports = async function payoffFull(page, h) {
  // Frozen only while the page loads (that is when the puzzles are drawn): the 0.5 s Next guard needs a real clock.
  await page.addInitScript((t) => { const real = Date.now; Date.now = () => (document.readyState === 'loading' ? t : real()); }, FROZEN);
  await h.goto(page, 'games/payoff/index.html');
  await h.shot('start');
  const lists = await page.evaluate((t) => { try { return [Payoff.puzzles(t), Payoff.SPREADS]; } catch (e) { return null; } }, FROZEN);
  if (!h.expect(lists && lists[0].length === 8 && lists[1].length === 4, 'could not read 8 puzzles + 4 spreads: ' + JSON.stringify(lists && lists.map((l) => l.length)))) return;
  const all = lists[0].map((t) => [t]).concat(lists[1].map((s) => s.legs));
  for (let j = 0; j < all.length; j++) {
    const legs = all[j], tag = (j < 8 ? 'L1p' + (j + 1) : 'L2p' + (j - 7));
    h.expect((await progress(page)).includes('Puzzle ' + ((j % 8) + 1) + ' of ' + (j < 8 ? 8 : 4)), tag + ': progress shows "' + (await progress(page)) + '"');
    await h.shot(tag + '-target');
    if (j % 2 === 0) {
      const fields = WRONG[(j / 2) % WRONG.length];
      const hint = await guess(page, h, [spoil(legs[0], fields)].concat(legs.slice(1)));
      await h.shot(tag + '-wrong-' + fields.join('+'));
      const unnamed = fields.filter((f) => !NAMES[f].test(hint));
      h.expect(/wrong|right shape/i.test(hint) && !unnamed.length, `${tag}: wrong ${fields.join('+')} gave hint "${hint.slice(0, 100)}" (does not name ${unnamed.join(', ')})`);
    }
    const res = await guess(page, h, legs);
    const next = /next puzzle|level 2|see results/i;
    if (j === 0 && (await P.visible(page, next))) { // a tap right after Next appears (a double-tap on Check) is ignored
      await page.getByRole('button', { name: next }).first().click();
      h.expect((await progress(page)).includes('Puzzle 1 of 8'), 'Next tapped within 0.5 s skipped puzzle 1');
    }
    h.expect(/correct/i.test(res), tag + ': right answer ' + JSON.stringify(legs) + ' not accepted: "' + res.slice(0, 80) + '"');
    await h.shot(tag + '-correct');
    if (!h.expect(await P.visible(page, next), tag + ': no Next button after a correct answer')) break;
    await page.waitForTimeout(550);
    await h.clickText(next);
  }
  const sum = await h.text();
  h.expect(/Level 1: 4 of 8 · Level 2: 2 of 4/.test(sum), 'summary score wrong, want "Level 1: 4 of 8 · Level 2: 2 of 4", got "' + ((sum.match(/First try[^\n]*/) || ['no summary'])[0]) + '"');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.payoff && p.payoff.done, 'progress has no payoff.done: ' + JSON.stringify(p));
};
module.exports.description = 'Game 2: 8 puzzles + 4 two-leg spreads via "Add leg 2", wrong-first on half with every wrong field named, 0.5 s Next guard, summary + progress';
