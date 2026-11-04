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
  await h.shot(tag + '-result');
  await h.clickText(P.RESULT);
}

module.exports = async function expiryBoundaries(page, h) {
  await h.goto(page, 'games/expiry/index.html');
  await h.shot('start');

  // Round 1: if the clock runs before buying (watch-before-buy), wait to ~15:05 and buy; else buy at the open and run to 15:10.
  await P.pick(page, h, { type: 'CE', strike: 2 });
  const watchFirst = await P.visible(page, /^\+\s*(5|30)\s*min/i);
  h.observe('clock buttons before buying: ' + (watchFirst ? 'yes' : 'no, buy happens at 09:15'));
  if (watchFirst) { const t = await advanceTo(page, h, 15 * 60 + 5); await h.shot('watched-to-' + hm(t)); await P.pick(page, h, { type: 'CE', strike: 2 }); }
  await h.clickText(/^buy\b/i);
  await h.shot('r1-bought-' + hm(await P.clock(page)));
  const t1510 = await advanceTo(page, h, 15 * 60 + 10);
  h.expect(t1510 === 15 * 60 + 10, 'could not reach 15:10, clock shows ' + hm(t1510));
  await h.shot('r1-' + hm(t1510));
  const after = await P.tick(page, h, 30);
  await h.shot('r1-plus30');
  h.expect(after === 15 * 60 + 30, '+30 min from 15:10 landed on ' + hm(after) + ', want 15:30');
  h.expect(/settled|expired/i.test(await h.text()), '+30 from 15:10 did not settle the option');
  await finish(page, h, 'r1');

  // Round 2: buy, +5, sell.
  await P.pick(page, h, { type: 'PE', strike: 1 });
  await h.clickText(/^buy\b/i);
  const t2 = await P.clock(page);
  const t2b = await P.tick(page, h, 5);
  h.expect(t2b === t2 + 5, '+5 min moved the clock ' + hm(t2) + ' → ' + hm(t2b));
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

  // Rounds 4-5: quick plays so the summary appears.
  for (let r = 4; r <= 5 && !(await P.visible(page, /see summary/i)); r++) {
    await P.pick(page, h, { type: r === 4 ? 'PE' : 'CE', strike: 2 });
    await h.clickText(/^buy\b/i);
    await P.tick(page, h, 30);
    if (!(await P.visible(page, P.RESULT))) await h.clickText(/sell now/i);
    await finish(page, h, 'r' + r);
  }
  if (await P.visible(page, /see summary/i)) await h.clickText(/see summary/i);
  h.expect(/summary/i.test(await h.text()), 'summary did not appear');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.expiry && p.expiry.done, 'progress has no expiry.done: ' + JSON.stringify(p));
};
module.exports.description = 'Game 3: +30 from 15:10 = 15:30, buy/+5/sell, far OTM to expiry, summary + progress';
