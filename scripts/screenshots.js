// Captures the README screenshots: the hub and each game's first screen at phone width, dark scheme.
// Usage: PLAYWRIGHT_PATH=<path to a playwright package> node scripts/screenshots.js
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'docs', 'screenshots');
const pages = [
  ['hub', 'index.html'], ['ticket', 'games/ticket/index.html'], ['payoff', 'games/payoff/index.html'],
  ['expiry', 'games/expiry/index.html'], ['chain', 'games/chain/index.html'], ['seller', 'games/seller/index.html']
];

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark' });
  for (const [name, file] of pages) {
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('file://' + path.join(root, file));
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(out, name + '.png'), fullPage: false });
    if (errors.length) throw new Error(name + ': ' + errors.join('; '));
    console.log(name + '.png', fs.statSync(path.join(out, name + '.png')).size, 'bytes');
    await page.close();
  }
  await browser.close();
})();
