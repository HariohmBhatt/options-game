#!/usr/bin/env node
// Plays the games in a real browser like a person would, records a video and screenshots per scenario.
// node e2e/run.js [scenario ...] [--browser=chromium|webkit] [--width=360 --height=740] [--scheme=dark|light]
const fs = require('fs');
const path = require('path');
const pw = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const ROOT = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find((x) => x.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const BROWSER = flag('browser', 'chromium');
const WIDTH = +flag('width', 360), HEIGHT = +flag('height', 740), SCHEME = flag('scheme', 'dark');
// Each browser gets its own folder so a webkit run does not overwrite the chromium one.
const ART = path.join(__dirname, 'artifacts', BROWSER === 'chromium' ? '' : BROWSER);
const wanted = args.filter((a) => !a.startsWith('--'));
const files = fs.readdirSync(path.join(__dirname, 'scenarios')).filter((f) => f.endsWith('.js')).sort()
  .filter((f) => !wanted.length || wanted.some((w) => f === w || f.replace(/\.js$/, '') === w || f.startsWith(w)));

const url = (rel) => 'file://' + path.join(ROOT, rel || 'index.html');
const rel = (p) => path.relative(ART, p).split(path.sep).join('/');

// Visible state checks run on every screenshot: horizontal overflow and tap targets under 44px.
const LAYOUT = () => {
  const vis = (el) => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden'; };
  const small = [...document.querySelectorAll('button')].filter(vis).filter((b) => b.getBoundingClientRect().height < 44)
    .map((b) => (b.textContent || '').trim().slice(0, 30) + ' (' + Math.round(b.getBoundingClientRect().height) + 'px)');
  return { scrollWidth: document.scrollingElement.scrollWidth, width: window.innerWidth, small };
};

async function runScenario(browser, file) {
  const fn = require(path.join(__dirname, 'scenarios', file));
  const id = file.replace(/\.js$/, ''), dir = path.join(ART, id);
  const rec = { id, name: fn.name || id, description: fn.description || '', status: 'PASS', ms: 0, failures: [], observations: [], shots: [], videos: [] };
  if (fn.browsers && !fn.browsers.includes(BROWSER)) { rec.status = 'SKIP'; rec.failures.push('only runs on ' + fn.browsers.join(', ')); return rec; }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const t0 = Date.now(), contexts = [];
  const fail = (m) => { rec.failures.push(m); };

  async function newContext(o = {}) {
    const w = o.width || WIDTH, hgt = o.height || HEIGHT, viewport = { width: w, height: hgt };
    const mobile = BROWSER === 'chromium' && w <= 500;
    const context = await browser.newContext({
      viewport, deviceScaleFactor: 2, isMobile: mobile, hasTouch: w <= 500, colorScheme: o.colorScheme || fn.colorScheme || SCHEME,
      recordVideo: { dir, size: viewport }, storageState: o.storageState || fn.storageState || undefined,
    });
    const label = o.label || (contexts.length ? 'ctx' + contexts.length : '');
    context.on('page', watch);
    context.setDefaultTimeout(5000);
    const page = await context.newPage();
    contexts.push({ context, page, label });
    return { context, page };
  }
  function watch(page) {
    // Chromium's own file:// directory-listing page throws; the hub test reports the broken link instead.
    const own = () => !(page.url().startsWith('file:') && page.url().endsWith('/'));
    page.on('console', (m) => { if (m.type() === 'error' && own()) fail('console error: ' + m.text()); });
    page.on('pageerror', (e) => own() && fail('page error: ' + e.message));
    page.on('requestfailed', (r) => fail('request failed: ' + r.url() + ' ' + (r.failure() || {}).errorText));
  }

  const { page } = await newContext();
  let n = 0;
  const h = {
    ROOT, url, browserName: BROWSER, width: WIDTH, height: HEIGHT, scheme: SCHEME, newContext,
    goto: (p, r) => p.goto(url(r), { waitUntil: 'load' }),
    expect(cond, msg) { if (!cond) fail(msg); return !!cond; },
    observe(msg) { rec.observations.push(msg); },
    async shot(name, p = page) {
      const file = path.join(dir, String(++n).padStart(2, '0') + '-' + name.replace(/[^\w.-]+/g, '_') + '.png');
      await p.waitForTimeout(150);
      await p.screenshot({ path: file, fullPage: true });
      rec.shots.push(rel(file));
      const l = await p.evaluate(LAYOUT);
      if (l.scrollWidth > l.width) fail(name + ': horizontal overflow, scrollWidth ' + l.scrollWidth + ' > viewport ' + l.width);
      if (l.small.length) fail(name + ': buttons under 44px: ' + l.small.join(', '));
      return file;
    },
    btn: (re, p = page) => p.getByRole('button', { name: re }),
    has: async (re, p = page) => (await p.getByRole('button', { name: re }).count()) > 0,
    // Tap the first enabled button whose accessible name matches, like a thumb would.
    async clickText(re, p = page) {
      const b = p.getByRole('button', { name: re }).first();
      await b.click();
      await p.waitForTimeout(120);
    },
    async tapAll(re, p = page) {
      const n = await p.getByRole('button', { name: re }).count();
      for (let i = 0; i < n; i++) await p.getByRole('button', { name: re }).nth(i).click();
      return n;
    },
    text: (p = page) => p.locator('body').innerText(),
    progress: (p = page) => p.evaluate(() => JSON.parse(localStorage.getItem('optionsgames.progress') || '{}')),
  };
  try {
    await fn(page, h);
  } catch (e) {
    fail('threw: ' + (e && e.message ? e.message.split('\n')[0] : e));
  }
  for (const c of contexts) {
    const v = c.page.video();
    await c.context.close();
    if (!v) continue;
    const to = path.join(dir, c.label ? 'play-' + c.label + '.webm' : 'play.webm');
    try { fs.renameSync(await v.path(), to); rec.videos.push(rel(to)); } catch (e) { fail('video: ' + e.message); }
  }
  rec.ms = Date.now() - t0;
  if (rec.failures.length) rec.status = 'FAIL';
  return rec;
}

(async () => {
  const t0 = Date.now();
  fs.mkdirSync(ART, { recursive: true });
  const browser = await pw[BROWSER].launch();
  const results = [];
  for (const f of files) {
    const r = await runScenario(browser, f);
    results.push(r);
    console.log(r.status.padEnd(4), (r.ms / 1000).toFixed(1).padStart(5) + 's', r.id, r.failures.length && r.status === 'FAIL' ? '\n   - ' + r.failures.join('\n   - ') : '');
    r.observations.forEach((o) => console.log('   observed: ' + o));
  }
  await browser.close();
  const env = { browser: BROWSER, width: WIDTH, height: HEIGHT, scheme: SCHEME, ms: Date.now() - t0, at: new Date().toISOString() };
  fs.writeFileSync(path.join(ART, 'report.json'), JSON.stringify({ env, results }, null, 2));
  const md = ['# E2E report', '', `Browser ${BROWSER} · ${WIDTH}×${HEIGHT} · ${SCHEME} · ${(env.ms / 1000).toFixed(1)}s`, ''];
  for (const r of results) {
    md.push(`- **${r.status}** ${r.id} (${(r.ms / 1000).toFixed(1)}s) ${r.description}` +
      (r.videos.length ? ' · ' + r.videos.map((v) => `[${path.basename(v)}](${v})`).join(' ') : '') +
      (r.shots.length ? ' · screenshots ' + r.shots.map((s) => `[${path.basename(s).slice(0, 2)}](${s})`).join(' ') : ''));
    r.failures.forEach((f) => md.push('  - ' + (r.status === 'SKIP' ? 'skipped: ' : 'FAIL: ') + f));
    r.observations.forEach((o) => md.push('  - observed: ' + o));
  }
  fs.writeFileSync(path.join(ART, 'report.md'), md.join('\n') + '\n');
  console.log(`\n${results.filter((r) => r.status === 'FAIL').length} failed, ${results.filter((r) => r.status === 'PASS').length} passed · report: ${path.relative(ROOT, path.join(ART, 'report.md'))}`);
  process.exit(results.some((r) => r.status === 'FAIL') ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
