# Options Games

Small browser games that teach how options trading works, one mechanic at a time. No backend, no sign-up, no build step.

Open `index.html` in a browser, or serve the folder with any static host (GitHub Pages works).

## Games

| # | Game | Teaches |
|---|------|---------|
| 1 | `games/ticket/` | An option is a right, not an obligation. Call, put, strike, premium, expiry. |
| 2 | `games/payoff/` | Payoff diagrams, breakeven, max loss, max gain. |

Planned: 3 time decay + volatility, 4 market maker + delta hedging, 5 strategy builder.

## Shared engine (`engine.js`)

Every game uses the same core:

- `Engine.price({type, S, K, T, sigma, r})` Black-Scholes price. `T` in years, `sigma` annualised.
- `Engine.payoff(type, S, K)` intrinsic value at expiry.
- `Engine.pricePath({S0, sigma, days, seed, drift})` random daily price path, reproducible by seed.
- `Engine.progress.load()` / `Engine.progress.done(game, score)` cross-game progress in localStorage.

Test: `node test/engine.test.js`

## Contributing

One folder per game under `games/`. A game is a single `index.html` that loads `../../engine.js` and `../../style.css`. Keep game logic in pure functions so it can be tested in node.

Educational only. Nothing here is financial advice. All prices are simulated.

MIT License.
