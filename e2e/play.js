// Human-like moves shared by scenarios. Selectors go by visible text so layout changes in the games do not break them.
const RESULT = /next round|see summary/i;

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
  const loc = (await page.locator('.stats').count()) ? page.locator('.stats').first() : page.locator('body');
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
  if (lot) h.observe('lot selector ' + ((await lots(page, h, lot)) ? 'used: ' + lot + ' lots' : 'not present'));
}

// Game 1: one round. exit = 'day1' (sell after one day), 'lastday' (sell on expiry morning), 'expiry' (hold to 15:30).
async function ticketRound(page, h, o) {
  const tag = 'r' + (await round(page));
  await pick(page, h, o);
  await h.shot(tag + '-picked-' + o.type);
  await h.clickText(/^buy\b/i);
  await h.shot(tag + '-bought');
  const next = /next day|hold through/i;
  for (let d = 0; d < 10 && !(await visible(page, RESULT)); d++) {
    if (o.exit === 'day1' && d === 1) break;
    if (o.exit === 'lastday' && (await visible(page, /hold through/i))) break;
    await h.clickText(next);
    await h.shot(tag + '-day' + (d + 1));
  }
  if (!(await visible(page, RESULT))) { await h.clickText(/sell now/i); }
  h.expect(await visible(page, RESULT), tag + ': no result card after ' + o.exit);
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

module.exports = { RESULT, visible, bankroll, round, clock, pick, lots, ticketRound, tick, payoffSet };
