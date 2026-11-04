# Options Games

Small browser games that teach how options trading works on the Indian market (NSE / NIFTY), one mechanic at a time. No backend, no sign-up, no build step. Built for phones first.

Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works).

## Games

| # | Game | Teaches |
|---|------|---------|
| 1 | `games/ticket/` NIFTY Weekly | An option is a right, not an obligation. CE/PE, strike, premium, lot, Tuesday expiry, time value melting. |
| 2 | `games/payoff/` Payoff Painter | Payoff diagrams in ₹ per lot: breakeven, max loss, max gain, why sellers can lose without limit. |
| 3 | `games/expiry/` Expiry Tuesday | 0DTE: an OTM option's price is time value and it goes to zero by 15:30. Charges eat small wins. |

Planned: option chain reading (OI, IV, max pain), Greeks, seller mode with margin, event days (RBI, Budget, election results), historical replay from NSE data you download yourself, live paper trading with your own broker API key.

## Shared code

`engine.js`, the maths:

- `Engine.price({type, S, K, T, sigma, r})` Black-Scholes price. `T` in years, `sigma` annualised.
- `Engine.payoff(type, S, K)` intrinsic value at expiry.
- `Engine.pricePath({S0, sigma, days, seed, drift})` plain lognormal daily path, reproducible by seed.
- `Engine.progress.load()` / `Engine.progress.done(game, score)` cross-game progress in localStorage.

`market.js`, the Indian market:

- `Market.INDICES` NIFTY (step 50, lot 65, weekly Tuesday expiry) and BANKNIFTY (step 100, lot 30, monthly last Tuesday). Jan 2026 series.
- `Market.strikes(index, spot, n)`, `Market.atm(index, spot)` strike ladder.
- `Market.nextExpiry(index, date)`, `Market.tradingDaysBetween`, `Market.yearsToExpiry(now, expiry)` time to expiry down to the minute of the 09:15 to 15:30 session. Holidays are ignored.
- `Market.premium({type, S, K, T, vix})` price ticked to 0.05, volatility from India VIX (`Market.VIX`).
- `Market.charges({side, premium, qty, exercised})` brokerage ₹20, STT 0.15% on sell premium / on intrinsic at settlement (April 2026 rates), exchange 0.035%, SEBI, stamp duty, GST 18%.
- `Market.netPnl({buy, sell | intrinsic, qty})` round-trip gross, charges, net.
- `Market.dailyPath({S0, days, vix, seed})` fat-tailed (Student-t) daily closes with volatility clustering.
- `Market.intradayPath({prevClose, vix, seed, stepMin})` one session of ticks with an overnight gap and U-shaped intraday volatility.
- `Market.fmt(x)` rupees with Indian grouping (₹1,05,603), `Market.hhmm(minutes)`.

Tests: `for t in test/*.js; do node $t; done`

## Contributing

One folder per game under `games/`. A game is a single `index.html` that loads `../../engine.js`, `../../market.js` and `../../style.css`, with its pure logic in `logic.js` using the same module pattern so it can be tested in node. Keep it playable at 360px wide with 44px tap targets.

Educational only. Nothing here is financial advice. All prices are simulated. Contract specs and charges change; check NSE circulars before relying on any number.

MIT License.
