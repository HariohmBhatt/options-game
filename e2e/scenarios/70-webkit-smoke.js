// WebKit (Safari engine) smoke: hub and one round of each game.
const P = require('../play');
module.exports = async function webkitSmoke(page, h) {
  await h.goto(page, 'index.html');
  await h.shot('hub');
  await h.goto(page, 'games/ticket/index.html');
  await P.ticketRound(page, h, { type: 'PE', strike: 1, exit: 'day1' });
  h.expect((await P.round(page)) === 2, 'Game 1 did not reach round 2');
  await h.goto(page, 'games/payoff/index.html');
  await h.shot('payoff');
  let solved = false;
  for (const side of ['buy', 'sell']) for (const type of ['call', 'put']) for (const K of (await page.getByRole('button', { name: /^\d{5}$/ }).allInnerTexts()))
    if (!solved) { await P.payoffSet(page, h, { side, type, K }); await h.clickText(/^check$/i); solved = await P.visible(page, /next puzzle/i); }
  h.expect(solved, 'Game 2 puzzle 1 never solved');
  await h.shot('payoff-solved');
  await h.goto(page, 'games/expiry/index.html');
  await P.pick(page, h, { type: 'CE', strike: 2 });
  await h.clickText(/^buy\b/i);
  await P.tick(page, h, 5);
  await h.clickText(/sell now/i);
  h.expect(/you sold/i.test(await h.text()), 'Game 3 sell did not show "You sold"');
  await h.shot('expiry-result');
  await h.goto(page, 'games/seller/index.html');
  await h.clickText(/^sell \d{5}/i);
  await h.clickText(/buy back now/i);
  h.expect(/Net P\/L/.test(await h.text()), "Seller's Week buy back did not show a result card");
  await h.shot('seller-result');
};
module.exports.browsers = ['webkit'];
module.exports.description = "WebKit: hub + one round of Games 1, 2, 3 and 5";
