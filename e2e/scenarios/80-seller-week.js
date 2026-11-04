// Game 5, Seller's Week: one full game. Naked rounds 1–3 (OTM PE held, ATM CE bought back on day 2, the gap round),
// then credit spreads (100 wide held, 200 wide on the gap round). Margin shown before every sale, a result card after every round.
const P = require('../play');
const SELL = /^sell \d{5}/i;
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
  await h.shot(tag + '-sold');
  return true;
}
async function hold(page, h) {
  for (let d = 0; d < 6 && !(await P.visible(page, P.RESULT)); d++) await h.clickText(/next day|hold through/i);
}
async function result(page, h, want) {
  const tag = 'r' + (await P.round(page)), card = await page.locator('#app').innerText();
  h.expect(await P.visible(page, P.RESULT), tag + ': no result card');
  h.expect(/Net P\/L/.test(card) && /Return on margin/.test(card), tag + ': result card has no Net P/L / Return on margin');
  if (want) h.expect(want.test(card), tag + ': result card title does not match ' + want);
  await h.shot(tag + '-result');
  await h.clickText(P.RESULT);
}

module.exports = async function sellerWeek(page, h) {
  await h.goto(page, 'games/seller/index.html');
  await h.shot('start');
  h.expect(/Round 1 of 5 · Naked/.test(await h.text()), 'round 1 is not a naked round');

  // R1: sell an OTM PE (two strikes below the middle) and hold to expiry.
  if (await sell(page, h, { type: 'PE', strike: 2 })) { await hold(page, h); await result(page, h, /expired/i); }

  // R2: sell the ATM CE, one day, reload (same round/day/position), buy back.
  if (await sell(page, h, { type: 'CE', strike: 4 })) {
    await h.clickText(/next day/i);
    await P.reloadSame(page, h, 'seller-holding', [/buy back now/i, /next day|hold through/i]);
    await h.clickText(/buy back now/i);
    await result(page, h, /bought it back/i);
  }

  // R3: the forced gap day (naked).
  if (await sell(page, h, { type: 'PE', strike: 2 })) {
    await hold(page, h);
    h.expect(/Monday news/.test(await h.text()), 'r3: gap round shows no Monday news');
    await result(page, h);
  }

  // R4: 100-wide credit spread, held.
  h.expect(/Round 4 of 5 · Hedged/.test(await h.text()), 'round 4 is not a spread round');
  if (await sell(page, h, { type: 'PE', strike: 3, width: 100 })) { await hold(page, h); await result(page, h); }

  // R5: 200-wide credit spread on the gap round.
  if (await sell(page, h, { type: 'CE', strike: 5, width: 200 })) { await hold(page, h); await result(page, h); }

  const sum = await h.text();
  h.expect(/Summary/.test(sum) && /Total net/.test(sum) && /gap day/.test(sum), 'summary missing or does not mark the gap days');
  h.expect((sum.match(/^#\d /gm) || []).length === 5, 'summary does not list 5 rounds');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.seller && p.seller.done, 'progress has no seller.done: ' + JSON.stringify(p));
  await page.reload({ waitUntil: 'load' });
  h.expect(/Summary/.test(await h.text()), 'reload on the summary lost it');

  await h.clickText(/play again/i);
  await P.startOver(page, h, 'seller');
  h.expect((await P.bankroll(page)) === 200000, 'Start over left bankroll at ₹' + (await P.bankroll(page)));
  await h.shot('started-over');
};
module.exports.description = "Game 5: OTM PE held, ATM CE bought back day 2 (+reload), gap round, 100- and 200-wide spreads, margin before each sale, summary + progress, two-tap Start over";
