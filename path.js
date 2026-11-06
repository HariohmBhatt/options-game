// The learning path: units, nodes, XP, levels, streak, daily goal, stars and badges.
// Plain script (works from file://) and a node module for tests. State lives in localStorage under one key.
(function (root) {
  var KEY = 'optionsgames.path';
  var DAILY_GOAL = 30;

  // Stars from a game's final score: [2-star threshold, 3-star threshold]. 1 star for finishing.
  var GAMES = {
    ticket: { title: 'NIFTY Weekly', href: 'games/ticket/index.html', stars: [95000, 100000], unit: 'rupees',
      goal: 'Finish 5 rounds with ₹95,000 or more left' },
    payoff: { title: 'Payoff Painter', href: 'games/payoff/index.html', stars: [8, 11], unit: 'of 12',
      goal: 'Match 8 or more of 12 lines on the first try' },
    expiry: { title: 'Expiry Tuesday', href: 'games/expiry/index.html', stars: [47500, 50000], unit: 'rupees',
      goal: 'Finish expiry day with ₹47,500 or more left' },
    chain: { title: 'Read the Chain', href: 'games/chain/index.html', stars: [6, 8], unit: 'of 8',
      goal: 'Answer 6 or more of 8 chain questions first time' },
    seller: { title: "Seller's Week", href: 'games/seller/index.html', stars: [195000, 200000], unit: 'rupees',
      goal: 'Finish the week with ₹1,95,000 or more left' }
  };

  var UNITS = [
    { n: 1, game: 'ticket', title: 'Buy your first option', blurb: 'CE, PE, strike, premium and a week of time decay.' },
    { n: 2, game: 'payoff', title: 'Draw the payoff', blurb: 'What you make or lose at expiry, line by line.' },
    { n: 3, game: 'expiry', title: 'Survive expiry day', blurb: 'Why time value hits zero by 15:30 on Tuesday.' },
    { n: 4, game: 'chain', title: 'Read the option chain', blurb: 'ATM, open interest, IV, PCR and max pain.' },
    { n: 5, game: 'seller', title: 'Sell an option', blurb: 'Margin, theta income, a gap day and a hedge.' }
  ];

  // Each unit: lesson, game, lesson, challenge, trophy. XP: lesson 10 (+5 with no mistakes), game 20 (+5 a star past one), challenge 30, trophy 20.
  var NODES = [];
  UNITS.forEach(function (u) {
    var g = GAMES[u.game];
    NODES.push({ id: 'u' + u.n + '-l1', unit: u.n, kind: 'lesson', lesson: 'u' + u.n + '-l1' });
    NODES.push({ id: 'u' + u.n + '-play', unit: u.n, kind: 'game', game: u.game, title: 'Play ' + g.title });
    NODES.push({ id: 'u' + u.n + '-l2', unit: u.n, kind: 'lesson', lesson: 'u' + u.n + '-l2' });
    NODES.push({ id: 'u' + u.n + '-goal', unit: u.n, kind: 'challenge', game: u.game, title: 'Challenge: ' + g.title });
    NODES.push({ id: 'u' + u.n + '-trophy', unit: u.n, kind: 'trophy', title: 'Unit ' + u.n + ' trophy' });
  });

  var BADGES = [
    { id: 'first-lesson', title: 'First lesson', how: 'Finish any lesson' },
    { id: 'first-trade', title: 'First trade', how: 'Finish NIFTY Weekly' },
    { id: 'perfect', title: 'No mistakes', how: 'Finish a lesson with every answer right first time' },
    { id: 'three-stars', title: 'Three stars', how: 'Earn 3 stars in any game' },
    { id: 'streak-3', title: '3-day streak', how: 'Play on 3 days in a row' },
    { id: 'streak-7', title: '7-day streak', how: 'Play on 7 days in a row' },
    { id: 'unit-1', title: 'Option buyer', how: 'Finish unit 1' },
    { id: 'unit-2', title: 'Shape reader', how: 'Finish unit 2' },
    { id: 'unit-3', title: 'Expiry survivor', how: 'Finish unit 3' },
    { id: 'unit-4', title: 'Chain reader', how: 'Finish unit 4' },
    { id: 'unit-5', title: 'Option seller', how: 'Finish unit 5' },
    { id: 'level-5', title: 'Level 5', how: 'Reach level 5' }
  ];

  function blank() { return { xp: 0, nodes: {}, days: {}, streak: 0, best: 0, last: null, badges: {}, games: {} }; }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function prevDay(k) { var p = k.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2] - 1); return dayKey(d); }

  var store = {
    get: function () { try { return root.localStorage && root.localStorage.getItem(KEY); } catch (e) { return null; } },
    set: function (s) { try { root.localStorage && root.localStorage.setItem(KEY, s); } catch (e) {} }
  };
  function load() {
    var s = null; try { s = JSON.parse(store.get()); } catch (e) {}
    if (!s || typeof s !== 'object' || !isFinite(s.xp)) return blank();
    var b = blank(); for (var k in b) if (!(k in s)) s[k] = b[k];
    return s;
  }
  function save(s) { store.set(JSON.stringify(s)); }

  // Level from total XP: level L starts at 25·L·(L−1) XP (0, 50, 150, 300, 500 …).
  function level(xp) { var L = 1; while (25 * (L + 1) * L <= xp) L++; return { level: L, from: 25 * L * (L - 1), to: 25 * (L + 1) * L }; }

  function stars(game, score) { var t = GAMES[game].stars; return score >= t[1] ? 3 : score >= t[0] ? 2 : 1; }

  // A node is open when every node before it is done (the path runs in order); trophies finish themselves.
  function status(s, id) {
    if (s.nodes[id]) return 'done';
    for (var i = 0; i < NODES.length; i++) { if (NODES[i].id === id) return 'current'; if (!s.nodes[NODES[i].id]) return 'locked'; }
    return 'locked';
  }
  function current(s) { for (var i = 0; i < NODES.length; i++) if (!s.nodes[NODES[i].id]) return NODES[i]; return null; }
  function node(id) { for (var i = 0; i < NODES.length; i++) if (NODES[i].id === id) return NODES[i]; return null; }
  function unitDone(s, n) { return NODES.every(function (x) { return x.unit !== n || s.nodes[x.id]; }); }

  // Adds XP for today, moves the streak, completes trophies that became due, grants badges.
  // Returns the award: what the reward screen shows.
  function award(s, a, now) {
    var today = dayKey(now), before = level(s.xp).level, wasToday = s.days[today] || 0;
    if (s.last !== today) { s.streak = s.last === prevDay(today) ? s.streak + 1 : 1; s.last = today; }
    s.best = Math.max(s.best, s.streak);
    var xp = a.xp, trophies = [];
    NODES.forEach(function (x) {
      if (x.kind === 'trophy' && !s.nodes[x.id] && status(s, x.id) === 'current' && NODES.every(function (y) { return y.unit !== x.unit || y.kind === 'trophy' || s.nodes[y.id]; })) {
        s.nodes[x.id] = { at: +now || Date.now() }; xp += 20; trophies.push(x.unit);
      }
    });
    s.xp += xp; s.days[today] = wasToday + xp;
    var fresh = [];
    function grant(id) { if (!s.badges[id]) { s.badges[id] = +now || Date.now(); fresh.push(id); } }
    if (a.kind === 'lesson') grant('first-lesson');
    if (a.kind === 'lesson' && a.perfect) grant('perfect');
    if (a.game === 'ticket') grant('first-trade');
    if (a.stars === 3) grant('three-stars');
    if (s.streak >= 3) grant('streak-3');
    if (s.streak >= 7) grant('streak-7');
    for (var u = 1; u <= UNITS.length; u++) if (unitDone(s, u)) grant('unit-' + u);
    if (level(s.xp).level >= 5) grant('level-5');
    var lv = level(s.xp);
    return { kind: a.kind, title: a.title, xp: xp, parts: a.parts || [], stars: a.stars || 0, perfect: !!a.perfect,
      streak: s.streak, streakUp: wasToday === 0, today: s.days[today], goal: DAILY_GOAL, goalHit: wasToday < DAILY_GOAL && s.days[today] >= DAILY_GOAL,
      level: lv.level, levelUp: lv.level > before, levelFrom: lv.from, levelTo: lv.to, totalXp: s.xp,
      badges: fresh, trophies: trophies, next: current(s), passed: a.passed !== false };
  }

  // A lesson finished: mistakes = answers wrong the first time.
  function finishLesson(lessonId, mistakes, title, now) {
    var s = load(), id = lessonId, first = !s.nodes[id] && status(s, id) !== 'locked', perfect = mistakes === 0;
    var xp = (first ? 10 : 5) + (perfect ? 5 : 0);
    if (status(s, id) !== 'locked') s.nodes[id] = s.nodes[id] || { at: +now || Date.now() };
    var parts = [[first ? 'Lesson' : 'Practice', first ? 10 : 5]]; if (perfect) parts.push(['No mistakes', 5]);
    var r = award(s, { kind: 'lesson', xp: xp, perfect: perfect, title: title, parts: parts }, now);
    save(s); return r;
  }

  // A game finished with its final score. Completes the first open node of that game: the play node, then the challenge once its goal is met.
  function finishGame(game, score, now) {
    var s = load(), st = stars(game, score), g = GAMES[game];
    var prev = s.games[game] || { plays: 0, best: -Infinity, stars: 0 };
    s.games[game] = { plays: prev.plays + 1, best: Math.max(prev.best, score), stars: Math.max(prev.stars, st) };
    var play = node('u' + unitOf(game) + '-play'), goal = node('u' + unitOf(game) + '-goal');
    var parts = [], passed = true, xp = 0;
    if (!s.nodes[play.id] && status(s, play.id) !== 'locked') { s.nodes[play.id] = { at: +now || Date.now(), score: score }; parts.push(['Game', 20]); xp += 20; }
    else if (!s.nodes[goal.id] && status(s, goal.id) === 'current') {
      passed = st >= 2;
      if (passed) { s.nodes[goal.id] = { at: +now || Date.now(), score: score }; parts.push(['Challenge passed', 30]); xp += 30; }
      else { parts.push(['Challenge tried', 5]); xp += 5; }
    } else { parts.push(['Practice', 10]); xp += 10; }
    if (st > 1) { parts.push([st + ' stars', 5 * (st - 1)]); xp += 5 * (st - 1); }
    var r = award(s, { kind: 'game', game: game, xp: xp, stars: st, title: g.title, parts: parts, passed: passed }, now);
    r.goalText = g.goal; r.score = score;
    save(s); return r;
  }
  function unitOf(game) { for (var i = 0; i < UNITS.length; i++) if (UNITS[i].game === game) return UNITS[i].n; return 0; }

  // Today's XP and the streak as the path shows them (a streak breaks after a day with no play).
  function summary(now) {
    var s = load(), today = dayKey(now), alive = s.last === today || s.last === prevDay(today);
    return { xp: s.xp, today: s.days[today] || 0, goal: DAILY_GOAL, streak: alive ? s.streak : 0, playedToday: s.last === today,
      best: s.best, level: level(s.xp), badges: s.badges, games: s.games, state: s };
  }

  var Path = { KEY: KEY, DAILY_GOAL: DAILY_GOAL, GAMES: GAMES, UNITS: UNITS, NODES: NODES, BADGES: BADGES, load: load, save: save,
    level: level, stars: stars, status: status, current: current, node: node, finishLesson: finishLesson, finishGame: finishGame,
    summary: summary, dayKey: dayKey, _store: store, reset: function () { store.set(JSON.stringify(blank())); } };
  if (typeof module !== 'undefined') module.exports = Path; else root.Path = Path;
})(this);
