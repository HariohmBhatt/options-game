# A hands-on question style for the lessons

The lesson player has five question kinds: choice, truefalse, numbers, payoff and match. In all five you pick text or a picture. This proposal adds one kind where you move the mechanic itself: you put a marker where you think something happens, and Check draws the real line under your marker.

Prototype: [prototypes/question-style.html](prototypes/question-style.html). Open it from a file or a local server; `?q=1`, `?q=2`, `?q=3` jump to a question. Screenshots are in [prototypes/shots/](prototypes/shots/).

## Status: shipped

The dial is in the lesson player: `lessons/dial.js` (shared by the player and `test/lessons.test.js`), styles in `lesson.css`. Seven lessons have one, as in the table at the end: u1-l2 (days), u2-l1 (expiry), u2-l2 (expiry, straddle), u3-l1 (days, counted in 15-minute steps on expiry Tuesday: half the ₹5,489 is gone at 14:00), u3-l2 (strike), u5-l1 (expiry, sold CE), u5-l2 (expiry, credit spread). Each lesson still has six questions.

### Teach cards you touch

Every teach card (all 30) carries one thing to touch, with a `try` line that says what to do ("Drag NIFTY past 24,170: it crosses ₹0."). The card text plus the try line stay within 30 words (`test/lessons.test.js` checks both, and works every figure on the cards out again from `market.js` and the payoff maths).

| Picture | Data | What it shows |
|---|---|---|
| Dial, curve shown | `dial: explore(axis, pos, min, max, days)` | `expiry`: P/L at expiry; `days`: premium melting (a one-day range counts in 15-minute steps); `strike`: premium along the chain; `spot`: premium against NIFTY now with `days` left, with the dashed intrinsic line, so the gap is time value. The readout says "₹12,825 = ₹3,250 intrinsic + ₹9,575 time". |
| Mini chain | `chain: { spot, rows, notes, oi? }` | Three rows; tapping one explains it. |
| Lot calculator | `lot: { pts, label?, step? }` | Premium (or LTP) × 65 × lots, each with − and +; the sum is a polite live region. |
| Outcomes | `cases: { head, pick: [{ label, rows: [[who, ₹, note]] }] }` | Two toggle buttons (`aria-pressed`); each shows a card per side with its ₹ P/L a lot. Enter and Space press them. |
| Bid/ask strip | `quote: { type, K }` | Bid, mid and ask from `Market.fill`, the gap as ₹ a lot; Buy pays the ask, Sell gets the bid, with `Market.charges`. |
| Margin bars | `margin: { type, K }` | A sold option: premium in against `Market.shortMargin` blocked, lots on − and +, STT on the sale. |

Which cards have which (card 1, 2, 3):

| Lesson | Cards |
|---|---|
| u1-l1 | outcomes (24,000 CE buyer and seller, NIFTY ends 23,800 or 24,300), expiry dial, lot |
| u1-l2 | spot, days, bid/ask strip |
| u2-l1 | expiry (bought CE), expiry (bought PE, breakeven 23,831.10), expiry (sold CE) |
| u2-l2 | spread, straddle, short strangle |
| u3-l1 | hours on the ITM 23,900 CE (lands on its ₹6,500 intrinsic line), spot (expiry morning), hours |
| u3-l2 | PE strikes, days, lot (24,450 CE at 26.40) |
| u4-l1 | chain (reading both sides), chain (ITM), lot (LTP) |
| u4-l2 | OI chain (walls), OI chain (what holders are paid at each strike: max pain 24,000, PCR 0.88), spot (delta) |
| u5-l1 | sold PE, margin bars, sold CE |
| u5-l2 | spot (marked to market), outcomes (stop-loss at 250: a slide fills at 250, a 3% gap open at 722.40), credit spread |

### Feedback, match slips, daily review

- **Dial result.** The feedback panel shows the answer and the pick ("Answer: NIFTY 24,168.90. You: 24,030."); a screen reader also hears "138.90 points off; within 20 points counts, so this is a miss" (`Dial.result`).
- **Wick** reacts beside the verdict: a 44 px cheer that bounces when right, an oops that droops when wrong (no motion under reduced motion).
- **Match.** The first wrong pairing is forgiven: an amber shake and "Not that one. One more slip and this question comes back later." The second makes the question a miss.
- **Daily review.** `lesson.html?id=daily` plays six questions from the lessons the player has finished (unit 1 if none), seeded by the date so the mix is the same all day, each question kind once before any repeats (`Lessons.daily(done, day)`). No teach cards. It finishes with `Path.finishLesson('daily', mistakes, 'Daily review · n of 6 right first time')`.

## Candidates

Every candidate had to work one-handed on a phone, take under 30 seconds, and show why the answer is right.

| # | Style | What it teaches | How it works | Scoring and feedback | Keyboard and screen reader | Cost |
|---|---|---|---|---|---|---|
| 1 | **Dial: place it, then see the line** | Where something happens along one axis: breakeven (NIFTY at expiry), how fast time value melts (time), how premium falls with distance (strike) | One slider under a chart. Drag the chart or the thumb, or tap − and +. The curve is hidden. Check draws it, with a green band where the answer is. The slider stays live afterwards so you can explore the line. | Right inside a tolerance, "Close" just outside it (still counts as a miss), otherwise wrong. The panel gives the exact answer and the why. The chart shows your marker, the real crossing and the gap between them. | Native `<input type=range>`: arrow keys, Page Up/Down, Home/End. `aria-valuetext` reads "Tue 09:15, 1 trading day left", plus "Premium ₹5,489 a lot" after Check. − and + are real buttons with labels like "NIFTY 5 points lower". | About 180 lines (dial ~120, CSS ~35, player ~15, test ~12) |
| 2 | Expiry scrub, live P/L | How a position's P/L changes as NIFTY moves | Same slider; P/L updates live as you drag. You are asked to stop at a P/L. | Weak: the live number gives the answer away, so there is nothing to predict. | As 1 | Built into 1: the dial is live after Check |
| 3 | Drag the breakeven pin on a drawn chart | Reading a payoff chart | The line is visible; drag a pin to where it crosses zero. | Too easy: you can see the crossing. It tests your eyes, not your reasoning. | As 1 | 1 with the line shown first |
| 4 | Build the ticket | Side, type and strike for a view ("you expect a fall and want a capped loss") | Three chip rows: BUY/SELL, CE/PE, strike. | Right if all three match. Payoff.hint already explains each wrong field. | Chips are buttons | About 80 lines, but Payoff Painter already does this as a full game |
| 5 | Estimate the ₹ figure on a slider | Sizing: premium × 65, max loss | Slide to a rupee amount, scored by closeness, e.g. within ₹500. | Partial credit by distance | Range input | About 60 lines; the same lesson as "numbers" with a less exact input |
| 6 | Put cards in order | Moneyness and price: cheapest to dearest, most to least ITM | Tap four cards in order; each tap numbers a card. | Right if the order is exact. The feedback shows each card's premium. | Buttons in tab order, plus an undo button | About 70 lines; good, but you still only tap text |
| 7 | Swipe sort | ITM/OTM, buyer/seller risk | Swipe a card left or right, with two buttons as the equivalent. | Each card right or wrong | Two buttons | About 90 lines; a truefalse question with a gesture added |

## Recommendation: the dial (candidate 1), one component with three axes

**What the slider moves**

- **`expiry`**: NIFTY at expiry. The curve is `Payoff.pl(pos, S)`, which also works for spreads.
- **`days`**: trading days passed. The curve is `Market.premium(...) × 65` as T runs down to zero.
- **`strike`**: the strike. The curve is `Payoff.premium(type, K) × 65`, so you walk the chain.

**Why this one**

- **Learning value.** You commit to a guess before you see the line. Most people put the half-life of an ATM option near Monday, the midpoint. The line then shows half the premium still there at Tuesday 09:15. A wrong guess here teaches more than a right tap does elsewhere, and the "why" panel names the exact number.
- **The itch.** Each question ends with the line being drawn under your marker. The slider stays live after Check, so the player can drag along the real line and watch ₹ per lot change. That is the hands-on part the user asked for.
- **Fit.** All the maths already exists:
  - `Payoff.pl`, `Payoff.premium` and `Market.premium` give the curves.
  - The green and red colours, the clip, the feedback panel, the Check/Continue button, the "Try this one again" requeue and the XP rules are unchanged.
  - A dial question is right or wrong like any other, so `Path.finishLesson(id, mistakes)` needs no change.
  - "Close" is only a softer headline on a miss.
- **Risk.**
  - Slider precision on a phone: 120 steps of 5 points across about 330 px is about 2.8 px a step. This is why the − and + buttons and the tolerance exist.
  - Visible scroll on very short screens (320×568): handled by scrolling the chart above the feedback panel after Check (see shot `q2-wrong-320x568-light.png`).
  - A dial question takes more vertical space than a choice question.

## Data shape

It sits next to the other kinds in `lessons/content.js` and uses the existing `leg()` helper:

```js
{ kind: 'dial',
  dial: 'expiry' | 'days' | 'strike',  // what the slider moves
  pos: leg('buy', 'call', 24000),       // or an array of legs (expiry only); for 'strike' leave K out
  x: { min, max, step, start },         // slider range; for 'days' x = trading days passed, max = days left at the start
  goal: 0,                              // ₹ per lot the answer reaches: 0 = breakeven, drawn as the dashed line after Check
  answer: 24168.9,                      // x where the curve crosses goal (need not sit on the step grid)
  tol: 20,                              // right if |pick − answer| ≤ tol; "Close" if ≤ 2·tol + step
  prompt: '…', why: '…' }
```

The world is the Payoff Painter one: NIFTY 24,000, India VIX 14, 4 trading days to the Tuesday 15:30 expiry, lot 65. On the `days` dial, the 4 days run Thursday 09:15 to Tuesday 15:30, counted the way `Market.yearsToExpiry` counts them.

## The three examples

Every number below was computed with the repo's code, using `node -e` on `games/payoff/logic.js` and `market.js`. The prototype runs the same check with `console.assert`: the goal is crossed in the step that ends at the answer, and the start position is not already right.

**1. Unit 2, Reading a payoff chart (`u2-l1`).** Expiry dial.

```js
{ kind: 'dial', dial: 'expiry', pos: leg('buy', 'call', 24000),
  x: { min: 23700, max: 24300, step: 5, start: 24000 }, goal: 0, answer: 24168.9, tol: 20,
  prompt: 'You buy the 24,000 CE for 168.90 points. Drag NIFTY to its breakeven at expiry.',
  why: 'Breakeven is strike + premium: 24,000 + 168.90 = 24,168.90. Below it the CE pays back less than the ₹10,979 you paid for the lot, before charges.' }
```

- `Payoff.stats(leg('buy','call',24000))` gives premium 168.90, premiumRs 10,978.50 (shown as ₹10,979) and breakeven 24,168.90.
- After Check the line is red below zero and green above it, as in the games.

**2. Unit 1, Time value and VIX (`u1-l2`).** Days dial.

```js
{ kind: 'dial', dial: 'days', pos: leg('buy', 'call', 24000),
  x: { min: 0, max: 4, step: 0.25, start: 0 }, goal: 5489.25, answer: 3, tol: 0.25,
  prompt: 'Thursday 09:15: the 24,000 CE costs ₹10,979 a lot. If NIFTY stays at 24,000, when is half of that gone?',
  why: 'Half is gone at Tuesday 09:15, with 1 trading day left. Decay speeds up near expiry: the first 3 days take ₹5,489, the last day takes the other ₹5,489.' }
```

- `Market.premium({type:'call', S:24000, K:24000, T:d/252})` gives 168.90 at 4 days left and 84.45 at 1 day left: exactly half.
- 84.45 × 65 = ₹5,489.25.

**3. Unit 3, Why cheap options trap buyers (`u3-l2`).** Strike dial.

```js
{ kind: 'dial', dial: 'strike', pos: leg('buy', 'call'),
  x: { min: 24000, max: 24600, step: 50, start: 24000 }, goal: 2000, answer: 24450, tol: 0,
  prompt: 'The 24,000 CE costs ₹10,979 a lot, 4 days to expiry. Drag to the nearest CE strike that costs under ₹2,000.',
  why: 'The 24,450 CE costs 26.40 points, ₹1,716 a lot. It is cheap because NIFTY has to rise 450 points in 4 days just to reach the strike.' }
```

- `Payoff.premium('call', K) × 65` gives ₹2,194 at 24,400 and ₹1,716 at 24,450, so 24,450 is the first strike under ₹2,000.
- `tol: 0` means only 24,450 is right. 24,400 and 24,500 get "Close".

## Integrating it into lesson.html

Five changes, none to the existing kinds:

1. **Dial code.** Move the `Dial` object from the prototype into `lessons/dial.js` (~120 lines, plain script, as with the other modules) and add `<script src="lessons/dial.js">` after `games/payoff/logic.js`. Do not inline it, because lesson.html's script is already long.

2. **`show()`.** About 6 lines:
   ```js
   else if (q.kind === 'dial') h += Dial.html(q);
   // after $('stage').innerHTML = h:
   if (q.kind === 'dial') dial = Dial.mount(q, function (v) { if (phase === 'answer') { pick = v; $('go').disabled = false; } });
   ```
   - Focus `#dl-range` instead of the first `.ls-opt` on a fine pointer.
   - Check stays disabled until the first move, so a stray tap cannot submit the start value.

3. **`check()`, `verdict()` and `correctText()`.** About 8 lines:
   - `check()`: for a dial, `var v = Dial.verdict(q, dial.value())`, then call `verdict(v === 'right', v === 'close')`.
   - `verdict()`: take the `close` flag and use the headline "Close, not quite".
   - Call `dial.reveal(v)` after the feedback panel is shown, then scroll the chart clear of the sticky footer (two lines; see the prototype).
   - `correctText()`: return `Dial.answerText(q)`. For a dial, show the Answer line even when right, because the exact figure is the lesson.

4. **Keyboard handler.** One line. The Enter shortcut must skip focused buttons, or Enter on − or + submits instead of stepping: `if (e.target.closest && e.target.closest('a, button')) return;` for the Enter branch. The number keys need no change: a dial has no `.ls-opt`.

5. **Styles and tests.**
   - **lesson.css:** copy the prototype's `<style>` block (~35 lines, `.dl-*`). It uses only existing tokens, so dark mode works as is.
   - **test/lessons.test.js:** add `dial` to the known kinds (~12 lines). Require `games/payoff/logic.js` and `market.js`, then assert:
     - `dial` is one of the three axes;
     - `min < start < max`, and the answer is inside the range;
     - `(f(answer) − goal) · (f(answer − step) − goal) ≤ 0`, so the answer is where the goal is crossed;
     - the start position is not already right;
     - the prompt and why pass the existing `text()` rules.

     The f() maths should live in `lessons/dial.js` as `Dial.f`, exported for node like the other modules, so the test and the player share one copy.

About 180 new lines in total, and about 15 lines changed in lesson.html.

## Which lessons should get one

Replace one question per lesson so each lesson keeps six questions. The test requires six.

| Lesson | Dial | Question | Replaces |
|---|---|---|---|
| u1-l2 Time value and VIX | days | Example 2: half the premium gone at Tuesday 09:15 | q3, the truefalse "keeps its value" (same idea, now felt) |
| u2-l1 Reading a payoff chart | expiry | Example 1: breakeven 24,168.90 | q2, the numbers question "breakeven 24,100" (the same skill) |
| u2-l2 Spreads, straddles, strangles | expiry | Long 24,000 straddle costs 337.80 points; drag to the upper breakeven: 24,337.80 (`Payoff.spreadStats`) | q6, the choice question on straddle breakevens |
| u3-l1 Expiry day | days, in hours | Tuesday 09:15, ATM CE ₹5,489; half is gone at 14:00 (`Market.premium` with T in hours) | q6, the choice question "loses time value fastest" |
| u3-l2 Why cheap options trap buyers | strike | Example 3: 24,450 CE is the first under ₹2,000 | q3, the numbers question "breakeven 24,305" |
| u5-l1 Selling an option | expiry | Sold 24,000 CE at 168.90; drag to where the loss is twice the premium: 24,506.70 (range up to 24,700) | q3, the numbers question on the 24,300 loss |
| u5-l2 Gap days and hedging | expiry | Sell 24,000 PE, buy 23,900 PE; drag to where the loss stops growing: 23,900 (max loss ₹3,809) | q4, the payoff question "sold PE with loss capped" |

Leave unit 4 (the chain, OI and PCR) without a dial. Those lessons are about reading positions, not a curve along one axis.

Start with the three examples (u1-l2, u2-l1, u3-l2), check them on a real phone, then add the rest. The u3-l1 hours variant needs one more `clock` mode in the dial: the prototype's clock assumes the 4-day Thursday-to-Tuesday week.
