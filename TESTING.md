# Testing like a human

Automated checks: `for t in test/*.js; do node $t; done`. Everything below is what a person does with a phone in hand. Run it on every game before merging.

## 1. First-time beginner (phone, 360px, knows nothing about options)
- Open the hub. Does the first screen tell you what this is and what to tap? Tap Play.
- Read the "How it works" card. Every term (CE, PE, strike, premium, lot, expiry, time value, STT) is explained in plain words before it is used.
- Play one full game without help. Note every moment you were unsure what to do or what a number meant.
- Every ₹ figure: can you tell whether it is per unit or per lot (65 units)? Is the sign obvious without colour?
- After a loss, does the "why" sentence match what actually happened on the chart (index moved against you vs time melted vs charges)?
- Finish, return to the hub: badge updated? Play a second game: bankrolls independent?

## 2. Impatient / clumsy user
- Tap Buy before choosing anything. Tap Buy twice fast. Double-tap "Next day" / "+30 min" ten times.
- Tap Sell twice. Tap a disabled button. Tap during a result card.
- Lose until the bankroll is below the cost of one lot. Can you still buy? Does the game say what happens?
- Reload mid-round: what is kept (bankroll) and what is lost (round)? Is it obvious?
- Browser back mid-round, then forward. Open a game URL directly without the hub.
- Clear site data, replay. Private/incognito window (localStorage may be blocked): no crash, game still playable.

## 3. Boundaries
- Expiry Tuesday: "+30 min" from 15:05, 15:10, 15:25 never passes 15:30; buy at 15:25 then +5; settlement exactly at 15:30.
- NIFTY exactly at the strike at expiry (intrinsic 0): lapses, the text says so.
- Deep ITM and far OTM strikes; the cheapest premium (0.05); the largest ₹ figure formats with lakh grouping.
- A round where the premium doubled then went to zero: summary counts it as "looked like a winner".

## 4. Devices and settings
- Widths 320, 360, 390, 430, 768, 1280. Landscape 740×360. No sideways scroll, nothing cut off, all tap targets ≥ 44px and not touching each other.
- Pinch zoom works (no `user-scalable=no`). System font size 150%: text still fits.
- Dark and light mode: contrast readable, chart lines visible in both.
- Chromium and WebKit (Safari engine). Load from `file://` and from a sub-path on a static host (relative links).

## 5. Keyboard and screen reader
- Play a whole game with Tab / Enter / Space only. Focus is visible and in a sensible order.
- Toggle buttons expose `aria-pressed`; the chart has `role="img"` with a useful label; result cards are announced (`aria-live`).
- Profit/loss is never conveyed by colour alone.

## 6. Content
- Read every string once, slowly. Typos, mixed terms (call vs CE), ₹ vs points, wrong facts (lot 65, Tuesday expiry, STT 0.15% on sell / on intrinsic at settlement, SEBI: 91% of individual F&O traders lost money in FY25, ₹1.05 lakh crore).

Record findings as: what you did, what you expected, what happened, how much it would mislead a learner (high / medium / low).
