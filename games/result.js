// The parts the three price games share: one P/L breakdown with the same rows everywhere, Wick's reaction, the story under it,
// and the shell behaviour (compact header, rolling figures).
// Plain script for the browser (needs art.js), also loadable in node for tests.
(function (root) {
  var ROWS = [['direction', 'NIFTY moved'], ['time', 'Time passed'], ['vol', 'VIX changed'], ['gamma', 'Gamma (delta changed as NIFTY moved)'], ['costs', 'Spread and charges']];
  function cls(v) { v = Math.round(v); return v > 0 ? 'up' : v < 0 ? 'down' : ''; }

  // rows and why: keyed like ROWS (₹ amounts, one-line reasons). The amounts add up to net.
  function breakdown(rows, why, net, fmt) {
    return '<table class="g-break"><tbody>' + ROWS.map(function (r) {
      return '<tr><td>' + r[1] + '<small>' + why[r[0]] + '</small></td><td class="' + cls(rows[r[0]]) + '">' + fmt(rows[r[0]]) + '</td></tr>';
    }).join('') + '<tr class="total"><td>Net P/L</td><td class="' + cls(net) + '">' + fmt(net) + '</td></tr></tbody></table>';
  }

  var NAME = {}; ROWS.forEach(function (r) { NAME[r[0]] = r[1]; });

  // The table rows of each game, from its logic's result (one place, so the page and the test read the same numbers).
  var rowsOf = {
    ticket: function (res) { var x = res.rows; return { direction: x.direction, time: x.time, vol: x.vol, gamma: x.other, costs: x.costs }; },
    expiry: function (res) { var a = res.attr; return { direction: a.direction, time: a.time, vol: 0, gamma: a.gamma, costs: -(a.spread + a.charges) }; },
    // Seller.attribution reprices day by day, so its NIFTY row holds gamma too: split it into delta × move and the rest.
    seller: function (r, Seller) {
      var pos = r.pos, a = r.result.attr, d0 = 0;
      for (var d = pos.day + 1; d <= r.day; d++) d0 += Seller.greeks(r, pos, d - 1).delta * (r.path.S[d] - r.path.S[d - 1]);
      return { direction: d0, time: a.time, vol: a.vol, gamma: a.direction - d0, costs: a.residual - r.result.charges };
    }
  };

  // The row that did the most, on the side of the result (the biggest loss row for a loss).
  function main(rows, net) {
    var keys = ROWS.map(function (r) { return r[0]; }), sign = net < 0 ? -1 : 1;
    var same = keys.filter(function (k) { return rows[k] * sign > 0; });
    return (same.length ? same : keys).reduce(function (a, b) { return Math.abs(rows[b]) > Math.abs(rows[a]) ? b : a; });
  }
  var SAY = {
    direction: ['NIFTY moved your way, and that did most of the work.', 'NIFTY moved against you, and that cost the most.'],
    time: ['Time value melted, and as the seller you kept it.', 'Time value melted faster than NIFTY moved.'],
    vol: ['India VIX rose, so your option got dearer.', 'India VIX fell, so your option got cheaper.'],
    gamma: ['Gamma helped: your delta grew as NIFTY moved your way.', 'Gamma hurt: your delta grew against you as NIFTY moved.'],
    costs: ['', 'The spread and charges were the whole story: nothing else had time to move.']
  };
  var SELLER = {
    time: [SAY.time[0], 'The option you bought melted faster than the one you sold.'],
    vol: ['India VIX fell, so the option you sold got cheaper to buy back.', 'India VIX rose, so the option you sold got dearer to buy back.']
  };
  // o: { rows, net, risk (premium paid or received, ₹), seller, lapsed (a bought option expired worthless),
  //      capped: { S, sold, bought, loss } a credit spread that settled beyond both strikes }
  function mood(o) {
    if (o.lapsed) return 'think';
    var k = o.net / Math.max(1, Math.abs(o.risk));
    return k >= 0.5 ? 'wow' : k > 0 ? 'cheer' : k > -0.5 ? 'oops' : 'sad';
  }
  function line(o) {
    if (o.lapsed) return 'NIFTY never got past your strike, so all you paid was time value, and it melted to zero.';
    if (o.capped) return 'NIFTY finished beyond both strikes, so the spread hit its max loss. The bought leg capped it.';
    var k = main(o.rows, o.net), say = (o.seller && SELLER[k]) || SAY[k];
    return say[o.net < 0 ? 1 : 0] || SAY.direction[o.net < 0 ? 1 : 0];
  }
  function wick(o) {
    var m = mood(o), cl = o.net > 0 ? ' is-up' : o.net < 0 && !o.lapsed ? ' is-down' : '';
    return '<div class="g-wick' + cl + '">' + root.Art.wick(m, 72, { anim: o.net > 0 ? 'bounce' : o.net < 0 ? 'droop' : '' }) + '<p>' + line(o) + '</p></div>';
  }

  // The paragraph under the table. It opens with the table's biggest row (the one Wick's line is about), by its table name
  // and value; each logic's own "biggest" sentence groups the rows differently, so it is dropped.
  var DRIVER = [/^Most of this (?:loss|gain) was [^;]*?\)(?:;[^.]*)?\.\s*/, /\s*Biggest factor: [\s\S]*$/,
    /^The biggest driver: [\s\S]*?\((?:-|\u2212\u2060)?₹[\d,]+\)(?:; for a spread the two legs partly cancel)?\.\s*/];
  function story(o, fmt) {
    var k = main(o.rows, o.net), why = o.why || '', c = o.capped;
    DRIVER.forEach(function (re) { why = why.replace(re, ''); });
    why = why.replace('the Greeks shifting made up the rest', 'gamma made up the rest');
    var lead = c ? 'NIFTY finished at ' + Math.round(c.S) + ', beyond both your strikes (' + c.sold + ' sold, ' + c.bought + ' bought), so the spread lost its full ' +
      Math.abs(c.bought - c.sold) + '-point width: its max loss of ' + fmt(-c.loss) + ' before charges. The bought leg capped it there. ' : '';
    return lead + 'Biggest line in the table: ' + NAME[k] + ', ' + fmt(o.rows[k]) + '. ' + why;
  }

  // Count a figure from its old value to the new one in about 400 ms (not under reduced motion).
  function roll(el, from, to, fmt) {
    if (!el || from == null || Math.abs(to - from) < 0.5 || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    var t0 = performance.now();
    (function step(t) {
      var k = Math.min(1, (t - t0) / 400), e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(k < 1 ? from + (to - from) * e : to);
      if (k < 1) requestAnimationFrame(step);
    })(t0);
  }

  // The sticky header folds to one 48 px line (round · NIFTY · bankroll) once the big price has scrolled past. Its lost height
  // becomes bottom margin, so nothing below moves. Hidden parts stay in the text (clipped), for screen readers and tests.
  // ponytail: styles injected here like chart.js does; move them to game.css when that file is free.
  var CSS = '.g-head{overflow-anchor:none}.g-head.is-mini{height:48px;padding-top:0;padding-bottom:0;grid-template-columns:auto 1fr auto;align-items:center;gap:0 10px}' +
    '.g-head.is-mini .g-head__k{grid-column:auto}.g-head.is-mini .pill{font-size:13px}' +
    '.g-head.is-mini .g-head__k>:not(.pill),.g-head.is-mini .g-head__chg,.g-head.is-mini .g-head__bank span,.g-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}' +
    '.g-head.is-mini .g-head__px{font-size:17px}.g-head.is-mini .g-head__px::before{content:"NIFTY ";font:500 13px var(--font-text);color:var(--muted);letter-spacing:0}' +
    '.g-head.is-mini .g-head__bank b{font-size:16px}@media (max-width:359px){.g-head.is-mini .g-head__px::before{content:none}}' +
    '.g-actions .g-hint{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
  function mini(head) {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var bar = head.previousElementSibling;
    function check() {
      // How far the header has stuck past its place under the app bar (works whichever element scrolls).
      var d = head.getBoundingClientRect().top - bar.getBoundingClientRect().bottom, on = head.classList.contains('is-mini');
      if (!on && d > 56) {
        // The next block's top margin collapses into this one, so the fold keeps it: margin = full height + that gap − 48 px.
        var r = head.getBoundingClientRect(), gap = head.nextElementSibling.getBoundingClientRect().top - bar.getBoundingClientRect().bottom - r.height; // from its place in the flow, not where it sticks
        // No layout read between the two writes: a shorter page in between would clamp the scroll and unfold it again.
        head.style.marginBottom = (r.height + gap - 48) + 'px'; head.classList.add('is-mini');
      }
      else if (on && d < 24) { head.classList.remove('is-mini'); head.style.marginBottom = ''; }
    }
    document.addEventListener('scroll', check, true);
    return check;
  }

  var Result = { mini: mini, ROWS: ROWS, NAME: NAME, rows: rowsOf, breakdown: breakdown, main: main, mood: mood, line: line, wick: wick, story: story, roll: roll };
  if (typeof module !== 'undefined') module.exports = Result; else root.Result = Result;
})(this);
