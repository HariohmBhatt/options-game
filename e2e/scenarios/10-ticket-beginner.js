// Game 1 as a beginner: five rounds mixing CE/PE, strikes, 1–3 lots and exits; result cards with attribution; Play again keeps the bankroll.
const P = require('../play');
const PLAN = [
  { type: 'CE', strike: 1, exit: 'day1' },
  { type: 'PE', strike: 1, exit: 'expiry', lot: 2 },
  { type: 'CE', strike: 0, exit: 'lastday', lot: 3 },
  { type: 'PE', strike: -1, exit: 'day1' },
  { type: 'CE', strike: -1, exit: 'expiry' },
];
module.exports = async function ticketBeginner(page, h) {
  await page.addInitScript(P.BURSTS); // a winning round bursts once (ticketRound checks), never on a reload
  await h.goto(page, 'games/ticket/index.html');
  await h.shot('start');
  h.expect(/Pick CE or PE, then a strike/.test(await h.text()), 'first visit shows no tip for the first tap');
  // Scroll past the big price: the header folds to one 48 px line and nothing below it moves.
  const y0 = await page.locator('#app').evaluate((el) => el.getBoundingClientRect().top + scrollY);
  await page.evaluate(() => window.scrollTo(0, 300)); await page.waitForTimeout(150);
  const mini = await page.locator('.g-head').evaluate((el) => ({ on: el.classList.contains('is-mini'), h: el.getBoundingClientRect().height }));
  const y1 = await page.locator('#app').evaluate((el) => el.getBoundingClientRect().top + scrollY);
  h.expect(mini.on && mini.h <= 49, 'header did not fold to one line after scrolling: ' + JSON.stringify(mini));
  h.expect(Math.abs(y1 - y0) < 1, 'folding the header moved the page by ' + (y1 - y0) + 'px');
  await h.shot('compact-header');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(150);
  h.expect(!(await page.locator('.g-head.is-mini').count()), 'header stayed folded back at the top');
  for (const o of PLAN) {
    if (await P.visible(page, /see summary/i)) break;
    await P.ticketRound(page, h, o);
  }
  if (await P.visible(page, /see summary/i)) await h.clickText(/see summary/i);
  await P.dismissReward(page, h, 'ticket');
  const sum = await h.text();
  h.expect(/summary/i.test(sum), 'summary did not appear after 5 rounds');
  h.expect(/×2\b/.test(sum) && /×3\b/.test(sum), 'summary does not list the 2-lot and 3-lot rounds');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.ticket && p.ticket.done, 'progress has no ticket.done: ' + JSON.stringify(p));
  const ps = await P.pathState(page);
  h.expect(ps.games && ps.games.ticket && ps.games.ticket.plays === 1, 'the path did not record one ticket play: ' + JSON.stringify(ps.games));
  // A reload of the finished game shows the summary again but must not record a second play.
  await page.reload({ waitUntil: 'load' });
  h.expect(/summary/i.test(await h.text()) && !(await P.visible(page, /see my results/i)), 'reload of the summary showed the reward screen again');
  h.expect((await P.bursts(page)) === 0, 'a reload burst confetti again');
  h.expect((await P.pathState(page)).games.ticket.plays === 1, 'reload of the summary recorded another play');

  // Play again keeps the bankroll the summary shows.
  const bank = parseFloat(((sum.match(/Bankroll:?\s*₹\s*([\d,.-]+)/) || [, 'NaN'])[1]).replace(/,/g, ''));
  // A bad week can leave too little for even 1 lot: then the game offers only Start over, which resets the bankroll.
  if (!(await P.visible(page, /play again/i)) && (await P.visible(page, /start over with/i))) {
    h.observe('bankroll ₹' + bank + ' cannot buy 1 lot: only Start over offered');
    await h.clickText(/start over with/i);
    h.expect((await P.round(page)) === 1 && (await P.bankroll(page)) === 100000, 'Start over: want round 1 with ₹1,00,000, got ₹' + (await P.bankroll(page)));
  } else {
    await h.clickText(/play again/i);
    h.expect((await P.round(page)) === 1 && Math.abs((await P.bankroll(page)) - bank) < 1, 'Play again: want round 1 with ₹' + bank + ', got round ' + (await P.round(page)) + ' with ₹' + (await P.bankroll(page)));
  }
  await h.shot('play-again');
  h.expect(!/Pick CE or PE, then a strike/.test(await h.text()), 'the first-visit tip came back after the first buy');

  // The path hub reads the same state: the first-trade badge is earned.
  await h.goto(page, 'index.html');
  h.expect((await P.pathState(page)).badges['first-trade'], 'finishing Game 1 did not earn the first-trade badge');
  await h.shot('hub-after');
};
module.exports.description = 'Game 1: first-visit tip once, compact header without layout jump, 5 rounds, CE/PE, 1–3 lots, sell day 1 / last day / hold to expiry, attribution rows (settlement rows at expiry), one Buy glyph, axis tags apart, a burst on each winning round, summary, reward screen once (not on reload), Play again keeps bankroll';
