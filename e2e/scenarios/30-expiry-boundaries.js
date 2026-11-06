// Game 3 boundaries: the clock never passes 15:30, +30 from 15:10 settles at 15:30, sell after +5, far OTM held to expiry.
const P = require('../play');
const hm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

async function advanceTo(page, h, target) {
  let t = await P.clock(page);
  while (t + 30 <= target && (await P.visible(page, /^\+\s*30/))) t = await P.tick(page, h, 30);
  while (t + 5 <= target && (await P.visible(page, /^\+\s*5\b/))) t = await P.tick(page, h, 5);
  return t;
}
async function finish(page, h, tag) {
  h.expect(await P.visible(page, P.RESULT), tag + ': no result card');
  const card = await page.locator('#live').innerText();
  if (!/no trade/i.test(card)) {
    const missing = P.ATTRIBUTION.filter((re) => !re.test(card)).map(String);
    h.expect(!missing.length, tag + ': result card lacks ' + missing.join(', '));
  }
  h.expect(!/[−-]0%/.test(card + (await page.locator('#app').innerText())), tag + ': a "−0%" slipped through');
  h.expect(await page.locator('#live .g-wick .wick').count(), tag + ': Wick does not react on the result card');
  await h.shot(tag + '-result');
  await h.clickText(P.RESULT);
}

module.exports = async function expiryBoundaries(page, h) {
  await h.goto(page, 'games/expiry/index.html');
  await h.shot('start');
  h.expect((await page.getByRole('button', { name: /^\d{5}\s*CE/ }).count()) === 9, 'want 9 strikes in the grid, found ' + (await page.getByRole('button', { name: /^\d{5}\s*CE/ }).count()));

  // Watch first, then two-tap Start over puts the clock back to 09:15.
  h.expect(await P.visible(page, /^\+\s*30\s*min/i), 'no +30 min before buying (watch-before-buy)');
  const w = await P.tick(page, h, 30);
  h.expect(w === 9 * 60 + 45, 'watching +30 from 09:15 shows ' + hm(w));
  await P.startOver(page, h, 'expiry');
  h.expect((await P.clock(page)) === 9 * 60 + 15, 'Start over left the clock at ' + hm(await P.clock(page)));

  // Round 1: watch to 15:05, then pick (strikes follow NIFTY, so pick after watching) and buy.
  const t = await advanceTo(page, h, 15 * 60 + 5);
  h.expect(t === 15 * 60 + 5, 'watching could not reach 15:05, clock shows ' + hm(t));
  await h.shot('watched-to-' + hm(t));
  await P.pick(page, h, { type: 'CE', strike: 2 });
  await h.clickText(/^buy\b/i);
  h.expect(await P.visible(page, /sell now/i), 'Buy at 15:05 did not open a position');
  await h.shot('r1-bought-' + hm(await P.clock(page)));
  const t1510 = await advanceTo(page, h, 15 * 60 + 10);
  h.expect(t1510 === 15 * 60 + 10, 'could not reach 15:10, clock shows ' + hm(t1510));
  await h.shot('r1-' + hm(t1510));
  const after = await P.tick(page, h, 30);
  await h.shot('r1-plus30');
  h.expect(after === 15 * 60 + 30, '+30 min from 15:10 landed on ' + hm(after) + ', want 15:30');
  h.expect(/settled|expired/i.test(await h.text()), '+30 from 15:10 did not settle the option');
  await finish(page, h, 'r1');

  // Round 2: 2 lots, buy, +5, reload (same round, clock and position), sell.
  await P.pick(page, h, { type: 'PE', strike: 1, lot: 2 });
  await h.clickText(/^buy\b/i);
  const t2 = await P.clock(page);
  const t2b = await P.tick(page, h, 5);
  h.expect(t2b === t2 + 5, '+5 min moved the clock ' + hm(t2) + ' → ' + hm(t2b));
  await P.reloadSame(page, h, 'expiry-holding', [/sell now/i, /^\+\s*5\b/]);
  h.expect(/2 lots/.test(await page.locator('#app').innerText()), 'reload lost the 2-lot position');
  await h.clickText(/sell now/i);
  h.expect(/you sold/i.test(await h.text()), 'Sell now did not show "You sold"');
  await finish(page, h, 'r2');

  // Round 3: far OTM CE (highest strike), hold to 15:30.
  await P.pick(page, h, { type: 'CE', strike: -1 });
  await h.shot('r3-far-otm');
  await h.clickText(/^buy\b/i);
  for (let i = 0; i < 20 && (await P.visible(page, /^\+\s*30/)); i++) await P.tick(page, h, 30);
  h.expect((await P.clock(page)) === 15 * 60 + 30, 'held to expiry but clock shows ' + hm(await P.clock(page)));
  h.observe('far OTM CE held to 15:30: ' + ((await h.text()).match(/expired worthless|settled in the money/i) || ['?'])[0]);
  await finish(page, h, 'r3');

  // Round 4: watch to 15:30 without buying: the round ends with "No trade today" and the bankroll is untouched.
  const bank4 = await P.bankroll(page);
  for (let i = 0; i < 20 && (await P.visible(page, /^\+\s*30/)); i++) await P.tick(page, h, 30);
  h.expect(/no trade today/i.test(await h.text()), 'watching to 15:30 without buying did not end with "No trade today"');
  h.expect((await P.bankroll(page)) === bank4, 'no trade, but bankroll moved ' + bank4 + ' → ' + (await P.bankroll(page)));
  await finish(page, h, 'r4');

  // Round 5: quick play so the summary appears.
  await P.pick(page, h, { type: 'CE', strike: 2 });
  await h.clickText(/^buy\b/i);
  await P.tick(page, h, 30);
  if (!(await P.visible(page, P.RESULT))) await h.clickText(/sell now/i);
  await finish(page, h, 'r5');
  if (await P.visible(page, /see summary/i)) await h.clickText(/see summary/i);
  await P.dismissReward(page, h, 'expiry');
  const sum = await h.text();
  h.expect(/summary/i.test(sum) && /no trade/i.test(sum), 'summary did not appear or does not list the no-trade round');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.expiry && p.expiry.done, 'progress has no expiry.done: ' + JSON.stringify(p));
  await page.reload({ waitUntil: 'load' });
  h.expect(/summary/i.test(await h.text()) && !(await P.visible(page, /see my results/i)), 'reload of the summary showed the reward screen again');
  h.expect((await P.pathState(page)).games.expiry.plays === 1, 'the path should hold exactly one expiry play after a reload');
};
module.exports.description = 'Game 3: watch + two-tap Start over, watch to 15:05 then buy, +30 from 15:10 = 15:30, 2 lots + reload resumes, far OTM to expiry, no-trade round, summary + progress';
