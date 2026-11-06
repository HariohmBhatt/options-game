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
  await h.goto(page, 'games/ticket/index.html');
  await h.shot('start');
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
  h.expect((await P.pathState(page)).games.ticket.plays === 1, 'reload of the summary recorded another play');

  // Play again keeps the bankroll the summary shows.
  const bank = parseFloat(((sum.match(/Bankroll:?\s*₹\s*([\d,.-]+)/) || [, 'NaN'])[1]).replace(/,/g, ''));
  await h.clickText(/play again/i);
  h.expect((await P.round(page)) === 1 && Math.abs((await P.bankroll(page)) - bank) < 1, 'Play again: want round 1 with ₹' + bank + ', got round ' + (await P.round(page)) + ' with ₹' + (await P.bankroll(page)));
  await h.shot('play-again');

  // The path hub reads the same state: the first-trade badge is earned.
  await h.goto(page, 'index.html');
  h.expect((await P.pathState(page)).badges['first-trade'], 'finishing Game 1 did not earn the first-trade badge');
  await h.shot('hub-after');
};
module.exports.description = 'Game 1: 5 rounds, CE/PE, 1–3 lots, sell day 1 / last day / hold to expiry, attribution rows, summary, reward screen once (not on reload), Play again keeps bankroll';
