const assert = require('assert');
const P = require('../path.js');
let mem = null;
P._store.get = () => mem; P._store.set = (v) => { mem = v; };
const day = (d, h = 10) => new Date(2026, 10, d, h);

// 25 nodes in order, five per unit, ending in a trophy
assert.strictEqual(P.NODES.length, 25);
assert.deepStrictEqual(P.NODES.slice(0, 5).map(n => n.kind), ['lesson', 'game', 'lesson', 'challenge', 'trophy']);

// Levels: 0, 50, 150, 300 XP
assert.strictEqual(P.level(0).level, 1); assert.strictEqual(P.level(49).level, 1); assert.strictEqual(P.level(50).level, 2);
assert.strictEqual(P.level(149).level, 2); assert.strictEqual(P.level(150).level, 3); assert.strictEqual(P.level(300).level, 4);

// Stars
assert.strictEqual(P.stars('payoff', 3), 1); assert.strictEqual(P.stars('payoff', 8), 2); assert.strictEqual(P.stars('payoff', 12), 3);
assert.strictEqual(P.stars('ticket', 99999), 2); assert.strictEqual(P.stars('ticket', 100000), 3);

// Only the first node is open
let s = P.load();
assert.strictEqual(P.status(s, 'u1-l1'), 'current'); assert.strictEqual(P.status(s, 'u1-play'), 'locked');

// A locked lesson played directly: practice XP, node stays locked
let r = P.finishLesson('u1-l2', 1, 'Time value', day(1));
assert.strictEqual(r.xp, 5); assert.strictEqual(P.load().nodes['u1-l2'], undefined);

// Lesson 1 with no mistakes: 15 XP, two badges, streak 1
P.reset();
r = P.finishLesson('u1-l1', 0, 'What an option is', day(1));
assert.strictEqual(r.xp, 15); assert(r.perfect); assert.deepStrictEqual(r.badges.sort(), ['first-lesson', 'perfect']);
assert.strictEqual(r.streak, 1); assert(r.streakUp); assert.strictEqual(r.next.id, 'u1-play');

// Game: completes the play node; a second play the same day keeps the streak
r = P.finishGame('ticket', 96000, day(1, 12));
assert.strictEqual(r.xp, 25); assert.strictEqual(r.stars, 2); assert(r.badges.includes('first-trade'));
assert.strictEqual(r.streak, 1); assert(!r.streakUp); assert(r.goalHit, 'crossed the 30 XP goal: ' + r.today);

// Next day: lesson 2 moves the streak to 2
r = P.finishLesson('u1-l2', 2, 'Time value', day(2));
assert.strictEqual(r.streak, 2); assert.strictEqual(r.xp, 10); assert.strictEqual(r.next.id, 'u1-goal');

// Challenge failed: 5 XP, node open; passed: 30 XP + stars, trophy finishes itself (+20) and the unit badge
r = P.finishGame('ticket', 80000, day(2, 11));
assert.strictEqual(r.passed, false); assert.strictEqual(r.xp, 5); assert.strictEqual(P.status(P.load(), 'u1-goal'), 'current');
r = P.finishGame('ticket', 101000, day(2, 12));
assert(r.passed); assert.deepStrictEqual(r.trophies, [1]); assert.strictEqual(r.xp, 30 + 10 + 20);
assert(r.badges.includes('unit-1') && r.badges.includes('three-stars')); assert.strictEqual(r.next.id, 'u2-l1');

// A day skipped breaks the streak; the summary shows 0 before playing
assert.strictEqual(P.summary(day(4)).streak, 0);
r = P.finishLesson('u2-l1', 0, 'Payoff', day(4));
assert.strictEqual(r.streak, 1);

// Streak of 3 across days
P.reset();
[1, 2, 3].forEach(d => { r = P.finishLesson('u1-l1', 1, 'x', day(d)); });
assert.strictEqual(r.streak, 3); assert(r.badges.includes('streak-3'));

// Level up flag
P.reset(); mem = JSON.stringify(Object.assign(JSON.parse(mem), { xp: 45 }));
r = P.finishLesson('u1-l1', 0, 'x', day(9)); assert(r.levelUp); assert.strictEqual(r.level, 2);

// Corrupt storage falls back to a blank state
mem = '{bad'; assert.strictEqual(P.load().xp, 0); mem = 'null'; assert.strictEqual(P.load().xp, 0);
console.log('path ok');
