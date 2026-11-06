// Candlestick charts for the price games, on TradingView Lightweight Charts (vendor/lightweight-charts.js, Apache-2.0).
// Chart.mount(el, {tick}) → { set({ candles, future, zones, lines, markers }) }. Times are local game times packed by Chart.stamp.
// future: times still to come, drawn as empty slots so the space on the right reads as "time left to expiry".
// zones: [{from, to, text}] day bands: a faint line between days and the day's name under it (future days muted).
// markers: [{time, text, kind: 'open' | 'close' | 'settle'}], placed above or below the bar, away from the strike lines.
(function (root) {
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  // A game time shown as written: the lib labels UTC, so local wall-clock fields are packed into a UTC stamp.
  function stamp(d) { return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) / 1000; }
  function hhmm(s) { var d = new Date(s * 1000); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); }
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], PER = 6;

  // A seeded walk from a to b in n steps (a Brownian bridge): the moves between two known prices, for drawing only.
  function bridge(seed, a, b, n, vol) {
    var rand = Engine.rng(seed), w = [0];
    for (var i = 1; i <= n; i++) { var u = Math.max(rand(), 1e-9), v = rand(); w.push(w[i - 1] + Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)); }
    var out = [];
    for (var k = 0; k <= n; k++) out.push(a + (b - a) * k / n + vol * (w[k] - w[n] * k / n));
    return out;
  }
  // Candles from a list of closes: each candle opens at the last close; its wicks come from a bridge between them.
  function candles(times, closes, seed, open0, vol) {
    var out = [], prev = open0 == null ? closes[0] : open0;
    for (var i = 0; i < closes.length; i++) {
      var p = bridge((seed * 31 + i * 7919) >>> 0, prev, closes[i], 6, vol);
      out.push({ time: times[i], open: r2(prev), close: r2(closes[i]), high: r2(Math.max.apply(null, p)), low: r2(Math.min.apply(null, p)) });
      prev = closes[i];
    }
    return out;
  }
  function r2(x) { return Math.round(x * 100) / 100; }

  // A week of six hourly candles a day up to `day`; each day's last candle closes at that day's game price (path[d]).
  // Days not reached yet are empty slots, and each day is a zone named by its weekday (the last one "Tue 15:30").
  function week(dates, path, seed, day) {
    var times = [], closes = [], future = [], zones = [];
    dates.forEach(function (D, d) {
      var ts = [];
      for (var i = 0; i < PER; i++) ts.push(stamp(new Date(D.getFullYear(), D.getMonth(), D.getDate(), 9 + i, 15)));
      zones.push({ from: ts[0], to: ts[PER - 1], text: DAYS[D.getDay()] + (d === dates.length - 1 ? ' 15:30' : ''), future: d > day });
      if (d > day) { future = future.concat(ts); return; }
      var end = path[d], b = bridge(seed * 13 + d * 101 + 7, d ? path[d - 1] : end, end, PER, end * 0.0025);
      times = times.concat(ts); for (i = 0; i < PER; i++) closes.push(b[i + 1]);
    });
    closes[closes.length - 1] = path[day]; // the bridge ends there already; this guards against float drift
    return { candles: candles(times, closes, seed, path[0], path[0] * 0.0012), future: future, zones: zones, at: function (d) { return times[(d + 1) * PER - 1]; } };
  }
  // Week charts name each day in their zone, so the axis itself stays blank; the crosshair still says "Thu 11:15".
  function dayTick(t, long) { return long === true ? DAYS[new Date(t * 1000).getUTCDay()] + ' ' + hhmm(t) : ''; }

  var styled = false;
  function style() {
    if (styled) return; styled = true;
    var s = document.createElement('style');
    s.textContent = '.chart-zones{position:absolute;inset:0;pointer-events:none;z-index:2}' +
      '.chart-zones i{position:absolute;top:8px;width:0;border-left:1px dashed var(--border-strong)}' +
      '.chart-zones span{position:absolute;transform:translateX(-50%);font:500 13px/1 var(--font-text);color:var(--fg);white-space:nowrap}' +
      '.chart-zones span.f{color:var(--muted)}';
    document.head.appendChild(s);
  }

  function mount(el, o) {
    o = o || {};
    if (!root.LightweightCharts) { el.textContent = ''; return { set: function () {} }; }
    style();
    el.classList.add('chartbox');
    var legend = document.createElement('div'), over = document.createElement('div');
    legend.className = 'legend'; legend.hidden = true; over.className = 'chart-zones';
    el.appendChild(legend); el.appendChild(over);
    var chart = LightweightCharts.createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: css('--muted'), fontFamily: 'Figtree, system-ui, sans-serif', fontSize: 13, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: css('--border') } },
      rightPriceScale: { borderVisible: false, entireTextOnly: true, scaleMargins: { top: .14, bottom: .1 } },
      timeScale: { borderVisible: false, fixLeftEdge: false, fixRightEdge: false, lockVisibleTimeRangeOnResize: true, timeVisible: true,
        tickMarkFormatter: o.tick || function (t) { return hhmm(t); } },
      localization: { timeFormatter: o.tick ? function (t) { return o.tick(t, true); } : hhmm, priceFormatter: function (p) { return p.toFixed(0); } },
      crosshair: { mode: 0, vertLine: { color: css('--border-strong'), labelBackgroundColor: css('--fg') }, horzLine: { color: css('--border-strong'), labelBackgroundColor: css('--fg') } },
      handleScroll: false, handleScale: false, kineticScroll: { touch: false, mouse: false }
    });
    var up = css('--up'), dn = css('--down');
    var prices = []; // strike and breakeven: always inside the price scale, so the distance NIFTY must travel shows
    // No last-price tag on the axis: it collided with the axis labels, and the price is big in the sticky header above.
    var series = chart.addCandlestickSeries({ upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn, priceLineVisible: false, lastValueVisible: false,
      autoscaleInfoProvider: function (orig) {
        var r = orig(); if (!r) return r;
        var lo = Math.min.apply(null, prices.concat(r.priceRange.minValue)), hi = Math.max.apply(null, prices.concat(r.priceRange.maxValue)), pad = Math.max(0, hi * 0.003 - (hi - lo)) / 2;
        return { priceRange: { minValue: lo - pad, maxValue: hi + pad }, margins: r.margins }; // at least 0.3% tall, so one flat candle is not a full-height line
      } });
    var lines = [], zones = [];
    // OHLC only while a finger or pointer is on a candle; at rest the header already says the price.
    chart.subscribeCrosshairMove(function (p) {
      var c = p && p.seriesData && p.seriesData.get(series);
      legend.hidden = !(c && c.open != null);
      if (!legend.hidden) legend.innerHTML = 'O ' + c.open.toFixed(0) + ' H ' + c.high.toFixed(0) + ' L ' + c.low.toFixed(0) + ' C <b class="' + (c.close >= c.open ? 'up' : 'down') + '">' + c.close.toFixed(0) + '</b>';
    });
    function paintZones() {
      var ts = chart.timeScale(), axis = ts.height(), h = '', prev = null;
      zones.forEach(function (z) {
        var a = ts.timeToCoordinate(z.from), b = ts.timeToCoordinate(z.to);
        if (a == null || b == null) return;
        if (prev != null) h += '<i style="left:' + ((prev + a) / 2).toFixed(1) + 'px;bottom:' + axis + 'px"></i>';
        h += '<span style="left:' + ((a + b) / 2).toFixed(1) + 'px;bottom:' + Math.max(4, (axis - 13) / 2).toFixed(1) + 'px"' + (z.future ? ' class="f"' : '') + '>' + z.text + '</span>';
        prev = b;
      });
      over.innerHTML = h;
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(function () { requestAnimationFrame(paintZones); });
    if (root.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(paintZones); }).observe(el);

    function set(d) {
      var cs = d.candles, future = d.future || [];
      series.setData(cs.concat(future.map(function (t) { return { time: t }; })));
      lines.forEach(function (l) { series.removePriceLine(l); }); lines = [];
      prices = (d.lines || []).map(function (l) { return l.price; });
      (d.lines || []).forEach(function (l) {
        lines.push(series.createPriceLine({ price: l.price, color: l.color || css('--warn'), lineWidth: 2, lineStyle: l.solid ? 0 : 2, axisLabelVisible: true, title: l.title }));
      });
      var byTime = {}; cs.forEach(function (c) { byTime[c.time] = c; });
      var KIND = { open: [css('--accent'), 'arrow'], close: [css('--fg'), 'arrow'], settle: [css('--muted'), 'circle'] };
      series.setMarkers((d.markers || []).map(function (m) {
        // On the side of the bar with more room before the nearest strike line: the marker and its word never hide under a line.
        var c = byTime[m.time] || cs[cs.length - 1], room = { a: Infinity, b: Infinity };
        prices.forEach(function (p) { if (p >= c.high) room.a = Math.min(room.a, p - c.high); if (p <= c.low) room.b = Math.min(room.b, c.low - p); });
        var pos = m.position || (room.a >= room.b ? 'aboveBar' : 'belowBar'), k = KIND[m.kind] || KIND.open;
        return { time: m.time, position: pos, color: k[0], shape: k[1] === 'circle' ? 'circle' : pos === 'belowBar' ? 'arrowUp' : 'arrowDown', text: m.text };
      }));
      zones = d.zones || [];
      // Every slot of the session or week stays on screen, with a little room each side so a marker's word ("Settled") is never cut.
      chart.timeScale().setVisibleLogicalRange({ from: -1, to: cs.length + future.length + 1.5 });
      requestAnimationFrame(paintZones);
    }
    return { set: set, chart: chart, series: series };
  }

  root.Chart = { mount: mount, candles: candles, bridge: bridge, week: week, dayTick: dayTick, stamp: stamp, hhmm: hhmm, DAYS: DAYS, PER: PER };
})(this);
