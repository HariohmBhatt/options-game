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
  const sum = await h.text();
  h.expect(/summary/i.test(sum), 'summary did not appear after 5 rounds');
  h.expect(/×2\b/.test(sum) && /×3\b/.test(sum), 'summary does not list the 2-lot and 3-lot rounds');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.ticket && p.ticket.done, 'progress has no ticket.done: ' + JSON.stringify(p));

  // Play again keeps the bankroll the summary shows.
  const bank = parseFloat(((sum.match(/Bankroll:\s*₹\s*([\d,.-]+)/) || [, 'NaN'])[1]).replace(/,/g, ''));
  await h.clickText(/play again/i);
  h.expect((await P.round(page)) === 1 && Math.abs((await P.bankroll(page)) - bank) < 1, 'Play again: want round 1 with ₹' + bank + ', got round ' + (await P.round(page)) + ' with ₹' + (await P.bankroll(page)));
  await h.shot('play-again');

  await h.goto(page, 'index.html');
  h.expect(/done/i.test(await page.locator('#b-ticket, .badge').first().innerText()), 'hub badge not updated after finishing Game 1');
  await h.shot('hub-badge');
};
module.exports.description = 'Game 1: 5 rounds, CE/PE, 1–3 lots, sell day 1 / last day / hold to expiry, attribution rows, summary, Play again keeps bankroll';
