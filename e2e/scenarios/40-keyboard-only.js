// Game 1, one round with Tab / Enter / Space only. Focus must be visible on every button and toggles must flip aria-pressed.
const P = require('../play');
const FOCUS = () => {
  const el = document.activeElement, s = el && getComputedStyle(el);
  return el && el !== document.body ? { tag: el.tagName, text: (el.textContent || '').trim().slice(0, 40), pressed: el.getAttribute('aria-pressed'),
    visible: el.matches(':focus-visible'), outline: s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 || s.boxShadow !== 'none' } : null;
};

module.exports = async function keyboardOnly(page, h) {
  await h.goto(page, 'games/ticket/index.html');
  await h.shot('start');
  const seen = new Set(), lost = [];
  // WebKit follows Safari's default: plain Tab skips buttons and links, Option+Tab visits them.
  const TAB = h.browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  // Tab forward until the focused element's text matches, checking the focus ring on every button passed.
  async function tabTo(re, label) {
    for (let i = 0; i < 60; i++) {
      await page.keyboard.press(TAB);
      const f = await page.evaluate(FOCUS);
      if (!f) continue;
      if (f.tag === 'BUTTON' && !seen.has(f.text)) { seen.add(f.text); h.expect(f.visible && f.outline, 'no visible focus ring on button "' + f.text + '"'); }
      if (re.test(f.text)) return f;
    }
    h.expect(false, 'Tab never reached ' + label);
    return null;
  }
  async function press(key, re, label) {
    const f = await tabTo(re, label);
    if (!f) return null;
    await page.keyboard.press(key);
    await page.waitForTimeout(100);
    const after = await page.evaluate(FOCUS);
    if (!after) lost.push(key + ' on "' + f.text.slice(0, 24) + '"');
    await h.shot('key-' + label);
    return f;
  }
  const pe = await press('Space', /^PE/, 'PE');
  if (pe) h.expect(pe.pressed === 'false' && (await page.getByRole('button', { name: /^PE/ }).first().getAttribute('aria-pressed')) === 'true', 'aria-pressed on PE did not toggle false → true');
  h.expect((await page.getByRole('button', { name: /^CE/ }).first().getAttribute('aria-pressed')) === 'false', 'CE still aria-pressed after choosing PE');
  const k = await press('Enter', /^\d{5} PE/, 'strike');
  if (k) h.expect((await page.getByRole('button', { name: new RegExp('^' + k.text.slice(0, 8)) }).first().getAttribute('aria-pressed')) === 'true', 'strike aria-pressed did not become true');
  const l2 = await press('Space', /^2 lots/, 'lots');
  if (l2) h.expect((await page.getByRole('button', { name: /^2 lots/ }).first().getAttribute('aria-pressed')) === 'true', '2 lots aria-pressed did not become true');
  await press('Enter', /^buy\b/i, 'buy');
  h.expect(await P.visible(page, /sell now/i), 'Enter on Buy did not buy');
  h.expect(/2 lots/.test(await page.locator('#app').innerText()), 'keyboard Buy did not buy 2 lots');
  for (let d = 0; d < 6 && !(await P.visible(page, P.RESULT)); d++) await press('Enter', /next day|hold through/i, 'next' + d);
  h.expect(await P.visible(page, P.RESULT), 'keyboard-only round never reached a result');
  await press('Enter', P.RESULT, 'next-round');
  h.expect((await P.round(page)) === 2, 'Enter on Next round did not start round 2');
  // Start over by keyboard: two Enters on the same button.
  await press('Enter', /^start over$/i, 'start-over');
  await press('Enter', /sure\? start over/i, 'start-over-sure');
  h.expect((await P.round(page)) === 1, 'two Enters on Start over did not go back to round 1');
  h.expect(!lost.length, `focus drops to <body> after every action (the card re-renders), so the next Tab restarts at the top of the page: ${lost.length}× (${lost.slice(0, 3).join('; ')} …)`);
};
module.exports.description = 'Game 1 by keyboard only: type, strike, 2 lots, buy, days, next round, two-step Start over; visible focus, aria-pressed toggles, focus kept after each action';
