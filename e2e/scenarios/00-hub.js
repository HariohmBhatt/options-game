// The path, as a first-time player meets it: welcome, lesson 1 played to the end, the reward screen, the game it
// unlocks, back to the path, a locked step, the badges and glossary tabs. Every tap target ≥ 44px.
const path = require('path');
const L = require(path.join(__dirname, '..', '..', 'lessons', 'content.js')).LESSONS;
const HUB = /^Options Games/;

async function playLesson(page, h, id, wrongFirst) {
  for (let i = 0; i < L[id].teach.length; i++) {
    if (await page.locator('.ls-vis').count()) {
      // A teach card with a picture to touch: step the dial or tap a chain row, then move on.
      if (await page.locator('.dl-step').count()) await page.locator('.dl-step[data-d="1"]').click();
      else { await page.locator('.ch-row[data-r="0"]').click(); h.expect((await page.locator('#ch-note').innerText()).length > 10, id + ': chain row tap shows no note'); }
      await h.shot(id + '-teach-' + (i + 1));
    }
    await page.getByRole('button', { name: /^continue$/i }).click();
  }
  await h.shot(id + '-q1');
  let first = true;
  for (let guard = 0; guard < 20 && !(await page.locator('.rw').count()); guard++) {
    const prompt = (await page.locator('.ls-q').innerText()).trim();
    const q = L[id].questions.find((x) => x.prompt === prompt);
    if (!h.expect(q, id + ': unknown question "' + prompt + '"')) return;
    if (q.kind === 'match') {
      for (let k = 0; k < q.pairs.length; k++) { await page.locator(`[data-t="${k}"]`).click(); await page.locator(`[data-m="${k}"]`).click(); }
    } else if (q.kind === 'dial') {
      // Move the native range like a keyboard or slider would; a miss goes to whichever end is far from the answer.
      const miss = wrongFirst && first, far = Math.abs(q.x.min - q.answer) > Math.abs(q.x.max - q.answer) ? q.x.min : q.x.max;
      const v = miss ? far : Math.round((q.answer - q.x.min) / q.x.step) * q.x.step + q.x.min;
      await page.locator('#dl-range').evaluate((el, x) => { el.value = x; el.dispatchEvent(new Event('input', { bubbles: true })); }, v);
      await page.getByRole('button', { name: /^check$/i }).click();
      const fb = await page.locator('#fb').innerText();
      h.expect(miss ? /not quite/i.test(fb) : !/not quite/i.test(fb), id + ': dial feedback "' + fb.slice(0, 40) + '" after a ' + (miss ? 'wrong' : 'right') + ' answer');
      if (miss) await h.shot(id + '-wrong');
    } else {
      let want = q.kind === 'truefalse' ? (q.answer ? 1 : 0) : q.answer;
      const miss = wrongFirst && first;
      if (miss) want = q.kind === 'truefalse' ? 1 - want : (want + 1) % q.choices.length;
      await page.locator(`.ls-opt[data-i="${want}"]`).click();
      await page.getByRole('button', { name: /^check$/i }).click();
      const fb = await page.locator('#fb').innerText();
      h.expect(miss ? /not quite/i.test(fb) : !/not quite/i.test(fb), id + ': feedback "' + fb.slice(0, 40) + '" after a ' + (miss ? 'wrong' : 'right') + ' answer');
      h.expect(fb.includes(q.why.slice(0, 30)), id + ': feedback does not explain why');
      if (miss) await h.shot(id + '-wrong');
    }
    first = false;
    await page.getByRole('button', { name: /^continue$/i }).click();
  }
}

module.exports = async function hub(page, h) {
  await h.goto(page, 'index.html');
  h.expect(HUB.test(await page.title()), 'path title is ' + (await page.title()));
  h.expect(await page.locator('#welcome').isVisible(), 'first visit: no welcome card');
  h.expect((await page.locator('.node').count()) === 25, 'want 25 path steps, found ' + (await page.locator('.node').count()));
  h.expect((await page.locator('.node.is-current').count()) === 1, 'want exactly one open step');
  await h.shot('path-first-visit');

  // A locked step explains itself and cannot start
  await page.locator('#u1-play').click();
  h.expect(await page.locator('#sheet').getByRole('button', { name: /^locked/i }).isDisabled(), 'locked step: its button is not disabled');
  await h.shot('sheet-locked');
  await page.keyboard.press('Escape'); await page.waitForTimeout(250);

  // Lesson 1, one wrong answer first: it comes back at the end, then the reward screen
  // The welcome card's button goes straight into lesson 1
  await page.getByRole('link', { name: /start lesson 1/i }).click(); await page.waitForLoadState('load');
  h.expect(/What an option is/.test(await page.title()), 'lesson page title ' + (await page.title()));
  await playLesson(page, h, 'u1-l1', true);
  h.expect(await page.locator('.rw').isVisible(), 'no reward screen after the lesson');
  const rw = await page.locator('.rw').innerText();
  h.expect(/Lesson complete/.test(rw) && /\+10/.test(rw) && /5 of 6 right first time/.test(rw), 'reward screen text: ' + rw.slice(0, 120).replace(/\n/g, ' | '));
  h.expect(/First lesson/.test(rw), 'no "First lesson" badge on the reward screen');
  await page.waitForTimeout(1500); await h.shot('reward-lesson');

  // Continue: back on the path, lesson 1 done, the game open, XP and streak in the top bar
  await page.getByRole('link', { name: /^continue$/i }).click(); await page.waitForLoadState('load');
  h.expect(HUB.test(await page.title()), 'Continue did not return to the path');
  h.expect(await page.locator('#u1-l1.is-done').count(), 'lesson 1 not marked done');
  h.expect(await page.locator('#u1-play.is-current').count(), 'the game step is not open after lesson 1');
  h.expect(await page.locator('#u1-play.is-unlocking').count(), 'the newly opened step does not show its unlock');
  h.expect(!/next=/.test(page.url()), 'the ?next= parameter stays in the address: ' + page.url());
  h.expect(/10/.test(await page.locator('#tb-xp').innerText()) && /1/.test(await page.locator('#tb-streak').innerText()), 'top bar did not update');
  const tb = await page.locator('.topbar').innerText();
  h.expect(/streak/.test(tb) && /XP/.test(tb) && /today/.test(tb), 'top bar figures have no labels: ' + tb.replace(/\n/g, ' '));
  h.expect(!(await page.locator('#welcome').isVisible()), 'welcome card still shows after lesson 1');
  await h.shot('path-after-lesson');

  // The game step opens NIFTY Weekly; its close button comes back to the path
  await page.locator('#u1-play').click();
  const play = page.locator('a[href="games/ticket/index.html"]');
  h.expect(await play.isVisible(), 'game sheet has no link to NIFTY Weekly');
  const box = await play.boundingBox(); h.expect(box && box.height >= 44, 'play link is ' + (box && box.height) + 'px tall');
  await play.click(); await page.waitForLoadState('load');
  h.expect(/NIFTY Weekly/.test(await page.title()), 'game opened page titled ' + (await page.title()));
  await page.getByRole('link', { name: /back to the path/i }).click(); await page.waitForLoadState('load');
  h.expect(HUB.test(await page.title()), 'game close did not return to the path');

  // Badges and glossary tabs
  await page.getByRole('link', { name: /^badges$/i }).click(); await page.waitForLoadState('load');
  h.expect(/Badges/.test(await page.title()), 'badges tab title ' + (await page.title()));
  h.expect(/1 of 12/.test(await page.locator('#bcount').innerText()), 'badges count ' + (await page.locator('#bcount').innerText()));
  await h.shot('badges');
  await page.getByRole('link', { name: /^glossary$/i }).click(); await page.waitForLoadState('load');
  h.expect(/Glossary/.test(await page.title()), 'glossary tab title ' + (await page.title()));
  await h.shot('glossary');
  await page.getByRole('link', { name: /^path$/i }).click(); await page.waitForLoadState('load');
  h.expect(HUB.test(await page.title()), 'path tab did not return');
};
module.exports.description = 'Path: welcome, locked step, lesson 1 with a miss replayed, reward screen, Continue unlocks the game, game close returns, badges and glossary tabs';
