// Game 1 as a beginner: five rounds, mixing CE/PE, strikes, exits (and lots when the game offers them).
const P = require('../play');
const PLAN = [
  { type: 'CE', strike: 1, exit: 'day1' },
  { type: 'PE', strike: 1, exit: 'expiry' },
  { type: 'CE', strike: 0, exit: 'lastday', lot: 2 },
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
  h.expect(/summary/i.test(await h.text()), 'summary did not appear after 5 rounds');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.ticket && p.ticket.done, 'progress has no ticket.done: ' + JSON.stringify(p));
  await h.goto(page, 'index.html');
  h.expect(/done/i.test(await page.locator('#b-ticket, .badge').first().innerText()), 'hub badge not updated after finishing Game 1');
  await h.shot('hub-badge');
};
module.exports.description = 'Game 1: 5 rounds, CE/PE, strikes, sell day 1 / last day / hold to expiry, summary + progress';
