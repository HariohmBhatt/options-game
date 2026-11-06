// Game 4, Read the Chain: answer all 8 questions (Q1: tap the ATM row from the spot shown; others: a plausible row or the
// first choice), use the OI / IV / OI change toggle once, an explanation after every answer, then the summary.
// SKIPs while games/chain/index.html is not in this checkout (it is merged from another branch).
const fs = require('fs');
const path = require('path');
const P = require('../play');
const NAV = /^(show\s*(oi|iv)|next|see |start over|play again|← all games)/i;
const NEXT = /^(next|see (summary|results))/i;

// The reward screen (reward.js) covers the page after a genuinely new finish: check it, then close it with "See my results".
async function seeResults(page, h, game) {
  const b = page.getByRole('button', { name: /see my results/i });
  if (!h.expect((await b.count()) && (await b.first().isVisible()), game + ': no reward screen after finishing')) return;
  await h.shot(game + '-reward');
  await b.first().click();
  await page.waitForTimeout(150);
  h.expect(!(await page.locator('.rw').count()), game + ': "See my results" did not close the reward screen');
}
const spot = async (page) => {
  const m = (await page.locator('body').innerText()).match(/(?:NIFTY|spot)[^\d\n]{0,20}([\d,]{5,}(?:\.\d+)?)/i);
  return m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
};
// Answer targets in the table: buttons/rows with a 5-digit strike, with that strike.
const rows = (page) => page.locator('table').first().evaluate((t) =>
  [...t.querySelectorAll('tbody tr')].map((tr, i) => ({ i, K: +((tr.querySelector('td.k [data-k]') || {}).dataset || {}).k || NaN })));
async function tapRow(page, i) {
  // Strike questions take the strike cell; option questions ("Tap a CE or PE price") take the CE price.
  const cell = /tap a ce or pe price/i.test(await page.locator('body').innerText()) ? 'td.ltp button' : 'td.k button';
  await page.locator('table').first().locator('tbody tr').nth(i).locator(cell).first().click();
}
async function choices(page) {
  const all = page.locator('button:visible');
  const out = [];
  for (let i = 0; i < (await all.count()); i++) {
    const b = all.nth(i), t = (await b.innerText()).trim();
    if (!NAV.test(t) && !(await b.evaluate((el) => !!el.closest('table'))) && (await b.isEnabled())) out.push(b);
  }
  return out;
}

// Question 1 asks for the ATM strike, so the chain must not mark it until that is answered.
const atmMarked = (page) => page.evaluate(() => !!document.querySelector('tr.atm') || [...document.querySelectorAll('table [aria-label]')].some((b) => /ATM/.test(b.getAttribute('aria-label'))));
const qNo = async (page) => +((await page.locator('#q').innerText()).match(/Question (\d+) of 8/) || [])[1];

module.exports = async function readTheChain(page, h) {
  if (!fs.existsSync(path.join(h.ROOT, 'games/chain/index.html'))) return h.skip('games/chain/index.html is not in this checkout yet (Game 4 is merged from another branch)');
  await h.goto(page, 'games/chain/index.html');
  await h.shot('start');
  h.expect(await page.locator('table').count(), 'no option chain table');
  let toggled = false;
  for (let q = 1; q <= 8; q++) {
    await page.waitForTimeout(450); // the game ignores taps in the first 400 ms of a question (double-tap guard)
    const before = await h.text();
    if (q === 2 && !toggled) {
      toggled = await P.visible(page, /show iv/i);
      if (h.expect(toggled, 'no "Show IV" toggle')) { await h.clickText(/show iv/i); await h.shot('q2-show-iv'); h.expect(/IV/.test(await page.locator('table').first().innerText()), 'Show IV did not put IV in the table'); }
    }
    const mc = await choices(page);
    if (q === 1) h.expect(!(await atmMarked(page)), 'q1: the ATM row is marked before the question is answered');
    if (q === 3) { // reload mid-game resumes the same chain and question
      const spotBefore = await spot(page);
      await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(450);
      h.expect((await qNo(page)) === 3 && (await spot(page)) === spotBefore, 'reload on q3 did not resume: question ' + (await qNo(page)) + ', spot ' + (await spot(page)) + ' (was ' + spotBefore + ')');
    }
    if (q === 1 || !mc.length) {
      const rs = (await rows(page)).filter((r) => r.K);
      if (!h.expect(rs.length, 'q' + q + ': no strike rows to tap')) break;
      const S = await spot(page);
      const pick = q === 1 ? rs.reduce((a, r) => (Math.abs(r.K - S) < Math.abs(a.K - S) ? r : a)) : rs[Math.floor(rs.length / 2)];
      if (q === 1) h.expect(isFinite(S), 'q1: could not read the spot from the page');
      await tapRow(page, pick.i);
      if (q === 1) h.observe('q1: spot ' + S + ', tapped ' + pick.K);
      if (/tap it again/i.test(await page.locator('#q').innerText())) { // max pain: the first tap shows that strike's payout, the second answers
        h.expect(!(await P.visible(page, NEXT)) && /sellers pay ₹[\d,.]+ crore/.test(await page.locator('#q').innerText()), 'q' + q + ': first tap did not show the payout without answering');
        await h.shot('q' + q + '-payout');
        await tapRow(page, pick.i);
      }
    } else await mc[0].click();
    await page.waitForTimeout(150);
    const after = await h.text();
    h.expect(after !== before && (await P.visible(page, NEXT)), 'q' + q + ': no explanation / Next after answering');
    if (q === 1) h.expect(/correct/i.test(after) && !/not quite|wrong|incorrect/i.test(after), 'q1: tapping the ATM row was not marked correct');
    if (q === 1) h.expect(await atmMarked(page), 'q1: the ATM row is not marked after answering');
    await h.shot('q' + q + '-answered');
    if (!(await P.visible(page, NEXT))) break;
    await h.clickText(NEXT);
  }
  await seeResults(page, h, 'chain');
  const sum = await h.text();
  h.expect(/summary|you got|score|\d of 8/i.test(sum) && (await P.visible(page, /play again/i)), 'summary with Play again did not appear after 8 questions');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.chain && p.chain.done, 'progress has no chain.done: ' + JSON.stringify(p));
  await page.reload({ waitUntil: 'load' });
  h.expect(/right first time/i.test(await h.text()) && !(await page.locator('.rw').count()), 'reload on the summary lost it or showed the reward again');
  await h.clickText(/play again/i);
  h.expect(await page.locator('table').isVisible() && (await qNo(page)) === 1, 'Play again did not show a new chain at question 1');
  await h.shot('play-again');
  // Start over: the first tap only arms it, the second deals a new chain at question 1
  await page.waitForTimeout(450); await tapRow(page, 0); await h.clickText(NEXT);
  await h.clickText(/^start over$/i);
  h.expect((await P.visible(page, /tap again/i)) && (await qNo(page)) === 2, 'Start over: first tap did not just arm it');
  await h.clickText(/tap again/i);
  h.expect((await qNo(page)) === 1, 'Start over: second tap did not go back to question 1');
  await h.shot('start-over');
};
module.exports.description = 'Game 4: 8 chain questions (Q1 = ATM row from the spot, ATM unmarked until answered), one toggle, max pain tap-to-reveal then answer, reload resumes, explanation after each, summary, Play again, two-tap Start over; SKIP if absent';
