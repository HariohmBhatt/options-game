// App shell helpers shared by the path, badges and lesson screens: top bar, bottom sheet, sound toggle, tab icons.
(function (root) {
  function topbar(S) {
    var $ = function (id) { return document.getElementById(id); };
    // Each figure carries a short visible label, so a new player can read the bar.
    function item(id, icon, value, label, sr) { if ($(id)) $(id).innerHTML = '<span class="tb-v">' + icon + '<b>' + value + '</b></span><small>' + label + '</small><span class="sr">' + sr + '</span>'; }
    if ($('tb-lv')) { $('tb-lv').textContent = S.level.level; }
    item('tb-streak', Art.flame(20, !S.playedToday), S.streak, 'streak', S.playedToday ? ' days in a row' : ' days in a row, play today to keep it');
    item('tb-xp', Art.xpIcon(20), S.xp, 'XP', ' XP in all');
    item('tb-goal', Art.goalRing(S.today / S.goal, 22), Math.min(S.today, S.goal) + '/' + S.goal, 'today', ' XP of today\'s goal');
  }
  var lastFocus = null;
  function openSheet(el) {
    lastFocus = document.activeElement;
    el.hidden = false; document.documentElement.classList.add('sheet-open');
    requestAnimationFrame(function () { el.classList.add('is-open'); });
    var f = el.querySelector('.btn-cta, button:not([disabled]), a'); if (f) f.focus({ preventScroll: true });
    function close() {
      el.classList.remove('is-open'); document.documentElement.classList.remove('sheet-open');
      setTimeout(function () { el.hidden = true; }, 200);
      document.removeEventListener('keydown', key); el.removeEventListener('click', click);
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    }
    function key(e) { if (e.key === 'Escape') close(); }
    function click(e) { if (e.target.closest('[data-close]')) close(); }
    document.addEventListener('keydown', key); el.addEventListener('click', click);
  }
  function soundToggle(btn) {
    function paint() { var on = Reward.soundOn(); btn.setAttribute('aria-pressed', String(on)); btn.innerHTML = Art.glyph(on ? 'sound' : 'mute', 20) + (on ? 'Sound on' : 'Sound off'); }
    btn.onclick = function () { Reward.setSound(!Reward.soundOn()); paint(); Reward.sound('tap'); };
    paint();
  }
  document.querySelectorAll('[data-g]').forEach(function (el) { el.innerHTML = Art.glyph(el.dataset.g, 24); });
  root.App = { topbar: topbar, openSheet: openSheet, soundToggle: soundToggle };
})(this);
