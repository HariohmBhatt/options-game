// Hub and each game's first screen at common phone/tablet/desktop sizes: no sideways scroll, buttons ≥ 44px.
const SIZES = [[320, 640], [390, 844], [430, 932], [768, 1024], [1280, 800], [740, 360]];
const fs = require('fs');
const path = require('path');
// Game 4 (chain) only once it is in this checkout.
const PAGES = ['index.html', 'games/ticket/index.html', 'games/payoff/index.html', 'games/expiry/index.html', 'games/chain/index.html', 'games/seller/index.html']
  .filter((p) => fs.existsSync(path.join(__dirname, '..', '..', p)));
module.exports = async function devices(page, h) {
  await h.goto(page, 'index.html');
  await h.shot('default-hub');
  for (const [width, height] of SIZES) {
    const { page: p } = await h.newContext({ width, height, label: width + 'x' + height });
    for (const rel of PAGES) {
      await h.goto(p, rel);
      await h.shot(width + 'x' + height + '-' + (rel.split('/')[1] || 'hub'), p);
    }
    const links = await p.goto(h.url('index.html')).then(() => p.locator('a').evaluateAll((as) => as.filter((a) => a.offsetParent && a.getBoundingClientRect().height < 44).map((a) => a.textContent.trim())));
    h.expect(!links.length, width + 'x' + height + ': hub links under 44px: ' + links.join(', '));
    await p.context().close();
  }
  // 320×568 while holding: a 160 px chart (no shorter, so the candles stay readable) and a one-row action bar keep the position's key figure in view without scrolling;
  // Seller's Greek tiles become rows under 360 px.
  const { page: q } = await h.newContext({ width: 320, height: 568, label: '320x568-holding' });
  const buy = { ticket: [/^CE\b/, /^\d{5}\s*CE/, /^buy\b/i], expiry: [/^CE\b/, /^\d{5}\s*CE/, /^buy\b/i], seller: [/^sell PE\b/i, /^\d{5}\s*PE/, /^sell \d{5}/i] };
  for (const game of Object.keys(buy)) {
    await h.goto(q, 'games/' + game + '/index.html');
    const [type, strike, go] = buy[game];
    await h.clickText(type, q); await q.getByRole('button', { name: strike }).nth(1).click(); await h.clickText(go, q);
    const m = await q.evaluate(() => {
      const f = document.querySelector('[data-roll]').getBoundingClientRect(), bar = document.querySelector('#acts'), bs = [...bar.querySelectorAll('button')].map((b) => b.getBoundingClientRect().top);
      return { fig: f.bottom, bar: bar.getBoundingClientRect().top, rows: new Set(bs.map(Math.round)).size, chart: document.querySelector('.chartbox').getBoundingClientRect().height, y: scrollY };
    });
    h.expect(m.y === 0 && m.fig <= m.bar, game + ' 320x568 holding: key figure ends at ' + Math.round(m.fig) + ' px, under the action bar at ' + Math.round(m.bar));
    h.expect(m.rows === 1 && m.chart >= 150 && m.chart <= 160, game + ' 320x568 holding: action bar has ' + m.rows + ' rows of buttons, chart ' + m.chart + ' px tall');
    if (game === 'seller') h.expect(await q.locator('.greeks').evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length === 1), 'seller 320: Greek tiles are not laid out as rows');
    await h.shot('320x568-holding-' + game, q);
  }
};
module.exports.description = '320, 390, 430, 768, 1280 and 740×360 landscape: no overflow, tap targets ≥ 44px; 320×568 holding: key figure above a one-row action bar, Seller tiles as rows';
