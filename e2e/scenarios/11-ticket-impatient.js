// Game 1 as an impatient, clumsy player. State surprises are observations; crashes, double actions and lost cards are failures.
const P = require('../play');
module.exports = async function ticketImpatient(page, h) {
  await h.goto(page, 'games/ticket/index.html');
  await h.shot('start');

  // 1. Buy before choosing anything.
  const bank0 = await P.bankroll(page);
  await h.clickText(/^buy\b/i);
  await h.shot('buy-before-choosing');
  h.observe('Buy before choosing: ' + ((await P.visible(page, /sell now/i)) ? 'bought the pre-selected default option' : 'nothing happened'));

  // 2. Rapid-tap Next day 10× (synchronous clicks, faster than any render).
  const clicks = await page.evaluate(() => {
    let n = 0;
    for (let i = 0; i < 10; i++) {
      const b = [...document.querySelectorAll('button')].find((x) => /next day|hold through/i.test(x.textContent));
      if (!b) break; b.click(); n++;
    }
    return n;
  });
  await h.shot('rapid-next-day');
  h.expect(await P.visible(page, P.RESULT), 'after ' + clicks + ' rapid Next day taps the result card is missing');
  h.expect((await P.round(page)) === 1, 'rapid Next day taps skipped past round 1 (now round ' + (await P.round(page)) + ')');
  h.observe('rapid Next day: ' + clicks + ' taps registered before expiry, then the button was gone');
  await h.clickText(P.RESULT);

  // 3. Double-tap Buy: only one lot may be bought.
  const b2 = await P.bankroll(page);
  await P.pick(page, h, { type: 'PE', strike: 1 });
  const cost = await page.getByRole('button', { name: /^buy\b/i }).first().innerText();
  await page.getByRole('button', { name: /^buy\b/i }).first().dblclick();
  await page.waitForTimeout(200);
  await h.shot('double-buy');
  const paid = b2 - (await P.bankroll(page)), want = parseFloat((cost.match(/₹\s*([\d,.]+)/) || [, 'NaN'])[1].replace(/,/g, ''));
  h.expect(Math.abs(paid - want) < 1, 'double-tap Buy charged ₹' + paid.toFixed(2) + ', one lot costs ₹' + want);

  // 4. Tap Sell twice: the result card must stay on screen, not be skipped by the second tap.
  await page.getByRole('button', { name: /sell now/i }).first().dblclick();
  await page.waitForTimeout(200);
  await h.shot('double-sell');
  h.expect((await P.round(page)) === 2 && (await P.visible(page, P.RESULT)), 'double-tap Sell skipped the result card (round ' + (await P.round(page)) + ')');
  if (await P.visible(page, P.RESULT)) await h.clickText(P.RESULT);

  // 5. Tap a disabled button with force, like a stray thumb. Game 1 has none, so use Game 2's Check before picking.
  h.observe('Game 1 shows ' + (await page.locator('button:disabled').count()) + ' disabled buttons; tapping Game 2 Check instead');
  const p2 = await page.context().newPage();
  await h.goto(p2, 'games/payoff/index.html');
  const dis = p2.locator('button:disabled').first();
  if (await dis.count()) {
    const before = await h.text(p2);
    await dis.click({ force: true });
    h.expect((await h.text(p2)) === before, 'tapping a disabled button changed the page');
    await h.shot('disabled-tap', p2);
  } else h.observe('no disabled button in Game 2 either');
  await p2.close();

  // 6. Reload mid-round with a position open.
  await P.pick(page, h, { type: 'CE', strike: 0 });
  await h.clickText(/^buy\b/i);
  await h.clickText(/next day/i);
  const mid = { bank: await P.bankroll(page), round: await P.round(page) };
  await h.shot('before-reload');
  await page.reload();
  await h.shot('after-reload');
  const after = { bank: await P.bankroll(page), round: await P.round(page), pos: await P.visible(page, /sell now/i) };
  h.observe(`reload mid-round: bankroll ${mid.bank} → ${after.bank} (${after.bank === mid.bank ? 'kept, premium already debited' : 'changed'}), ` +
    `round ${mid.round} → ${after.round}, open position ${after.pos ? 'kept' : 'lost (premium is gone with it)'}`);

  // 7. Browser back mid-round, then forward.
  await h.goto(page, 'index.html');
  await h.goto(page, 'games/ticket/index.html'); // by URL: the hub link opens a directory listing on file:// (see 00-hub)
  await h.clickText(/^buy\b/i);
  await page.goBack(); await page.waitForLoadState('load');
  h.expect(/Options Games/.test(await page.title()), 'browser back did not return to the hub');
  await h.shot('back');
  await page.goForward(); await page.waitForLoadState('load');
  await h.shot('forward');
  h.expect(/NIFTY Weekly/.test(await page.title()), 'browser forward did not return to Game 1');
  h.observe('back then forward: open position ' + ((await P.visible(page, /sell now/i)) ? 'restored (bfcache)' : 'gone, new round shown'));

  // 8. Open the game URL directly in a fresh tab, no hub.
  const tab = await page.context().newPage();
  await h.goto(tab, 'games/ticket/index.html');
  h.expect(await P.visible(tab, /^buy\b/i), 'direct URL open: no Buy button');
  await h.shot('direct-url', tab);
  await tab.close();
};
module.exports.description = 'Game 1: buy before choosing, double Buy, 10× Next day, double Sell, disabled tap, reload, back/forward, direct URL';
