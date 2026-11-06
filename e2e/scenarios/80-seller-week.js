// Game 5, Seller's Week: one full game. Naked rounds 1–3 (OTM PE held, ATM CE bought back on day 2, the gap round),
// then credit spreads (100 wide held, 200 wide on the gap round). Margin shown before every sale, a result card after every round.
const P = require('../play');
const SELL = /^sell \d{5}/i;
// The reward screen (reward.js) covers the page after a genuinely new finish: check it, then close it with "See my results".
async function seeResults(page, h, game) {
  const b = page.getByRole('button', { name: /see my results/i });
  if (!h.expect((await b.count()) && (await b.first().isVisible()), game + ': no reward screen after finishing')) return;
  await h.shot(game + '-reward');
  await b.first().click();
  await page.waitForTimeout(150);
  h.expect(!(await page.locator('.rw').count()), game + ': "See my results" did not close the reward screen');
}
const strikes = (page, type) => page.getByRole('button', { name: new RegExp('^\\d{5}\\s*' + type) });

async function sell(page, h, { type, strike, width }) {
  const tag = 'r' + (await P.round(page));
  await h.clickText(new RegExp('^sell ' + type + '\\b', 'i'));
  if (width) await h.clickText(new RegExp('^' + width + ' points', 'i'));
  const ks = strikes(page, type);
  h.expect((await ks.count()) === 9, tag + ': want 9 strikes in the grid, found ' + (await ks.count()));
  await ks.nth(strike).click();
  await page.waitForTimeout(100);
  const card = await page.locator('#app').innerText();
  h.expect(/Margin blocked\s*₹/.test(card) && /margin ₹/.test(card), tag + ': no margin figure shown before selling');
  if (width) h.expect(/Max loss\s*−?-?₹/.test(card) && /Buy \d{5} (CE|PE) at ask/.test(card), tag + ': spread picker shows no bought leg / max loss');
  await h.shot(tag + '-picked');
  const btn = page.getByRole('button', { name: SELL }).first();
  if (!h.expect(await btn.isEnabled(), tag + ': Sell is disabled (bankroll ' + (await P.bankroll(page)) + ')')) return false;
  await btn.click();
  await page.waitForTimeout(100);
  h.expect(await P.visible(page, /buy back now/i), tag + ': selling did not open a position');
  await P.tagsApart(page, h, tag + ' sold');
  await h.shot(tag + '-sold');
  return true;
}
async function hold(page, h) {
  for (let d = 0; d < 6 && !(await P.visible(page, P.RESULT)); d++) await h.clickText(P.HOLD);
}
async function result(page, h, want, b0, stay) {
  const tag = 'r' + (await P.round(page)), card = await page.locator('#live').innerText();
  h.expect(await P.visible(page, P.RESULT), tag + ': no result card');
  h.expect(/Net P\/L/.test(card) && /Return on margin/.test(card), tag + ': result card has no Net P/L / Return on margin');
  await P.burst(page, h, tag, await P.attribution(page, h, tag), b0);
  h.expect(/▼\s*Sold\b/.test(await page.locator('.chart-key').innerText()), tag + ': the chart key does not show the Sold glyph ▼');
  h.expect(/^NIFTY [\d,]+/.test(await page.locator('#say').textContent()), tag + ': no one-line chart summary for screen readers');
  h.observe(tag + ': ' + (await P.tagsApart(page, h, tag)) + ' axis tags, none overlapping');
  h.expect(await page.locator('#live .g-wick .wick').count(), tag + ': Wick does not react on the result card');
  h.expect(await page.locator('.chartwrap[role=img] canvas').count(), tag + ': no candle chart');
  if (want) h.expect(want.test(card), tag + ': result card title does not match ' + want);
  await P.story(page, h, tag);
  // A spread settled past both strikes shows what settlement took (the full width × 65) as its own row, and the story says so.
  const past = /past both strikes: the full \d+-point width/.test(card);
  if (past) h.expect(/paid out the full \d+-point width/.test(card) && /past both your strikes/.test(card) && /that is the max loss/.test(card) && !/Time passed/.test(card),
    tag + ': capped spread has no settlement row / max-loss sentence, or still shows Greek rows');
  h.observe(tag + ': ' + (past ? 'spread settled past both strikes' : 'not a capped spread'));
  await h.shot(tag + '-result');
  if (!stay) await h.clickText(P.RESULT);
}

module.exports = async function sellerWeek(page, h) {
  await page.addInitScript(P.BURSTS);
  await h.goto(page, 'games/seller/index.html');
  await h.shot('start');
  h.expect(/Round 1 of 5/.test(await h.text()) && /Naked: sold with no hedge/.test(await h.text()), 'round 1 is not a naked round, or the word Naked has no gloss');

  // R1: sell an OTM PE (two strikes below the middle) and hold to expiry.
  let b0 = await P.bursts(page);
  if (await sell(page, h, { type: 'PE', strike: 2 })) { await hold(page, h); await result(page, h, /expired/i, b0); }

  // R2: sell the ATM CE, one day, reload (same round/day/position), buy back.
  if (await sell(page, h, { type: 'CE', strike: 4 })) {
    await h.clickText(/next day/i);
    await P.reloadSame(page, h, 'seller-holding', [/buy back now/i, P.HOLD]);
    await h.clickText(/buy back now/i);
    await result(page, h, /bought it back/i, 0, true); // 0: a new page load since the reload
    // A reload on the result card shows it again, with no second burst.
    await page.reload({ waitUntil: 'load' });
    h.expect((await P.visible(page, P.RESULT)) && (await P.bursts(page)) === 0, 'r2: reload of the result card lost it or burst again');
    await h.clickText(P.RESULT);
  }

  // R3: the forced gap day (naked).
  b0 = await P.bursts(page);
  if (await sell(page, h, { type: 'PE', strike: 2 })) {
    await hold(page, h);
    h.expect(/Monday news/.test(await h.text()), 'r3: gap round shows no Monday news');
    await result(page, h, null, b0);
  }

  // R4: 100-wide credit spread, held.
  h.expect(/Round 4 of 5/.test(await h.text()) && /Hedged: a bought option/.test(await h.text()), 'round 4 is not a spread round');
  b0 = await P.bursts(page);
  if (await sell(page, h, { type: 'PE', strike: 3, width: 100 })) { await hold(page, h); await result(page, h, null, b0); }

  // R5: 200-wide credit spread on the gap round.
  b0 = await P.bursts(page);
  if (await sell(page, h, { type: 'CE', strike: 5, width: 200 })) { await hold(page, h); await result(page, h, null, b0); }
  await seeResults(page, h, 'seller');

  const sum = await h.text();
  h.expect(/Summary/.test(sum) && /Total net/.test(sum) && /gap day/.test(sum), 'summary missing or does not mark the gap days');
  h.expect((sum.match(/^#\d /gm) || []).length === 5, 'summary does not list 5 rounds');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.seller && p.seller.done, 'progress has no seller.done: ' + JSON.stringify(p));
  await page.reload({ waitUntil: 'load' });
  h.expect(/Summary/.test(await h.text()), 'reload on the summary lost it');
  h.expect(!(await page.locator('.rw').count()), 'reload on the summary showed the reward screen again');

  await h.clickText(/play again/i);
  await P.startOver(page, h, 'seller');
  h.expect((await P.bankroll(page)) === 200000, 'Start over left bankroll at ₹' + (await P.bankroll(page)));
  await h.shot('started-over');
  await P.lowBankroll(page, h, 'seller', 'games/seller/index.html', 'optionsgames.seller.bankroll', 200000);
};
module.exports.description = "Game 5: OTM PE held, ATM CE bought back day 2 (+reload), gap round, 100- and 200-wide spreads, margin before each sale, summary + progress, two-tap Start over, P/L story matches the table, settlement rows at expiry (full-width row on a capped spread), axis tags apart, Sold glyph, chart summary, a burst per winning round (not on reload), low bankroll → Start over only";
