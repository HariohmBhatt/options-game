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
// The reward screen (reward.js) covers the page after a genuinely new finish: check it, then close it with "See my results".
async function seeResults(page, h, game) {
  const b = page.getByRole('button', { name: /see my results/i });
  if (!h.expect((await b.count()) && (await b.first().isVisible()), game + ': no reward screen after finishing')) return;
  await h.shot(game + '-reward');
  await b.first().click();
  await page.waitForTimeout(150);
  h.expect(!(await page.locator('.rw').count()), game + ': "See my results" did not close the reward screen');
}
// The NIFTY-at-expiry scrubber: arrow keys on the focused chart and a drag both move the readout.
async function scrubber(page, h) {
  const at = () => page.locator('#ro-s').innerText();
  await page.locator('#chart').focus();
  for (let k = 0; k < 5; k++) await page.keyboard.press('ArrowRight');
  h.expect((await at()) === '24,050', 'chart: 5 × ArrowRight from 24,000 shows "' + (await at()) + '", want 24,050');
  await page.waitForTimeout(600);
  const live = await page.locator('#live').innerText();
  h.expect(/^If NIFTY ends at 24,050: .*target [+−]?₹/.test(live), 'chart: live region says "' + live + '"');
  const box = await page.locator('#chart').boundingBox();
  await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  const after = parseFloat((await at()).replace(/,/g, ''));
  h.expect(after < 24000, 'chart: dragging on the left half left the readout at ' + after);
  await h.shot('L1p1-scrubbed');
}

// The strike strip under the chart: arrow keys and a drag both move the strike, snapping to the five strikes, and the
// strike buttons follow.
async function strip(page, h) {
  const st = page.locator('#strip'), now = () => st.getAttribute('aria-valuenow');
  const pressed = async () => (await page.locator('.seg.k button[aria-pressed="true"]').allInnerTexts()).join();
  await st.focus();
  await page.keyboard.press('Home');
  h.expect((await now()) === '23900' && (await pressed()) === '23900', 'strip: Home gave strike ' + (await now()) + ', pressed button ' + (await pressed()));
  await page.keyboard.press('ArrowRight');
  h.expect((await now()) === '23950', 'strip: ArrowRight from 23900 gave ' + (await now()));
  const box = await st.boundingBox(), xs = await page.evaluate(() => { const r = document.getElementById('strip').getBoundingClientRect(); return r.width; });
  // drag from the left end to the right end: the strike snaps to the highest one
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + xs - 4, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  h.expect((await now()) === '24100' && (await pressed()) === '24100', 'strip: dragging right gave strike ' + (await now()));
  await h.shot('L1p2-strip-dragged');
}
// Start over: the first tap only arms it, the second starts a new game at puzzle 1.
async function startOver(page, h) {
  const before = await h.text();
  await h.clickText(/^start over$/i);
  h.expect(await P.visible(page, /tap again/i), 'Start over: first tap did not ask to confirm');
  h.expect((await h.text()).replace(/Tap again to reset/, 'Start over') === before, 'Start over: first tap already changed the game');
  await h.clickText(/tap again/i);
  h.expect((await progress(page)).includes('Level 1 · Puzzle 1 of 8'), 'Start over: second tap did not go to puzzle 1: ' + (await progress(page)));
  await h.shot('start-over');
}

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
    if (j === 0) await scrubber(page, h);
    if (j === 1) await strip(page, h);
    if (j % 2 === 0) {
      const fields = WRONG[(j / 2) % WRONG.length];
      const hint = await guess(page, h, [spoil(legs[0], fields)].concat(legs.slice(1)));
      await h.shot(tag + '-wrong-' + fields.join('+'));
      const unnamed = fields.filter((f) => !NAMES[f].test(hint));
      h.expect(/wrong|right shape/i.test(hint) && !unnamed.length, `${tag}: wrong ${fields.join('+')} gave hint "${hint.slice(0, 100)}" (does not name ${unnamed.join(', ')})`);
      // the hint says which way the bend is, never the answer's strike
      if (fields.includes('K')) h.expect(!hint.includes(String(legs[0].K)), `${tag}: hint gives away the strike ${legs[0].K}: "${hint.slice(0, 120)}"`);
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
  await seeResults(page, h, 'payoff');
  const sum = await h.text();
  h.expect(/Level 1: 4 of 8 · Level 2: 2 of 4/.test(sum), 'summary score wrong, want "Level 1: 4 of 8 · Level 2: 2 of 4", got "' + ((sum.match(/First try[^\n]*/) || ['no summary'])[0]) + '"');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.payoff && p.payoff.done, 'progress has no payoff.done: ' + JSON.stringify(p));
  await page.reload({ waitUntil: 'load' });
  h.expect(/Level 1: 4 of 8 · Level 2: 2 of 4/.test(await h.text()), 'reload on the summary lost it');
  h.expect(!(await page.locator('.rw').count()), 'reload on the summary showed the reward screen again');
  await startOver(page, h);
};
module.exports.description = 'Game 2: 8 puzzles + 4 two-leg spreads via "Add leg 2", wrong-first on half with every wrong field named and no strike given away, scrubber, strike strip (keys + drag), 0.5 s Next guard, summary + progress, two-tap Start over';
