// Game 2: every puzzle. Half get a deliberate wrong guess first (a different wrong field each time), then the right answer.
const P = require('../play');
const FROZEN = 1762230000000; // fixed Date.now so the puzzle list can be read back from Payoff.puzzles(seed)
const ALT = { side: { buy: 'sell', sell: 'buy' }, type: { call: 'put', put: 'call' } };
const NAMES = { side: /side/i, type: /type/i, K: /strike/i };

async function guess(page, h, g) {
  const legs = g.legs || [g];
  for (let i = 0; i < legs.length; i++) await P.payoffSet(page, h, legs[i], i);
  await h.clickText(/^check$/i);
  return page.locator('#result, [aria-live]').first().innerText();
}
// No readable answer (seeding changed): brute force like a stubborn human, reading the hint each time.
async function bruteForce(page, h) {
  const Ks = (await page.getByRole('button', { name: /^\d{5}$/ }).allInnerTexts()).map(Number);
  for (const side of ['buy', 'sell']) for (const type of ['call', 'put']) for (const K of Ks)
    if (/correct/i.test(await guess(page, h, { side, type, K }))) return true;
  return false;
}

module.exports = async function payoffFull(page, h) {
  await page.addInitScript((t) => { Date.now = () => t; }, FROZEN);
  await h.goto(page, 'games/payoff/index.html');
  await h.shot('start');
  const list = await page.evaluate((t) => { try { return Payoff.puzzles(t); } catch (e) { return null; } }, FROZEN);
  h.expect(list && list.length, 'could not read the puzzle list, falling back to brute force');
  const total = list ? list.length : 20;
  for (let i = 0; i < total; i++) {
    if (await page.getByText(/You got \d+ of/).count()) break;
    const t = list && list[i];
    await h.shot('p' + (i + 1) + '-target');
    if (t && t.legs) h.observe('puzzle ' + (i + 1) + ' is two-leg: ' + JSON.stringify(t.legs));
    if (t && i % 2 === 0) {
      const field = ['side', 'type', 'K'][(i / 2) % 3];
      const wrong = Object.assign({}, t.legs ? t.legs[0] : t);
      wrong[field] = field === 'K' ? (wrong.K === 24000 ? 24100 : 24000) : ALT[field][wrong[field]];
      const hint = await guess(page, h, t.legs ? Object.assign({}, t, { legs: [wrong].concat(t.legs.slice(1)) }) : wrong);
      await h.shot('p' + (i + 1) + '-wrong-' + field);
      h.expect(/wrong|right shape/i.test(hint) && NAMES[field].test(hint), `puzzle ${i + 1}: wrong ${field} gave hint "${hint.slice(0, 80)}"`);
    }
    const ok = t ? /correct/i.test(await guess(page, h, t)) : await bruteForce(page, h);
    h.expect(ok, 'puzzle ' + (i + 1) + ': right answer ' + JSON.stringify(t) + ' not accepted');
    await h.shot('p' + (i + 1) + '-correct');
    if (!(await P.visible(page, /next puzzle|see results/i))) break;
    await h.clickText(/next puzzle|see results/i);
  }
  const sum = await h.text();
  h.expect(/You got \d+ of \d+/.test(sum), 'summary did not appear');
  // Only the puzzles answered right first time score: the odd-numbered half.
  if (list) h.expect(new RegExp('You got ' + Math.floor(total / 2) + ' of ' + total).test(sum), 'score line wrong, want ' + Math.floor(total / 2) + ' of ' + total);
  h.observe((sum.match(/You got \d+ of \d+[^\n]*/) || ['no score'])[0]);
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.payoff && p.payoff.done, 'progress has no payoff.done: ' + JSON.stringify(p));
};
module.exports.description = 'Game 2: all puzzles, wrong-first on half with hint check, two-leg aware, summary + progress';
