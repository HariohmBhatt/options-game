// Light mode: each game's first screen and a result card, with text contrast ≥ 4.5:1 for P/L, muted and strike/warn text.
const P = require('../play');
const CONTRAST = () => {
  const rgb = (c) => (c.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
    .reduce((a, v, i) => a + v * [0.2126, 0.7152, 0.0722][i], 0);
  const bg = (el) => { for (; el; el = el.parentElement) { const c = rgb(getComputedStyle(el).backgroundColor); if (c.length === 3 || c[3] > 0) return c; } return [255, 255, 255]; };
  const sel = '.up, .down, .muted, .warn, [style*="--warn"], text[fill*="--warn"], text[fill*="--muted"]';
  const els = [...document.querySelectorAll(sel)].filter((el) => el.getBoundingClientRect().width > 0 && !el.closest('button:disabled'));
  return { n: els.length, bad: els.map((el) => {
    const s = getComputedStyle(el), fg = rgb(el instanceof SVGElement ? s.fill : s.color), b = bg(el instanceof SVGElement ? el.closest('svg') : el);
    const [L1, L2] = [lum(fg), lum(b)].sort((a, b) => b - a);
    return { what: (el.getAttribute('class') || el.tagName) + ' "' + (el.textContent || '').trim().slice(0, 20) + '"', ratio: (L1 + 0.05) / (L2 + 0.05) };
  }).filter((x) => x.ratio < 4.5).map((x) => x.what + ' ' + x.ratio.toFixed(2) + ':1') };
};
module.exports = async function lightMode(page, h) {
  let checked = 0;
  const check = async (tag) => { await h.shot(tag); const { n, bad } = await page.evaluate(CONTRAST); checked += n; h.expect(!bad.length, tag + ': contrast < 4.5:1: ' + [...new Set(bad)].slice(0, 5).join('; ')); };
  h.expect(await page.evaluate(() => matchMedia('(prefers-color-scheme: light)').matches), 'light colour scheme not applied');
  await h.goto(page, 'index.html'); await check('hub');

  await h.goto(page, 'games/ticket/index.html'); await check('ticket-start');
  await h.clickText(/^buy\b/i); await check('ticket-holding');
  await h.clickText(/next day/i); await h.clickText(/sell now/i); await check('ticket-result');

  await h.goto(page, 'games/payoff/index.html'); await check('payoff-start');
  const t = await page.evaluate(() => { try { return Payoff.puzzles(1)[0]; } catch (e) { return null; } });
  if (t && !t.legs) {
    // Wrong side first so the hint text is checked too, then a brute-force solve.
    await P.payoffSet(page, h, { side: t.side === 'buy' ? 'sell' : 'buy', type: t.type, K: t.K }); await h.clickText(/^check$/i); await check('payoff-hint');
  }
  for (const side of ['buy', 'sell']) for (const type of ['call', 'put']) for (const K of (await page.getByRole('button', { name: /^\d{5}$/ }).allInnerTexts()))
    if (!(await P.visible(page, /next puzzle/i))) { await P.payoffSet(page, h, { side, type, K }); await h.clickText(/^check$/i); }
  await check('payoff-result');

  await h.goto(page, 'games/expiry/index.html'); await check('expiry-start');
  await h.clickText(/^buy\b/i); await check('expiry-holding');
  await P.tick(page, h, 30); await h.clickText(/sell now/i); await check('expiry-result');
  h.expect(checked > 30, 'contrast check found only ' + checked + ' coloured text elements');
  h.observe(checked + ' coloured text elements checked for contrast');
};
module.exports.colorScheme = 'light';
module.exports.description = 'Light mode: first screens and result cards, contrast ≥ 4.5:1 for .up/.down/.muted/warn/strike labels';
