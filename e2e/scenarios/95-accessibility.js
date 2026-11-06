// Accessibility: axe-core (WCAG 2.1 A and AA rules) on every screen, light and dark, plus the states a player reaches:
// a lesson question with feedback, a node's sheet, the reward screen. Serious and critical findings fail; the rest are noted.
const fs = require('fs');
const path = require('path');
const AXE = fs.readFileSync(path.join(__dirname, '..', 'vendor', 'axe.min.js'), 'utf8');

async function audit(page, h, label) {
  await page.addScriptTag({ content: AXE });
  const r = await page.evaluate(() => window.axe.run(document, { preload: false, runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  for (const v of r.violations) {
    const where = v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ');
    const msg = label + ': ' + v.id + ' (' + v.impact + ', ' + v.nodes.length + ') ' + where;
    if (v.impact === 'serious' || v.impact === 'critical') h.expect(false, msg); else h.observe(msg);
  }
  return r.violations.length;
}

const PAGES = ['index.html', 'badges.html', 'glossary.html', 'lesson.html?id=u1-l1', 'lesson.html?id=u2-l1',
  'games/ticket/index.html', 'games/payoff/index.html', 'games/expiry/index.html', 'games/chain/index.html', 'games/seller/index.html'];

module.exports = async function accessibility(page, h) {
  for (const scheme of ['light', 'dark']) {
    const { page: p } = await h.newContext({ colorScheme: scheme, label: scheme });
    for (const rel of PAGES) { await h.goto(p, rel); await p.waitForTimeout(300); await audit(p, h, scheme + ' ' + rel); }

    // States a player reaches
    await h.goto(p, 'index.html'); await p.locator('#u1-l1').click(); await p.waitForTimeout(300);
    await audit(p, h, scheme + ' path sheet');
    await h.goto(p, 'lesson.html?id=u1-l1');
    for (let i = 0; i < 6 && !(await p.locator('.ls-q').count()); i++) await p.getByRole('button', { name: /^continue$/i }).click();
    const opt = p.locator('.ls-opt:not(:disabled)').first();
    if (await opt.count()) { await opt.click(); const check = p.getByRole('button', { name: /^check$/i }); if (await check.isEnabled()) await check.click(); }
    await p.waitForTimeout(300); await audit(p, h, scheme + ' lesson feedback');
    await h.shot(scheme + '-lesson-feedback', p);
    // The reward screen, from a finished lesson state
    await h.goto(p, 'index.html');
    await p.evaluate(() => { Path.finishLesson('u1-l1', 0, 'What an option is'); });
    await p.evaluate(() => { const a = Path.finishGame('ticket', 101000); Reward.show(a, { base: '', review: 'See my results' }); });
    await p.waitForTimeout(1600); await audit(p, h, scheme + ' reward screen'); // after its fade-ins settle
  }
};
module.exports.description = 'axe-core WCAG 2.1 A/AA on 10 screens + sheet, lesson feedback and reward, light and dark; serious/critical fail';
