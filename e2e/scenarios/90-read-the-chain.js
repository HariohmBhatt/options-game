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
// ITM shading ends right at ATM, so it is hidden with the ATM outline until question 1 is answered (legend too).
const itmShown = (page) => page.evaluate(() => ({ cells: document.querySelectorAll('table .itm').length, legend: !document.getElementById('legend').hidden && document.getElementById('legend').textContent }));
// After an answer: Wick (64–72 px) hops on a right one and droops on a wrong one, and the live region reads the verdict.
async function reaction(page, h, q) {
  const r = await page.evaluate(() => { const w = document.querySelector('#fb .wick'); return { w: w && w.getBoundingClientRect().width, cls: w && w.getAttribute('class'), fb: document.getElementById('fb').textContent, live: document.getElementById('live').textContent }; });
  const ok = /^\s*Correct/.test(r.fb);
  h.expect(r.w >= 64 && r.w <= 72 && r.cls.includes(ok ? 'wick--bounce' : 'wick--droop'), 'q' + q + ': Wick ' + JSON.stringify({ w: r.w, cls: r.cls }));
  h.expect(/^(Correct|Not quite)\. /.test(r.live) && r.live.replace(/\s+/g, ' ').trim() === r.fb.replace(/\s+/g, ' ').trim(), 'q' + q + ': live region "' + r.live.slice(0, 60) + '" does not read the feedback');
  // one feedback place: Wick's card in view between the sticky question and the Next bar, which holds only the button
  const v = await page.evaluate(() => { const f = document.getElementById('fb').getBoundingClientRect(), q = document.getElementById('q').getBoundingClientRect(), a = document.getElementById('acts');
    return { top: f.top, bottom: f.bottom, qb: q.bottom, at: a.getBoundingClientRect().top, bar: a.innerText.trim(), n: document.querySelectorAll('#fb').length }; });
  h.expect(v.n === 1 && /^(Next question|See summary)$/.test(v.bar), 'q' + q + ': the Next bar holds "' + v.bar.slice(0, 60) + '" (' + v.n + ' feedback cards)');
  h.expect(v.top >= v.qb - 1 && v.bottom <= v.at + 1, 'q' + q + ': the verdict is not in view: ' + JSON.stringify(v));
  return ok;
}
// Counts Reward.burst() calls on every page load (reward.js sets window.Reward).
const COUNT_BURSTS = () => { let R; window.__bursts = 0; Object.defineProperty(window, 'Reward', { configurable: true, get: () => R,
  set: (v) => { R = v; const b = v.burst; v.burst = function () { window.__bursts++; return b.apply(this, arguments); }; } }); };
const bursts = (page) => page.evaluate(() => window.__bursts);
// Every number in the chain: the app's sans with tabular figures (no monospace), weight 400, 600 only in the strike column.
const tableFonts = (page) => page.evaluate(() => [...document.querySelectorAll('#chain tbody td:not([colspan]), #chain tbody td button, #chain tbody td.k span, #chain tbody td.k small')]
  .filter((e) => e.getBoundingClientRect().width > 0 && /\d/.test(e.textContent)).map((e) => { const s = getComputedStyle(e), k = !!e.closest('td.k') && e.tagName !== 'SMALL';
    return (/mono|menlo|consolas|courier/i.test(s.fontFamily) || !/figtree/i.test(s.fontFamily) || !/tabular-nums/.test(s.fontVariantNumeric) || +s.fontWeight !== (k ? 600 : 400)) ? e.className + ' "' + e.textContent.trim() + '" ' + s.fontFamily + ' ' + s.fontWeight : null; }).filter(Boolean));
const qNo = async (page) => +((await page.locator('#q').innerText()).match(/Question (\d+) of 8/) || [])[1];

module.exports = async function readTheChain(page, h) {
  if (!fs.existsSync(path.join(h.ROOT, 'games/chain/index.html'))) return h.skip('games/chain/index.html is not in this checkout yet (Game 4 is merged from another branch)');
  await page.addInitScript(COUNT_BURSTS);
  await h.goto(page, 'games/chain/index.html');
  await h.shot('start');
  let hard = 0;
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
    if (q === 1) {
      h.expect(!(await atmMarked(page)), 'q1: the ATM row is marked before the question is answered');
      const itm = await itmShown(page);
      h.expect(!itm.cells && !itm.legend, 'q1: ITM shading or its legend shows before the question is answered: ' + JSON.stringify(itm));
      // the table's numbers: the app's tabular sans at 13–14 px, not monospace
      const f = await page.evaluate(() => { const s = getComputedStyle(document.querySelector('table tbody td')); return { fam: s.fontFamily, size: parseFloat(s.fontSize), num: s.fontVariantNumeric }; });
      h.expect(!/mono|menlo|consolas/i.test(f.fam) && f.size >= 13 && f.size <= 14 && /tabular-nums/.test(f.num), 'q1: chain numbers are ' + JSON.stringify(f));
      const bad = await tableFonts(page);
      h.expect(!bad.length, 'q1: chain numbers not in the light tabular sans (400, strike 600): ' + bad.slice(0, 4).join('; '));
      // scrolled into the chain, the question card shrinks but stays on screen above the rows
      const full = await page.locator('#q').evaluate((e) => e.getBoundingClientRect().height);
      await page.locator('table tbody tr').nth(6).scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 200)); await page.waitForTimeout(150);
      const c = await page.locator('#q').evaluate((e) => { const r = e.getBoundingClientRect(), t = e.querySelector('h2').getBoundingClientRect(); return { top: r.top, h: r.height, compact: e.classList.contains('compact'), h2: t.top >= 0 && t.bottom <= r.bottom }; });
      h.expect(c.compact && c.h < full && Math.round(c.top) === 0 && c.h2, 'q1: scrolled question card is not compact and sticky (' + Math.round(full) + ' px before): ' + JSON.stringify(c));
      await h.shot('q1-scrolled-compact');
    }
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
        h.expect(/sellers pay ₹[\d,.]+ crore\. Tap it again/.test(await page.locator('#live').textContent()), 'q' + q + ': the payout was not read out');
        await h.shot('q' + q + '-payout');
        await tapRow(page, pick.i);
      }
    } else await mc[0].click();
    await page.waitForTimeout(150);
    const after = await h.text();
    h.expect(after !== before && (await P.visible(page, NEXT)), 'q' + q + ': no explanation / Next after answering');
    if (q === 1) h.expect(/correct/i.test(after) && !/not quite|wrong|incorrect/i.test(after), 'q1: tapping the ATM row was not marked correct');
    if (q === 1) h.expect(await atmMarked(page), 'q1: the ATM row is not marked after answering');
    if (q === 1) { const itm = await itmShown(page); h.expect(itm.cells && /In the money/.test(itm.legend) && /ATM row/.test(itm.legend), 'q1: ITM shading and legend missing after answering: ' + JSON.stringify(itm)); }
    const ok = await reaction(page, h, q);
    if (q >= 7 && ok) hard++;
    h.expect((await bursts(page)) === hard, 'q' + q + ': ' + (await bursts(page)) + ' bursts, want ' + hard + ' (one per right max-pain / delta answer)');
    if (q === 7) { const bad = await tableFonts(page); h.expect(!bad.length, 'q7: revealed payouts not in the light sans: ' + bad.slice(0, 4).join('; ')); }
    await h.shot('q' + q + '-answered');
    if (!(await P.visible(page, NEXT))) break;
    await h.clickText(NEXT);
  }
  await seeResults(page, h, 'chain');
  h.expect((await bursts(page)) === hard, 'summary: ' + (await bursts(page)) + ' bursts, want ' + hard + ' (the summary itself adds none: the reward screen has its own confetti)');
  const sum = await h.text();
  h.expect(/summary|you got|score|\d of 8/i.test(sum) && (await P.visible(page, /play again/i)), 'summary with Play again did not appear after 8 questions');
  await h.shot('summary');
  const p = await h.progress();
  h.expect(p.chain && p.chain.done, 'progress has no chain.done: ' + JSON.stringify(p));
  await page.reload({ waitUntil: 'load' });
  h.expect(/right first time/i.test(await h.text()) && !(await page.locator('.rw').count()) && (await bursts(page)) === 0, 'reload on the summary lost it, showed the reward again or burst');
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
module.exports.description = 'Game 4: 8 chain questions (Q1 = ATM row from the spot, ATM outline + ITM shading hidden until answered), tabular sans numbers, compact sticky question when scrolled, Wick bounce/droop + live region, one feedback place (in view, never in the Next bar), light table numbers (400, strike 600), burst on a right max pain/delta, one toggle, max pain tap-to-reveal then answer, reload resumes, explanation after each, summary, Play again, two-tap Start over; SKIP if absent';
