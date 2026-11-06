// Game 1 as an impatient, clumsy player. State surprises are observations; crashes, double actions and lost cards are failures.
const P = require('../play');
module.exports = async function ticketImpatient(page, h) {
  await h.goto(page, 'games/ticket/index.html');
  await h.shot('start');

  // 1. Buy before choosing anything (force: a disabled Buy must ignore the tap), then pick a strike and buy.
  const buy0 = page.getByRole('button', { name: /^(buy\b|pick a strike to buy)/i }).first();
  const disabled = await buy0.isDisabled();
  await buy0.click({ force: true });
  await page.waitForTimeout(120);
  await h.shot('buy-before-choosing');
  const bought = await P.visible(page, /sell now/i);
  h.expect(!(disabled && bought), 'a disabled Buy bought anyway');
  h.observe('Buy before choosing: ' + (disabled ? 'disabled until a strike is picked' : bought ? 'bought the pre-selected default option' : 'enabled but nothing happened'));
  if (!bought) { await P.pick(page, h, { type: 'CE', strike: 1 }); await h.clickText(/^buy\b/i); }

  // 2. Rapid-tap Next day 10× (synchronous clicks, faster than any render).
  const clicks = await page.evaluate(() => {
    let n = 0;
    for (let i = 0; i < 10; i++) {
      const b = [...document.querySelectorAll('button')].find((x) => /next day|hold to/i.test(x.textContent));
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
  // The bankroll also pays the buy charges (shown on their own line), so one lot is premium + a few tens of rupees, two would be ~2×.
  h.expect(paid >= want && paid < want * 1.5, 'double-tap Buy charged ₹' + paid.toFixed(2) + ', one lot costs ₹' + want + ' + charges');

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

  // 6. Reload mid-round with a position open: the same round, day, bankroll and position come back.
  await P.pick(page, h, { type: 'CE', strike: 0, lot: 2 });
  await h.clickText(/^buy\b/i);
  await h.clickText(/next day/i);
  await h.shot('before-reload');
  await P.reloadSame(page, h, 'holding', [/sell now/i, P.HOLD]);
  h.expect(/2 lots/.test(await page.locator('#app').innerText()), 'reload lost the 2-lot position');
  // and on a result card
  await h.clickText(/sell now/i);
  await P.reloadSame(page, h, 'result', [P.RESULT]);
  h.expect(/Net P\/L/.test(await page.locator('body').innerText()), 'result card after reload has no Net P/L line');
  await h.clickText(P.RESULT);

  // 7. Browser back mid-round, then forward: the open position is still there (saved state, not only bfcache).
  await P.pick(page, h, { type: 'PE', strike: 0 });
  await h.clickText(/^buy\b/i);
  const r7 = await P.round(page);
  await h.goto(page, 'index.html');
  await h.goto(page, 'games/ticket/index.html'); // the path hub opens games from a sheet, so arrive by URL
  await page.goBack(); await page.waitForLoadState('load');
  h.expect(/^Options Games/.test(await page.title()), 'browser back did not return to the hub');
  await h.shot('back');
  await page.goForward(); await page.waitForLoadState('load');
  await h.shot('forward');
  h.expect(/NIFTY Weekly/.test(await page.title()), 'browser forward did not return to Game 1');
  h.expect((await P.round(page)) === r7 && (await P.visible(page, /sell now/i)), 'back then forward lost the open position in round ' + r7);

  // 8. Open the game URL directly in a fresh tab, no hub: it resumes the same round.
  const tab = await page.context().newPage();
  await h.goto(tab, 'games/ticket/index.html');
  h.expect((await P.round(tab)) === r7 && (await P.visible(tab, /sell now/i)), 'direct URL open did not resume round ' + r7);
  await h.shot('direct-url', tab);
  await tab.close();

  // 9. Start over needs two taps and resets the bankroll.
  await P.startOver(page, h, 'ticket');
  h.expect((await P.bankroll(page)) === 100000, 'Start over left bankroll at ₹' + (await P.bankroll(page)));
  h.expect(await P.visible(page, /^(buy\b|pick a strike to buy)/i), 'Start over did not show the picker');
  await h.shot('started-over');

  // 10. A bankroll too small for the cheapest lot (the judge's ₹2,294 dead end) gets only "Start over with ₹1,00,000".
  await P.lowBankroll(page, h, 'ticket', 'games/ticket/index.html', 'optionsgames.ticket.bankroll', 100000);
};
module.exports.description = 'Game 1: buy before choosing, 10× Next day, double Buy, double Sell, disabled tap, reload resumes (holding + result), back/forward, direct URL, two-tap Start over, low bankroll → Start over only';
