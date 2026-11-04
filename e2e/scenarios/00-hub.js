// Hub: every game link is visible, at least 44px tall, and opens the right game.
const GAMES = [
  { href: 'games/ticket/', title: /NIFTY Weekly/i },
  { href: 'games/payoff/', title: /Payoff Painter/i },
  { href: 'games/expiry/', title: /Expiry Tuesday/i },
];
module.exports = async function hub(page, h) {
  await h.goto(page, 'index.html');
  h.expect(/Options Games/.test(await page.title()), 'hub title is ' + (await page.title()));
  await h.shot('hub');
  const links = page.getByRole('link', { name: /play/i });
  h.expect((await links.count()) >= GAMES.length, 'expected ' + GAMES.length + ' Play links, found ' + (await links.count()));
  for (const g of GAMES) {
    const link = page.locator(`a[href="${g.href}"], a[href="${g.href}index.html"]`).first();
    h.expect(await link.isVisible(), g.href + ' link not visible');
    const box = await link.boundingBox();
    h.expect(box && box.height >= 44, g.href + ' link is ' + (box && Math.round(box.height)) + 'px tall, want ≥44');
    await link.click();
    await page.waitForLoadState('load');
    const title = await page.title(), moved = !/\/index\.html$/.test(page.url());
    // A folder link has no index.html fallback on file://: Chromium shows a directory listing, WebKit refuses to navigate.
    const broken = !g.title.test(title) && (/\/$/.test(page.url()) || /Options Games/.test(title));
    h.expect(g.title.test(title), g.href + (broken ? ' does not open the game from file:// (' + (moved ? 'directory listing' : 'navigation refused') + '); link should end in index.html' : ' opened page titled "' + title + '"'));
    await h.shot(g.href.split('/')[1]);
    if (broken) { if (moved) { await page.goBack(); await page.waitForLoadState('load'); } continue; }
    await page.getByRole('link', { name: /all games/i }).click();
    await page.waitForLoadState('load');
    h.expect(/Options Games/.test(await page.title()), 'back link did not return to hub');
  }
  await h.shot('hub-again');
};
module.exports.description = 'Hub links visible, ≥44px, open each game and come back';
