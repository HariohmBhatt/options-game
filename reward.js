// The reward screen after a lesson or a game, plus the small sounds and haptics. Needs art.js and path.js.
(function (root) {
  var SKEY = 'optionsgames.sound';
  var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ctx = null;
  function soundOn() { try { return localStorage.getItem(SKEY) !== 'off'; } catch (e) { return true; } }
  function setSound(on) { try { localStorage.setItem(SKEY, on ? 'on' : 'off'); } catch (e) {} }
  // Short synthesised notes: no audio files to load.
  function tone(freq, at, dur, type, vol) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0, ctx.currentTime + at); g.gain.linearRampToValueAtTime(vol || .12, ctx.currentTime + at + .015);
    g.gain.exponentialRampToValueAtTime(.0001, ctx.currentTime + at + dur);
    o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + dur + .05);
  }
  function sound(kind) {
    if (!soundOn()) return;
    try { ctx = ctx || new (root.AudioContext || root.webkitAudioContext)(); if (ctx.state === 'suspended') ctx.resume(); } catch (e) { return; }
    if (kind === 'ok') { tone(660, 0, .14, 'triangle'); tone(990, .08, .22, 'triangle'); }
    else if (kind === 'no') { tone(220, 0, .18, 'sawtooth', .05); tone(185, .1, .25, 'sawtooth', .05); }
    else if (kind === 'tap') tone(520, 0, .05, 'sine', .05);
    else if (kind === 'done') [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * .09, .35, 'triangle', .1); });
  }
  function buzz(p) { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {} }

  // A one-time confetti burst on a canvas over the screen (1.4 s), never under reduced motion.
  function confetti(host) {
    if (reduce) return;
    var c = document.createElement('canvas'), dpr = Math.min(2, root.devicePixelRatio || 1), W = host.clientWidth, H = host.clientHeight;
    c.className = 'rw-confetti'; c.width = W * dpr; c.height = H * dpr; host.appendChild(c);
    var g = c.getContext('2d'); g.scale(dpr, dpr);
    var cols = ['#1fae74', '#d0106f', '#f2b705', '#2d7ff9', '#ff7a1a'], bits = [];
    for (var i = 0; i < 90; i++) bits.push({ x: W / 2 + (Math.random() - .5) * 60, y: H * .32, vx: (Math.random() - .5) * 9, vy: -Math.random() * 11 - 4,
      r: Math.random() * Math.PI, vr: (Math.random() - .5) * .3, w: 6 + Math.random() * 5, h: 3 + Math.random() * 4, c: cols[i % cols.length] });
    var t0 = performance.now();
    (function frame(t) {
      var k = (t - t0) / 1400; g.clearRect(0, 0, W, H);
      if (k >= 1) { c.remove(); return; }
      bits.forEach(function (b) { b.vy += .32; b.x += b.vx; b.y += b.vy; b.r += b.vr; g.save(); g.globalAlpha = 1 - k * k; g.translate(b.x, b.y); g.rotate(b.r); g.fillStyle = b.c; g.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); g.restore(); });
      requestAnimationFrame(frame);
    })(t0);
  }
  // Counts a number up once (900 ms); the final value is in the HTML from the start.
  function countUp(el, to) {
    if (reduce || !to) return;
    var t0 = performance.now();
    (function f(t) { var k = Math.min(1, (t - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = '+' + Math.round(to * e); if (k < 1) requestAnimationFrame(f); })(t0);
  }

  var BADGE_TITLE = {}; (root.Path ? root.Path.BADGES : []).forEach(function (b) { BADGE_TITLE[b.id] = b; });

  // a: what Path.finishLesson / finishGame returned. o.base: path to the site root ('' or '../../'); o.review: label for a button that closes the screen.
  function show(a, o) {
    o = o || {};
    var base = o.base || '', A = root.Art, failed = a.passed === false;
    var head = failed ? 'Not this time' : a.kind === 'lesson' ? (a.perfect ? 'Lesson complete, no mistakes' : 'Lesson complete') : a.parts[0] && /Challenge passed/.test(a.parts[0][0]) ? 'Challenge passed' : 'Game complete';
    var sub = failed ? 'Goal: ' + a.goalText + '. Try again: each play adds 5 XP.' : a.title;
    var h = '<div class="rw-sheet" role="dialog" aria-modal="true" aria-labelledby="rw-h">';
    var unitDone = a.trophies.length ? a.trophies[a.trophies.length - 1] : 0;
    if (unitDone) { head = 'Unit ' + unitDone + ' complete'; sub = (root.Path ? root.Path.UNITS[unitDone - 1].title : '') + '. Trophy collected.'; }
    h += '<div class="rw-hero">' + A.wick(failed ? 'think' : unitDone ? 'trophy' : a.stars === 3 || a.perfect ? 'wow' : 'cheer', unitDone ? 128 : 104) + '</div>';
    h += '<h2 id="rw-h" class="rw-h">' + head + '</h2><p class="rw-sub">' + sub + '</p>';
    if (a.kind === 'game') {
      h += '<div class="rw-stars" aria-label="' + a.stars + ' of 3 stars">';
      for (var i = 1; i <= 3; i++) h += '<span class="rw-star' + (i <= a.stars ? ' on' : '') + '" style="--d:' + (i * 120) + 'ms">' + A.glyph('challenge', 40) + '</span>';
      h += '</div>';
    }
    var goalPct = Math.min(1, a.today / a.goal);
    h += '<div class="rw-tiles">' +
      '<div class="rw-tile rw-tile--xp"><span class="rw-k">XP earned</span><b class="rw-v">' + A.xpIcon(22) + '<span class="rw-count">+' + a.xp + '</span></b></div>' +
      '<div class="rw-tile rw-tile--streak"><span class="rw-k">Streak</span><b class="rw-v">' + A.flame(22) + a.streak + (a.streak === 1 ? ' day' : ' days') + '</b></div>' +
      '<div class="rw-tile rw-tile--goal"><span class="rw-k">Daily goal</span><b class="rw-v">' + A.goalRing(goalPct, 22) + Math.min(a.today, a.goal) + '/' + a.goal + '</b></div></div>';
    h += '<ul class="rw-parts">' + a.parts.map(function (p) { return '<li><span>' + p[0] + '</span><span>+' + p[1] + ' XP</span></li>'; }).join('') +
      a.trophies.map(function (u) { return '<li><span>Unit ' + u + ' trophy</span><span>+20 XP</span></li>'; }).join('') + '</ul>';
    // The level bar fills from where this reward started to where it ends.
    var before = a.totalXp - a.xp, span = a.levelTo - a.levelFrom, p0 = Math.max(0, (before - a.levelFrom) / span), p1 = (a.totalXp - a.levelFrom) / span;
    h += '<div class="rw-level"><span class="rw-lvdot">' + a.level + '</span><div class="bar"><i style="width:' + Math.round((a.levelUp ? 0 : p0) * 100) + '%" data-to="' + Math.round(p1 * 100) + '"></i></div>' +
      '<span class="rw-lvtxt">' + (a.levelTo - a.totalXp) + ' XP to level ' + (a.level + 1) + '</span></div>';
    var notes = [];
    if (a.levelUp) notes.push('<div class="rw-note"><span class="rw-lv">' + a.level + '</span><div><b>Level ' + a.level + ' reached</b><span>You have ' + a.totalXp + ' XP in all</span></div></div>');
    if (a.goalHit) notes.push('<div class="rw-note">' + A.goalRing(1, 40) + '<div><b>Daily goal reached</b><span>' + a.goal + ' XP today</span></div></div>');
    if (a.streakUp && a.streak > 1) notes.push('<div class="rw-note">' + A.flame(40) + '<div><b>' + a.streak + '-day streak</b><span>Play tomorrow to make it ' + (a.streak + 1) + '</span></div></div>');
    a.badges.forEach(function (id) { var b = BADGE_TITLE[id] || { title: id, how: '' }; notes.push('<div class="rw-note">' + A.badge(id, true, 40) + '<div><b>New badge: ' + b.title + '</b><span>' + b.how + '</span></div></div>'); });
    if (a.next && root.Path) {
      var nn = a.next, KIND = { lesson: 'Lesson', game: 'Game', challenge: 'Challenge', trophy: 'Trophy' };
      var nt = nn.kind === 'lesson' ? ((root.Lessons && root.Lessons.LESSONS[nn.lesson]) || {}).title || 'Lesson' : nn.title;
      notes.push('<div class="rw-note rw-next"><span class="rw-nextic is-' + nn.kind + '">' + A.glyph(nn.kind, 22) + '</span><div><b>Next: ' + nt + '</b><span>' + KIND[nn.kind] + ' · Unit ' + nn.unit + '</span></div></div>');
    } else if (!a.next) notes.push('<div class="rw-note">' + A.badge('level-5', true, 40) + '<div><b>Course complete</b><span>Replay any game for 3 stars, or keep your streak with a lesson a day.</span></div></div>');
    if (notes.length) h += '<div class="rw-notes">' + notes.join('') + '</div>';
    var next = a.next ? '?next=' + a.next.id : '';
    h += '<div class="rw-actions"><a class="rw-btn primary" href="' + base + 'index.html' + next + '">' + (failed ? 'Back to the path' : 'Continue') + '</a>' +
      (o.review ? '<button type="button" class="rw-btn" data-rw="close">' + o.review + '</button>' : '') + '</div></div>';

    var wrap = document.createElement('div'); wrap.className = 'rw'; wrap.innerHTML = h;
    document.body.appendChild(wrap); document.documentElement.classList.add('rw-open');
    var prev = document.activeElement, first = wrap.querySelector('.rw-btn');
    first.focus({ preventScroll: true });
    function close() { wrap.remove(); document.documentElement.classList.remove('rw-open'); if (prev && prev.focus) prev.focus(); if (o.onClose) o.onClose(); }
    wrap.addEventListener('click', function (e) { if (e.target.closest('[data-rw="close"]')) close(); });
    wrap.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && o.review) close();
      if (e.key === 'Tab') { var f = wrap.querySelectorAll('a, button'), l = f[f.length - 1]; if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); l.focus(); } else if (!e.shiftKey && document.activeElement === l) { e.preventDefault(); f[0].focus(); } }
    });
    if (!failed) { confetti(wrap); sound('done'); buzz([18, 40, 18]); } else sound('no');
    countUp(wrap.querySelector('.rw-count'), a.xp);
    var fill = wrap.querySelector('.rw-level i');
    if (reduce) fill.style.width = fill.dataset.to + '%'; else setTimeout(function () { fill.style.width = fill.dataset.to + '%'; }, 350);
    return { close: close, el: wrap };
  }

  // A game page calls this once at its summary: records the play on the path and shows the reward screen.
  function gameDone(game, score, o) {
    if (!root.Path) return null;
    var a = root.Path.finishGame(game, score);
    return show(a, Object.assign({ base: '../../', review: 'See my results' }, o || {}));
  }

  var Reward = { show: show, gameDone: gameDone, sound: sound, buzz: buzz, soundOn: soundOn, setSound: setSound };
  root.Reward = Reward;
})(this);
