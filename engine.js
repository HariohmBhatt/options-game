// Shared options engine. Plain script (works from file://), also loadable in node for tests.
(function (root) {
  function normCdf(x) {
    // Abramowitz-Stegun approximation, error < 7.5e-8
    var t = 1 / (1 + 0.2316419 * Math.abs(x));
    var d = 0.3989422804 * Math.exp(-x * x / 2);
    var p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - p : p;
  }

  // Value of an option at expiry (intrinsic value).
  function payoff(type, S, K) {
    return Math.max(0, type === 'call' ? S - K : K - S);
  }

  // Black-Scholes fair price. T in years, sigma annualised (0.3 = 30%), r annual rate.
  function price(o) {
    var S = o.S, K = o.K, T = o.T, sigma = o.sigma, r = o.r || 0;
    if (T <= 0 || sigma <= 0) return payoff(o.type, S, K);
    var sq = sigma * Math.sqrt(T);
    var d1 = (Math.log(S / K) + (r + sigma * sigma / 2) * T) / sq;
    var d2 = d1 - sq;
    return o.type === 'call'
      ? S * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2)
      : K * Math.exp(-r * T) * normCdf(-d2) - S * normCdf(-d1);
  }

  // Seeded RNG (mulberry32) so daily challenges can be replayed.
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Random daily price path (geometric Brownian motion). Returns [S0, S1, ... S_days].
  function pricePath(o) {
    var rand = rng(o.seed == null ? Date.now() : o.seed);
    var dt = 1 / 252, S = o.S0, out = [S];
    for (var i = 0; i < o.days; i++) {
      var u1 = Math.max(rand(), 1e-12), u2 = rand();
      var z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      S = S * Math.exp(((o.drift || 0) - o.sigma * o.sigma / 2) * dt + o.sigma * Math.sqrt(dt) * z);
      out.push(S);
    }
    return out;
  }

  // Cross-game progress, stored in localStorage.
  var KEY = 'optionsgames.progress';
  var progress = {
    load: function () { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } },
    done: function (game, score) {
      var p = progress.load();
      p[game] = { done: true, best: Math.max(score || 0, (p[game] && p[game].best) || 0), at: Date.now() };
      try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
      return p;
    }
  };

  var Engine = { normCdf: normCdf, payoff: payoff, price: price, rng: rng, pricePath: pricePath, progress: progress };
  if (typeof module !== 'undefined') module.exports = Engine; else root.Engine = Engine;
})(this);
