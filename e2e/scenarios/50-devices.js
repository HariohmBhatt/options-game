// Hub and each game's first screen at common phone/tablet/desktop sizes: no sideways scroll, buttons ≥ 44px.
const SIZES = [[320, 640], [390, 844], [430, 932], [768, 1024], [1280, 800], [740, 360]];
const PAGES = ['index.html', 'games/ticket/index.html', 'games/payoff/index.html', 'games/expiry/index.html'];
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
};
module.exports.description = '320, 390, 430, 768, 1280 and 740×360 landscape: no overflow, tap targets ≥ 44px';
