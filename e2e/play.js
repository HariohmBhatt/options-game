// Human-like moves shared by scenarios. Selectors go by visible text so layout changes in the games do not break them.
const RESULT = /next round|see summary/i;
// The result card of the price games (1, 3, 5): where the P/L came from, the same rows in every game, then the net.
const ATTRIBUTION = [/NIFTY moved/, /Time passed/, /VIX changed/, /Gamma \(delta changed as NIFTY moved\)/, /Spread and charges/, /Net P\/L/];
// The step's main button in the sticky bar, and the round/clock/VIX line of the sticky header.
const HOLD = /next day|hold to/i, HEAD = '.g-head__k, .stats';

async function visible(page, re) {
  const b = page.getByRole('button', { name: re });
  return (await b.count()) > 0 && (await b.first().isVisible());
}
async function bankroll(page) {
  const m = (await page.locator('body').innerText()).match(/Bankroll\s*₹\s*([\d,.-]+)/);
  return m ? parseFloat(m[1].replace(/,/g, '')) : NaN;
}
async function round(page) {
  const m = (await page.locator('body').innerText()).match(/Round (\d+) of (\d+)/);
  return m ? +m[1] : NaN;
}
async function clock(page) {
  const loc = (await page.locator(HEAD).count()) ? page.locator(HEAD).first() : page.locator('body');
  const m = (await loc.innerText()).match(/\b(\d{2}):(\d{2})\b/);
  return m ? +m[1] * 60 + +m[2] : NaN;
}
// Optional lot selector (being added in another branch): pick N lots if any control offers it.
async function lots(page, h, n) {
  if (!n || n === 1) return false;
  const b = page.getByRole('button', { name: new RegExp('^' + n + '\\s*lots?\\b', 'i') });
  if (await b.count()) { await b.first().click(); return true; }
  const c = page.getByLabel(/lots?/i);
  if (await c.count()) {
    const tag = await c.first().evaluate((el) => el.tagName);
    if (tag === 'SELECT') await c.first().selectOption({ label: String(n) }).catch(() => c.first().selectOption(String(n)));
    else await c.first().fill(String(n));
    return true;
  }
  return false;
}
// Choose CE/PE and a strike (index into the strike buttons, negative counts from the end).
async function pick(page, h, { type = 'CE', strike = 0, lot } = {}) {
  await h.clickText(new RegExp('^' + type + '\\b'));
  const ks = page.getByRole('button', { name: new RegExp('^\\d{5}\\s*' + type) });
  const n = await ks.count();
  h.expect(n > 0, 'no strike buttons for ' + type);
  if (n) await ks.nth(strike < 0 ? n + strike : Math.min(strike, n - 1)).click();
  if (lot) h.expect(await lots(page, h, lot), 'no ' + lot + '-lot button');
}

// The paragraph under the P/L table cites the table's biggest row by its name and value, and Wick reacts on the same card.
async function story(page, h, tag) {
  const card = page.locator('#live');
  const rows = await card.locator('.g-break tr').evaluateAll((trs) => trs.map((tr) => [tr.cells[0].firstChild.textContent.trim(), tr.cells[1].textContent.trim()]));
  const m = (await card.innerText()).match(/Biggest line in the table: (.+?), (-?₹[\d,]+)\./);
  if (!h.expect(m, tag + ': the paragraph does not cite the biggest table row')) return;
  const row = rows.find((r) => r[0] === m[1]);
  h.expect(row && row[1] === m[2], tag + ': paragraph cites ' + m[1] + ' ' + m[2] + ' but the table says ' + (row ? row[1] : 'no such row'));
  const others = rows.filter((r) => r[0] !== 'Net P/L').map((r) => Math.abs(parseFloat(r[1].replace(/[^\d.-]/g, '')) || 0));
  h.expect(Math.abs(parseFloat(m[2].replace(/[^\d.-]/g, ''))) > 0 || Math.max(...others) === 0, tag + ': cites a ₹0 row while others moved');
}
// A low bankroll gets one way on: "Start over with ₹…", a plain line why, and no picker.
async function lowBankroll(page, h, game, rel, key, start) {
  await page.evaluate(([k]) => { localStorage.clear(); localStorage.setItem(k, '900'); }, [key]);
  await h.goto(page, rel);
  const text = await h.text();
  h.expect(/can't (buy|cover) even 1 lot/.test(text), game + ': ₹900 bankroll shows no reason it cannot play');
  h.expect(!(await page.getByRole('button', { name: /^\d{5}\s*(CE|PE)/ }).count()), game + ': ₹900 bankroll still shows an unplayable strike picker');
  await h.shot(game + '-low-bankroll');
  await h.clickText(/^start over with/i);
  h.expect((await bankroll(page)) === start && (await round(page)) === 1, game + ': Start over with did not reset to round 1 with ₹' + start);
}

// Game 1: one round. exit = 'day1' (sell after one day), 'lastday' (sell on expiry morning), 'expiry' (hold to 15:30).
async function ticketRound(page, h, o) {
  const tag = 'r' + (await round(page));
  await pick(page, h, o);
  await h.shot(tag + '-picked-' + o.type);
  // Short of money (a bad week, lots left at 3): a player drops to 1 lot, as the game's message says.
  if (/not enough bankroll/i.test(await page.locator('body').innerText())) {
    h.observe(tag + ': not enough bankroll, dropped to 1 lot');
    await page.getByRole('button', { name: /^1\s*lot\b/i }).first().click();
    // Still short: the cheapest strike, the far out-of-the-money end (the game offers only Start over below that).
    if (/not enough bankroll/i.test(await page.locator('body').innerText())) {
      const ks = page.getByRole('button', { name: new RegExp('^\\d{5}\\s*' + o.type) });
      await ks.nth(o.type === 'CE' ? (await ks.count()) - 1 : 0).click();
      h.observe(tag + ': still short, took the cheapest strike');
    }
  }
  await h.clickText(/^buy\b/i);
  await h.shot(tag + '-bought');
  for (let d = 0; d < 10 && !(await visible(page, RESULT)); d++) {
    if (o.exit === 'day1' && d === 1) break;
    if (o.exit === 'lastday' && (await visible(page, /hold to/i))) break;
    await h.clickText(HOLD);
    await h.shot(tag + '-day' + (d + 1));
  }
  if (!(await visible(page, RESULT))) { await h.clickText(/sell now/i); }
  h.expect(await visible(page, RESULT), tag + ': no result card after ' + o.exit);
  const card = await page.locator('body').innerText();
  const missing = ATTRIBUTION.filter((re) => !re.test(card)).map(String);
  h.expect(!missing.length, tag + ': result card lacks ' + missing.join(', '));
  h.expect(await page.locator('#live .g-wick .wick').count(), tag + ': Wick does not react on the result card');
  await story(page, h, tag);
  h.expect(/\bBuy\b/.test(await page.locator('.chart-key').innerText()), tag + ': the chart key does not name the Buy marker');
  h.expect(/^NIFTY [\d,]+/.test(await page.locator('#say').textContent()), tag + ': no one-line chart summary for screen readers');
  await h.shot(tag + '-result-' + o.exit);
  await h.clickText(RESULT);
}

// Game 3: press a clock button (+5 / +30) and return the new clock.
async function tick(page, h, mins) {
  await h.clickText(new RegExp('^\\+\\s*' + mins + '\\s*min', 'i'));
  return clock(page);
}

// Game 2: set side/type/strike on leg `leg` (0 or 1) by button text.
async function payoffSet(page, h, g, leg = 0) {
  const side = page.getByRole('button', { name: new RegExp('^' + g.side + '$', 'i') });
  const type = page.getByRole('button', { name: new RegExp('^' + (g.type === 'call' ? 'CE' : 'PE')) });
  const K = page.getByRole('button', { name: String(g.K), exact: true });
  for (const b of [side, type, K]) await b.nth(Math.min(leg, (await b.count()) - 1)).click();
}

// Two-tap Start over: the first tap only arms it (label changes, game untouched), the second resets.
async function startOver(page, h, game) {
  const before = { round: await round(page), text: await page.locator('#app').innerText() };
  await page.getByRole('button', { name: /^start over$/i }).first().click();
  await page.waitForTimeout(120);
  const armed = page.getByRole('button', { name: /sure|tap again/i });
  h.expect(await armed.count(), game + ': first Start over tap did not ask to confirm');
  h.expect((await round(page)) === before.round && (await page.locator('#app').innerText()) === before.text, game + ': first Start over tap already changed the game');
  await h.shot(game + '-start-over-armed');
  await armed.first().click();
  await page.waitForTimeout(120);
  h.expect((await round(page)) === 1, game + ': second Start over tap did not go back to round 1 (round ' + (await round(page)) + ')');
}
// Reload and check the same screen comes back: round, clock/day line, the main action buttons.
async function reloadSame(page, h, game, buttons) {
  const sig = async () => ({ round: await round(page), stats: await page.locator(HEAD).first().innerText().catch(() => ''),
    bank: await bankroll(page), btns: (await Promise.all(buttons.map((re) => visible(page, re)))).join() });
  const a = await sig();
  await page.reload({ waitUntil: 'load' });
  const b = await sig();
  h.expect(JSON.stringify(a) === JSON.stringify(b), game + ': reload did not resume the same screen: ' + JSON.stringify(a) + ' → ' + JSON.stringify(b));
  await h.shot(game + '-after-reload');
}

// The reward screen a game shows on finishing: check it is there, then close it with "See my results".
async function dismissReward(page, h, game) {
  const b = page.getByRole('button', { name: /see my results/i });
  if (!h.expect(await b.count(), game + ': no reward screen after the summary')) return;
  await h.shot(game + '-reward');
  await b.first().click();
  await page.waitForTimeout(150);
  h.expect(!(await b.count()), game + ': "See my results" did not close the reward screen');
}
// The learning-path state the reward screen writes (path.js).
const pathState = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('optionsgames.path') || '{}'));

module.exports = { story, lowBankroll, RESULT, ATTRIBUTION, HOLD, dismissReward, pathState, visible, bankroll, round, clock, pick, lots, ticketRound, tick, payoffSet, startOver, reloadSame };
