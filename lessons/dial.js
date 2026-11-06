// The dial: one slider over one curve. A question hides the curve until Check; a teach card shows it from the start
// so the player can drag along it. Plain script (browser) + node module (tests share f, verdict and answerText).
// The world is Payoff Painter's: NIFTY 24,000, India VIX 14, 4 trading days to the Tuesday 15:30 expiry, lot 65.
(function (root) {
  var node = typeof module !== 'undefined';
  var Payoff = node ? require('../games/payoff/logic.js') : root.Payoff;
  var Market = node ? require('../market.js') : root.Market;
  var LOT = Payoff.LOT, SPOT = Payoff.SPOT, DAYS = ['Thu', 'Fri', 'Mon', 'Tue'];
  var THUMB = 14; // half the range thumb: chart x runs from THUMB to W - THUMB so the cursor sits on the thumb

  function n(x) { return Number.isInteger(x) ? x.toLocaleString('en-IN') : Payoff.pts(x); }
  function hours(q) { return q.dial === 'days' && q.x.max - q.x.min <= 1; } // a single trading day, counted in minutes
  // Rupees per lot at dial position x.
  function f(q, x) {
    if (q.dial === 'expiry') return Payoff.pl(q.pos, x);
    if (q.dial === 'strike') return Payoff.premium(q.pos.type, x) * LOT;
    return Market.premium({ type: q.pos.type, S: SPOT, K: q.pos.K, T: (q.x.max - x) / 252 }) * LOT; // days: x = trading days passed
  }
  // ponytail: clock labels assume the 4-day week Thursday 09:15 to Tuesday 15:30 (market.js counting, 375-minute session).
  function mins(x) { return Math.round((x % 1) * 375); }
  function clock(x) { return x >= 4 ? 'Tue 15:30' : DAYS[Math.floor(x)] + ' ' + Market.hhmm(555 + mins(x)); }
  function left(q, x) {
    var d = q.x.max - x;
    if (d < 1e-9) return 'Expiry';
    if (hours(q)) { var m = Math.round(d * 375); return [m >= 60 ? Math.floor(m / 60) + ' h' : '', m % 60 ? m % 60 + ' min' : ''].join(' ').trim() + ' left'; }
    return d + ' trading day' + (d === 1 ? '' : 's') + ' left';
  }
  function label(q, x) {
    if (q.dial === 'expiry') return { k: 'NIFTY at expiry', v: n(x), sub: '' };
    if (q.dial === 'strike') return { k: 'Strike', v: n(x) + ' ' + (q.pos.type === 'call' ? 'CE' : 'PE'), sub: (x - SPOT ? (x > SPOT ? '+' : '−') + Math.abs(x - SPOT) + ' points from NIFTY' : 'At the money') };
    return { k: 'Time', v: clock(x), sub: left(q, x) };
  }
  function valueText(q, y) {
    if (q.dial === 'expiry') return (y > 0 ? 'Profit ' : y < 0 ? 'Loss ' : 'P/L ') + Market.fmt(Math.abs(y)) + ' a lot';
    return 'Premium ' + Market.fmt(y) + ' a lot';
  }
  function verdict(q, x) { var d = Math.abs(x - q.answer); return d <= q.tol + 1e-9 ? 'right' : d <= 2 * q.tol + q.x.step + 1e-9 ? 'close' : 'wrong'; }
  function answerText(q) {
    if (q.dial === 'expiry') return 'NIFTY ' + n(q.answer);
    if (q.dial === 'strike') return 'the ' + n(q.answer) + ' ' + (q.pos.type === 'call' ? 'CE' : 'PE');
    return clock(q.answer) + ', ' + left(q, q.answer);
  }
  function stepWords(q) {
    return q.dial === 'expiry' ? ['NIFTY ' + q.x.step + ' points lower', 'NIFTY ' + q.x.step + ' points higher']
      : q.dial === 'strike' ? ['One strike lower', 'One strike higher'] : hours(q) ? ['15 minutes earlier', '15 minutes later'] : ['Earlier', 'Later'];
  }
  function hint(q, explore) {
    if (!explore) return 'Drag, or tap − and +. Check draws the real line.';
    return q.dial === 'expiry' ? 'Drag NIFTY to see the P/L at expiry.' : q.dial === 'strike' ? 'Drag along the strikes to see each price.' : 'Drag time forward and watch the premium melt.';
  }

  function html(q, explore) {
    var w = stepWords(q);
    return '<p class="ls-hint">' + hint(q, explore) + '</p>' +
      '<div class="dl" id="dl"><div class="dl-head"><div class="dl-read" aria-hidden="true"><span class="dl-k" id="dl-k"></span><span class="dl-v" id="dl-v"></span><span class="dl-sub" id="dl-sub"></span></div>' +
      '<button type="button" class="dl-step" data-d="-1" aria-label="' + w[0] + '">−</button><button type="button" class="dl-step" data-d="1" aria-label="' + w[1] + '">+</button></div>' +
      '<svg class="dl-chart" id="dl-chart" aria-hidden="true"></svg>' +
      '<input type="range" class="dl-range" id="dl-range" min="' + q.x.min + '" max="' + q.x.max + '" step="' + q.x.step + '" value="' + q.x.start + '" aria-label="' + label(q, q.x.start).k + '"></div>';
  }

  // Mounts on the stage. onPick(x) fires on every move. explore: the curve shows from the start (teach cards).
  // Returns {value, set, reveal}.
  function mount(q, onPick, explore) {
    var range = document.getElementById('dl-range'), svg = document.getElementById('dl-chart'), box = document.getElementById('dl');
    var shown = !!explore, drag = false, W = 0, H = 0, TOP = 34, BOT = 0;
    var X = function (x) { return THUMB + (x - q.x.min) / (q.x.max - q.x.min) * (W - 2 * THUMB); };
    var xs = [], ys, lo, hi, Y, legs = q.dial === 'expiry' ? [].concat(q.pos) : [];
    // The curve: a fine grid, every strike on its own for the strike dial, every leg's strike for the bends.
    if (q.dial === 'strike') for (var k = q.x.min; k <= q.x.max; k += q.x.step) xs.push(k);
    else for (var i = 0; i <= 120; i++) xs.push(q.x.min + (q.x.max - q.x.min) * i / 120);
    legs.forEach(function (l) { xs.push(l.K); }); xs.sort(function (a, b) { return a - b; });
    ys = xs.map(function (x) { return f(q, x); });
    lo = Math.min.apply(null, ys.concat(q.goal || 0, 0)); hi = Math.max.apply(null, ys.concat(q.goal || 0));
    var padY = (hi - lo) * .08; lo -= padY; hi += padY;
    Y = function (v) { return TOP + (hi - v) / (hi - lo) * (BOT - TOP); };

    function ticks() {
      if (hours(q)) return [[q.x.min, '09:15'], [q.x.min + 165 / 375, '12:00'], [q.x.max, '15:30']];
      if (q.dial === 'days') { var d = []; for (var j = q.x.min; j <= q.x.max; j++) d.push([j, j < 4 ? DAYS[j] : 'Expiry']); return d; }
      if (q.dial === 'strike') { var t = []; for (var s = q.x.min; s <= q.x.max; s += 200) t.push([s, n(s)]); return t; }
      return [[q.x.min, n(q.x.min)], [(q.x.min + q.x.max) / 2, n((q.x.min + q.x.max) / 2)], [q.x.max, n(q.x.max)]];
    }
    function text(x, y, s, cls, anchor) { return '<text x="' + x.toFixed(1) + '" y="' + y + '" text-anchor="' + (anchor || 'middle') + '"' + (cls ? ' class="' + cls + '"' : '') + '>' + s + '</text>'; }
    function anchorFor(px) { return px < 40 ? 'start' : px > W - 40 ? 'end' : 'middle'; }

    function draw(animate) {
      W = svg.clientWidth || 320; H = svg.clientHeight || 190; BOT = H - 26;
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      var v = +range.value, h = '', labels = '', px = X(v);
      h += '<path class="dl-axis" d="M' + THUMB + ' ' + BOT + 'H' + (W - THUMB) + '"/>';
      ticks().forEach(function (t) { var tx = X(t[0]); h += '<path class="dl-tick" d="M' + tx.toFixed(1) + ' ' + BOT + 'v5"/>' + text(tx, H - 4, t[1], '', anchorFor(tx)); });
      // Each leg's strike, labelled; two legs are labelled by their strike so the words do not collide.
      // The labels go on top of the curve (with a halo), so the line never hides them.
      legs.forEach(function (l) {
        var kx = X(l.K), right = l.K === Math.max.apply(null, legs.map(function (m) { return m.K; })); // the higher strike labels to its right
        h += '<path class="dl-ref" d="M' + kx.toFixed(1) + ' ' + TOP + 'V' + BOT + '"/>';
        var high = Y(f(q, l.K)) < (TOP + BOT) / 2; // the line is high at the strike: put the label low, and the other way round
        labels += text(kx + (right ? 6 : -6), high ? BOT - 6 : TOP + 14, legs.length > 1 ? n(l.K) : 'Strike', 'dl-ref-t', right ? 'start' : 'end');
      });
      if (shown) {
        if (q.answer != null) {
          var bx0 = X(Math.max(q.x.min, q.answer - q.tol)), bx1 = X(Math.min(q.x.max, q.answer + q.tol));
          h += '<rect class="dl-band" x="' + (bx0 - (q.tol ? 0 : 4)).toFixed(1) + '" y="' + TOP + '" width="' + Math.max(8, bx1 - bx0).toFixed(1) + '" height="' + (BOT - TOP) + '" rx="4"/>';
        }
        if (q.goal != null) {
          var gy = Y(q.goal);
          h += '<path class="dl-goal" d="M' + THUMB + ' ' + gy.toFixed(1) + 'H' + (W - THUMB) + '"/>';
          labels += text(THUMB, gy - 6, q.goal ? Market.fmt(q.goal) : '₹0', 'dl-goal-t', 'start');
        }
        if (q.answer != null) h += '<path class="dl-ans" d="M' + X(q.answer).toFixed(1) + ' ' + TOP + 'V' + BOT + '"/>';
        var d = xs.map(function (x, i) { return (i ? 'L' : 'M') + X(x).toFixed(1) + ' ' + Y(ys[i]).toFixed(1); }).join('');
        var anim = animate ? ' dl-draw' : '';
        if (q.dial === 'expiry') {
          // profit above zero in green, loss below in red, as in the games
          var z = Y(0).toFixed(1);
          h += '<defs><clipPath id="dl-u"><rect x="0" y="0" width="' + W + '" height="' + z + '"/></clipPath><clipPath id="dl-d"><rect x="0" y="' + z + '" width="' + W + '" height="' + H + '"/></clipPath></defs>' +
            '<path pathLength="1" class="dl-line dl-line--up' + anim + '" clip-path="url(#dl-u)" d="' + d + '"/><path pathLength="1" class="dl-line dl-line--dn' + anim + '" clip-path="url(#dl-d)" d="' + d + '"/>';
        } else {
          h += '<path pathLength="1" class="dl-line' + anim + '" d="' + d + '"/>';
          if (q.dial === 'strike') xs.forEach(function (x, i) { h += '<circle class="dl-pt" r="3" cx="' + X(x).toFixed(1) + '" cy="' + Y(ys[i]).toFixed(1) + '"/>'; });
        }
        if (q.answer != null) h += '<circle class="dl-dot dl-dot--ans" r="5" cx="' + X(q.answer).toFixed(1) + '" cy="' + Y(f(q, q.answer)).toFixed(1) + '"/>';
      }
      h += labels;
      // the cursor and its bubble, drawn last so it sits on top
      h += '<path class="dl-cur" d="M' + px.toFixed(1) + ' ' + (TOP - 6) + 'V' + BOT + '"/>';
      if (shown) h += '<circle class="dl-dot" r="6" cx="' + px.toFixed(1) + '" cy="' + Y(f(q, v)).toFixed(1) + '"/>';
      var bt = label(q, v).v, bw = bt.length * 7.6 + 18, bxx = Math.max(2, Math.min(W - bw - 2, px - bw / 2));
      h += '<g class="dl-bubble"><rect x="' + bxx.toFixed(1) + '" y="2" width="' + bw.toFixed(1) + '" height="24" rx="12"/>' + text(bxx + bw / 2, 19, bt) + '</g>';
      svg.innerHTML = h;
    }
    function readout() {
      var v = +range.value, L = label(q, v), sub = document.getElementById('dl-sub');
      document.getElementById('dl-k').textContent = L.k;
      document.getElementById('dl-v').textContent = L.v;
      var y = f(q, v);
      sub.textContent = shown ? valueText(q, y) : L.sub;
      sub.className = 'dl-sub' + (shown && q.dial === 'expiry' ? (y > 0 ? ' up' : y < 0 ? ' down' : '') : '');
      range.setAttribute('aria-valuetext', L.v + (L.sub ? ', ' + L.sub : '') + (shown ? ', ' + valueText(q, y) : ''));
    }
    function set(v, quiet) {
      v = Math.max(q.x.min, Math.min(q.x.max, Math.round((v - q.x.min) / q.x.step) * q.x.step + q.x.min));
      v = +v.toFixed(6); // 0.04-day steps: drop float noise so labels and the verdict see 3.76, not 3.7600000000000002
      if (v === +range.value && quiet) return;
      range.value = v; readout(); draw(false);
      onPick(v);
    }
    function fromPointer(e) { var r = svg.getBoundingClientRect(); return q.x.min + (e.clientX - r.left - THUMB) / (r.width - 2 * THUMB) * (q.x.max - q.x.min); }

    range.addEventListener('input', function () { set(+range.value); });
    box.querySelectorAll('.dl-step').forEach(function (b) { b.onclick = function () { set(+range.value + +b.dataset.d * q.x.step); root.Reward && Reward.sound('tap'); }; });
    svg.addEventListener('pointerdown', function (e) { drag = true; svg.setPointerCapture(e.pointerId); set(fromPointer(e), true); });
    svg.addEventListener('pointermove', function (e) { if (drag) set(fromPointer(e), true); });
    svg.addEventListener('pointerup', function () { drag = false; });
    svg.addEventListener('pointercancel', function () { drag = false; });
    var onResize = function () { if (document.body.contains(svg)) draw(false); else removeEventListener('resize', onResize); };
    addEventListener('resize', onResize);
    readout(); draw(false);
    return {
      value: function () { return +range.value; },
      set: set,
      // After Check the line is drawn, and the dial stays live so the player can keep exploring it.
      reveal: function (v) { shown = true; box.classList.add(v === 'right' ? 'is-right' : 'is-wrong'); readout(); draw(true); }
    };
  }

  var Dial = { f: f, label: label, verdict: verdict, answerText: answerText, valueText: valueText, html: html, mount: mount, clock: clock };
  if (node) module.exports = Dial; else root.Dial = Dial;
})(this);
