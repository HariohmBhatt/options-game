// The parts the three price games share: one P/L breakdown with the same rows everywhere, Wick's reaction, the story under it,
// and the shell behaviour (compact header, rolling figures).
// Plain script for the browser (needs art.js), also loadable in node for tests.
(function (root) {
  var ROWS = [['direction', 'NIFTY moved'], ['time', 'Time passed'], ['vol', 'VIX changed'], ['gamma', 'Gamma (delta changed as NIFTY moved)'], ['costs', 'Spread and charges']];
  function cls(v) { v = Math.round(v); return v > 0 ? 'up' : v < 0 ? 'down' : ''; }

  // Rows of a position settled at expiry: what it cost, what settlement paid or took, and charges. No Greeks: at expiry only
  // where NIFTY finished matters, and splitting that into "time" and "direction" would read as if time caused the loss.
  var SETTLE = [['paid', 'Premium paid'], ['received', 'Premium received'], ['settle', 'Settlement received'], ['payout', 'Paid out at settlement'], ['charges', 'Charges']];
  var NAME = {}; ROWS.concat(SETTLE).forEach(function (r) { NAME[r[0]] = r[1]; });

  // rows and why: keyed like ROWS or SETTLE, in table order (₹ amounts, one-line reasons). The amounts add up to net.
  function breakdown(rows, why, net, fmt) {
    return '<table class="g-break"><tbody>' + Object.keys(rows).map(function (k) {
      return '<tr><td>' + NAME[k] + '<small>' + why[k] + '</small></td><td class="' + cls(rows[k]) + '">' + fmt(rows[k]) + '</td></tr>';
    }).join('') + '<tr class="total"><td>Net P/L</td><td class="' + cls(net) + '">' + fmt(net) + '</td></tr></tbody></table>';
  }

  // o: { sell (a sold option or credit spread), type, K, K2 (the bought hedge), S (NIFTY at 15:30), qty, premium (₹ paid or received),
  //      settle (₹ the settlement paid you or took from you, ≥ 0), net }. → { rows, why, capped }
  function settlement(o) {
    var n = function (x) { return Math.round(x).toLocaleString('en-IN'); }, call = o.type === 'call', S = Math.round(o.S);
    var past = function (K) { return call ? o.S > K : o.S < K; }, pts = function (K) { return Math.abs(Math.round(o.S - K)); };
    var end = 'NIFTY ended ' + n(o.S) + ', ', rows = {}, why = {}, capped = null;
    if (o.sell) {
      rows.received = o.premium; why.received = o.K2 ? 'net credit: sold leg at the bid, hedge at the ask' : 'at the bid';
      rows.payout = -o.settle;
      if (o.K2 && past(o.K2)) {
        capped = { S: o.S, sold: o.K, bought: o.K2, width: Math.abs(o.K2 - o.K), paid: o.settle };
        why.payout = end + 'past both strikes: the full ' + capped.width + '-point width × ' + o.qty;
      } else why.payout = past(o.K) ? end + pts(o.K) + ' points past your sold ' + o.K + ': ' + pts(o.K) + ' × ' + o.qty : end + 'short of your ' + o.K + ' strike: nothing to pay';
    } else {
      rows.paid = -o.premium; why.paid = 'at the ask';
      rows.settle = o.settle;
      why.settle = past(o.K) ? end + pts(o.K) + ' points ' + (call ? 'above' : 'below') + ' your ' + o.K + ' strike: ' + pts(o.K) + ' × ' + o.qty : end + (S === o.K ? 'right at' : call ? 'below' : 'above') + ' your ' + o.K + ' strike: worth ₹0';
    }
    rows.charges = o.net - (o.sell ? o.premium - o.settle : o.settle - o.premium); why.charges = 'brokerage, STT and exchange fees';
    return { rows: rows, why: why, capped: capped, worthless: !!o.sell && !o.settle }; // worthless: a sold option that settled at ₹0
  }

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
    var keys = Object.keys(rows), sign = net < 0 ? -1 : 1;
    var same = keys.filter(function (k) { return rows[k] * sign > 0; });
    return (same.length ? same : keys).reduce(function (a, b) { return Math.abs(rows[b]) > Math.abs(rows[a]) ? b : a; });
  }
  var SAY = {
    direction: ['NIFTY moved your way, and that did most of the work.', 'NIFTY moved against you, and that cost the most.'],
    time: ['Time value melted, and as the seller you kept it.', 'Time value melted faster than NIFTY moved.'],
    vol: ['India VIX rose, so your option got dearer.', 'India VIX fell, so your option got cheaper.'],
    gamma: ['Gamma helped: your delta grew as NIFTY moved your way.', 'Gamma hurt: your delta grew against you as NIFTY moved.'],
    costs: ['', 'The spread and charges were the whole story: nothing else had time to move.'],
    paid: ['', 'It settled for less than the premium you paid.'],
    settle: ['It settled in the money for more than you paid.', ''],
    received: ['The premium you received outweighed anything settlement took.', ''],
    payout: ['', 'NIFTY finished past your strike, and the settlement cost more than the premium you got.'],
    charges: ['', 'Charges were the whole story.']
  };
  var SELLER = {
    time: [SAY.time[0], 'The option you bought melted faster than the one you sold.'],
    vol: ['India VIX fell, so the option you sold got cheaper to buy back.', 'India VIX rose, so the option you sold got dearer to buy back.']
  };
  // o: { rows, net, risk (premium paid or received, ₹), seller, lapsed (a bought option expired worthless),
  //      capped: from settlement(), a credit spread that settled past both strikes; worthless: a sold option that settled at ₹0 }
  function mood(o) {
    if (o.lapsed) return 'think';
    var k = o.net / Math.max(1, Math.abs(o.risk));
    return k >= 0.5 ? 'wow' : k > 0 ? 'cheer' : k > -0.5 ? 'oops' : 'sad';
  }
  function line(o) {
    if (o.lapsed) return 'NIFTY never got past your strike, so all you paid was time value, and it melted to zero.';
    if (o.capped) return 'NIFTY finished past both strikes, so you paid out the full ' + o.capped.width + '-point width. The bought leg capped it there.';
    var k = main(o.rows, o.net), say = (o.seller && SELLER[k]) || SAY[k];
    if (k === 'received' && o.worthless) return 'It expired worthless, so you kept the whole premium.'; // settlement took nothing
    return say[o.net < 0 ? 1 : 0] || SAY.direction[o.net < 0 ? 1 : 0];
  }
  function wick(o) {
    var m = mood(o), cl = o.net > 0 ? ' is-up' : o.net < 0 && !o.lapsed ? ' is-down' : '';
    // A big result (half the stake or more either way) gets the reaction in frames; the rest a single bounce or droop.
    var pic = m === 'wow' ? root.Art.wickFrames('win', 72) : m === 'sad' ? root.Art.wickFrames('loss', 72) : root.Art.wick(m, 72, { anim: o.net > 0 ? 'bounce' : o.net < 0 ? 'droop' : '' });
    return '<div class="g-wick' + cl + '">' + pic + '<p>' + line(o) + '</p></div>';
  }

  // The paragraph under the table. It opens with the table's biggest row (the one Wick's line is about) and its value, in words;
  // each logic's own "biggest" sentence groups the rows differently, so it is dropped.
  var DRIVER = [/^Most of this (?:loss|gain) was [^;]*?\)(?:;[^.]*)?\.\s*/, /\s*Biggest factor: [\s\S]*$/,
    /^The biggest driver: [\s\S]*?\((?:-|\u2212\u2060)?₹[\d,]+\)(?:; for a spread the two legs partly cancel)?\.\s*/];
  // By row, [on the winning side, on the losing side]; $ is the row's value.
  var LEAD = {
    direction: ['NIFTY moving your way did most of the work: $.', 'NIFTY moving against you cost the most: $.'],
    time: ['Time did most of the work: $ of time value melted in your favour.', 'Time cost the most: $ of time value melted away.'],
    vol: ['The VIX change helped most: $.', 'The VIX change cost the most: $.'],
    gamma: ['Gamma helped most: $, as your delta grew with the move.', 'Gamma cost the most: $, as your delta grew against you.'],
    costs: ['The spread and charges came out ahead: $.', 'The spread and charges cost the most: $.'],
    paid: ['', 'The premium you paid cost the most: $, and settlement gave back less than that.'],
    settle: ['The settlement did the work: it paid you $.', ''],
    received: ['The premium did the work: $ received, more than settlement cost you.', ''],
    payout: ['', 'Paying out at settlement cost the most: $.'],
    charges: ['', 'Charges cost the most: $.']
  };
  function story(o, fmt) {
    var k = main(o.rows, o.net), v = o.rows[k], why = o.why || '', c = o.capped;
    DRIVER.forEach(function (re) { why = why.replace(re, ''); });
    why = why.replace('the Greeks shifting made up the rest', 'gamma made up the rest');
    if (c) why = why.replace(/\s*At expiry NIFTY was at \d+, so you paid [^(]*\([^)]*\)\./, '').replace(/, unless the bought leg caps it, as here at [^.]*\./, '.'); // the lead already says both
    var wl = k === 'received' && o.worthless && why.match(/The option expired worthless at (\d+), so you kept the full ₹[\d,]+ premium\.\s*/);
    if (wl) why = why.replace(wl[0], ''); // the lead below says it, once
    var lead = (k === 'received' && o.worthless ? 'The premium did all the work: ' + (wl ? 'it expired worthless at ' + (+wl[1]).toLocaleString('en-IN') + ', so ' : '') + 'you kept the whole $.' : LEAD[k][v < 0 ? 1 : 0] || LEAD[k][0] || LEAD[k][1])
      .replace('$', (v > 0 ? '+' : '') + fmt(v)) + ' ';
    if (c) lead += 'NIFTY finished at ' + Math.round(c.S) + ', past both your strikes (' + c.sold + ' sold, ' + c.bought + ' bought), so you paid the full ' + c.width +
      '-point width; after the ' + fmt(o.rows.received) + ' premium that is the max loss, ' + fmt(-(c.paid - o.rows.received)) + ' before charges. The bought leg capped it there. ';
    return lead + why;
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
  function mini(head) {
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

  var Result = { mini: mini, ROWS: ROWS, SETTLE: SETTLE, NAME: NAME, rows: rowsOf, settlement: settlement, breakdown: breakdown, main: main, mood: mood, line: line, wick: wick, story: story, roll: roll };
  if (typeof module !== 'undefined') module.exports = Result; else root.Result = Result;
})(this);
