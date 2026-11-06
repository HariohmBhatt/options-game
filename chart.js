// Candlestick charts for the price games, on TradingView Lightweight Charts (vendor/lightweight-charts.js, Apache-2.0).
// Chart.mount(el, {tick}) → { set({ candles, future, zones, lines, markers, show, cue }) }. Times are local game times packed by Chart.stamp.
// future: times still to come, drawn as empty slots so the space on the right reads as "time left to expiry".
// zones: [{from, to, text, long}] day bands: a faint line between days and the day's name under it (future days muted);
//   `long` ("Tue 15:30") replaces `text` only where the band is wide enough.
// lines: [{price, title, color}] dashed levels; the axis tag holds the price only, the title goes in the key line under the chart.
//   Tags that would overlap stack with a gap, each joined to its price by a short leader.
// markers: [{time, text, kind: 'buy' | 'sell' | 'settle', close}]: one shape per kind in every game (buy ▲ under the bar, sell ▼ over
//   it, settle ●), in the accent colour when it opens the position and the text colour when it closes it; the word is in the key.
// show: slots kept on screen from the left (the days played plus one ahead); cue: a short line at the top right ("3 days to expiry").
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
      zones.push({ from: ts[0], to: ts[PER - 1], text: DAYS[D.getDay()], long: d === dates.length - 1 ? DAYS[D.getDay()] + ' 15:30' : '', future: d > day });
      if (d > day) { future = future.concat(ts); return; }
      var end = path[d], b = bridge(seed * 13 + d * 101 + 7, d ? path[d - 1] : end, end, PER, end * 0.0025);
      times = times.concat(ts); for (i = 0; i < PER; i++) closes.push(b[i + 1]);
    });
    closes[closes.length - 1] = path[day]; // the bridge ends there already; this guards against float drift
    var left = dates.length - 1 - day;
    // On screen: the days played plus the next one, so the candles fill the width; the cue says how far expiry still is.
    return { candles: candles(times, closes, seed, path[0], path[0] * 0.0012), future: future, zones: zones, at: function (d) { return times[(d + 1) * PER - 1]; },
      show: Math.min(dates.length, day + 2) * PER, cue: left > 0 ? left + ' day' + (left > 1 ? 's' : '') + ' to expiry' : '' };
  }
  // Week charts name each day in their zone, so the axis itself stays blank; the crosshair still says "Thu 11:15".
  function dayTick(t, long) { return long === true ? DAYS[new Date(t * 1000).getUTCDay()] + ' ' + hhmm(t) : ''; }

  function mount(el, o) {
    o = o || {};
    if (!root.LightweightCharts) { el.textContent = ''; return { set: function () {} }; }
    el.classList.add('chartbox');
    var legend = document.createElement('div'), over = document.createElement('div'), key = document.createElement('p');
    legend.className = 'legend'; legend.hidden = true; over.className = 'chart-zones'; key.className = 'chart-key';
    el.appendChild(legend); el.appendChild(over);
    if (el.parentNode) el.parentNode.insertBefore(key, el.nextSibling);
    var series, prices = [], levels = []; // strike and breakeven: always inside the price scale, so the distance NIFTY must travel shows
    // Where each line's tag sits: at its price, pushed apart (TAG px apart, top to bottom) where two would overlap, kept inside the pane.
    var TAG = 23;
    function tags() {
      var h = el.clientHeight - chart.timeScale().height(), out = [];
      levels.forEach(function (l) { var y = series.priceToCoordinate(l.price); if (y != null) out.push({ l: l, y: y, at: y }); });
      out.sort(function (a, b) { return a.y - b.y; });
      for (var i = 1; i < out.length; i++) out[i].at = Math.max(out[i].at, out[i - 1].at + TAG);
      for (i = out.length - 1; i >= 0; i--) out[i].at = Math.min(out[i].at, (i < out.length - 1 ? out[i + 1].at : h - TAG / 2) - (i < out.length - 1 ? TAG : 0));
      for (i = 0; i < out.length; i++) out[i].at = Math.max(out[i].at, i ? out[i - 1].at + TAG : TAG / 2);
      return out;
    }
    // An axis price within 16 px of a tag would peek out from under it: leave that tick blank. Ticks are whole numbers;
    // the tags themselves (a line's exact price) and the crosshair's price always print.
    function axisPrice(p) {
      if (series && Number.isInteger(p) && prices.indexOf(p) < 0) {
        var y = series.priceToCoordinate(p);
        if (y != null && tags().some(function (t) { return Math.abs(t.at - y) < 16; })) return '';
      }
      return p.toFixed(0);
    }
    // Text on a tag: white or near-black, whichever reads on its colour.
    function ink(c) {
      var v = c.charAt(0) === '#' ? (c.length === 4 ? c.slice(1).split('').map(function (x) { return parseInt(x + x, 16); }) : [1, 3, 5].map(function (i) { return parseInt(c.substr(i, 2), 16); })) : (c.match(/[\d.]+/g) || [0, 0, 0]).map(Number);
      return 0.299 * v[0] + 0.587 * v[1] + 0.114 * v[2] > 150 ? '#111' : '#fff';
    }
    var chart = LightweightCharts.createChart(el, {
      autoSize: true,
      layout: { background: { color: 'transparent' }, textColor: css('--muted'), fontFamily: 'Figtree, system-ui, sans-serif', fontSize: 13, attributionLogo: false },
      grid: { vertLines: { visible: false }, horzLines: { color: css('--border') } },
      rightPriceScale: { borderVisible: false, entireTextOnly: true, scaleMargins: { top: .14, bottom: .1 } },
      timeScale: { borderVisible: false, fixLeftEdge: false, fixRightEdge: false, lockVisibleTimeRangeOnResize: true, timeVisible: true,
        tickMarkFormatter: o.tick || function (t) { return hhmm(t); } },
      localization: { timeFormatter: o.tick ? function (t) { return o.tick(t, true); } : hhmm, priceFormatter: axisPrice },
      crosshair: { mode: 0, vertLine: { color: css('--border-strong'), labelBackgroundColor: css('--fg') }, horzLine: { color: css('--border-strong'), labelBackgroundColor: css('--fg') } },
      handleScroll: false, handleScale: false, kineticScroll: { touch: false, mouse: false }
    });
    var up = css('--up'), dn = css('--down');
    // No last-price tag on the axis: it collided with the axis labels, and the price is big in the sticky header above.
    series = chart.addCandlestickSeries({ upColor: up, downColor: dn, borderUpColor: up, borderDownColor: dn, wickUpColor: up, wickDownColor: dn, priceLineVisible: false, lastValueVisible: false,
      autoscaleInfoProvider: function (orig) {
        var r = orig(); if (!r) return r;
        var lo = Math.min.apply(null, prices.concat(r.priceRange.minValue)), hi = Math.max.apply(null, prices.concat(r.priceRange.maxValue)), pad = Math.max(0, hi * 0.003 - (hi - lo)) / 2;
        return { priceRange: { minValue: lo - pad, maxValue: hi + pad }, margins: r.margins }; // at least 0.3% tall, so one flat candle is not a full-height line
      } });
    var lines = [], zones = [], cue = '';
    // OHLC only while a finger or pointer is on a candle; at rest the header already says the price.
    chart.subscribeCrosshairMove(function (p) {
      var c = p && p.seriesData && p.seriesData.get(series);
      legend.hidden = !(c && c.open != null); over.classList.toggle('busy', !legend.hidden);
      if (!legend.hidden) legend.innerHTML = 'O ' + c.open.toFixed(0) + ' H ' + c.high.toFixed(0) + ' L ' + c.low.toFixed(0) + ' C <b class="' + (c.close >= c.open ? 'up' : 'down') + '">' + c.close.toFixed(0) + '</b>';
    });
    function paintZones() {
      var ts = chart.timeScale(), axis = ts.height(), h = '', prev = null, w = ts.width();
      zones.forEach(function (z) {
        var a = ts.timeToCoordinate(z.from), b = ts.timeToCoordinate(z.to);
        if (a == null || b == null || a > w - 8) return;
        if (prev != null) h += '<i style="left:' + ((prev + a) / 2).toFixed(1) + 'px;bottom:' + axis + 'px"></i>';
        // The long name only where it fits between this band's neighbours (about 7.5 px a character at 13 px).
        var room = (b - a) + 2 * ts.options().barSpacing, text = z.long && z.long.length * 7.5 + 12 <= room ? z.long : z.text;
        if (text) h += '<span style="left:' + Math.min((a + b) / 2, w - text.length * 3.75 - 2).toFixed(1) + 'px;bottom:' + Math.max(4, (axis - 13) / 2).toFixed(1) + 'px"' + (z.future ? ' class="f"' : '') + '>' + text + '</span>';
        prev = b;
      });
      if (cue) h += '<b style="right:' + (el.clientWidth - w + 8) + 'px">' + cue + ' →</b>';
      // The lines' price tags on the axis, stacked where they would overlap; a moved tag gets a leader from its line's end.
      var lead = '';
      tags().forEach(function (t) {
        h += '<mark style="left:' + w + 'px;top:' + (t.at - TAG / 2 + 1).toFixed(1) + 'px;background:' + t.l.color + ';color:' + ink(t.l.color) + '">' + Math.round(t.l.price) + '</mark>';
        if (Math.abs(t.at - t.y) > 1) lead += '<path d="M' + (w - 12) + ' ' + t.y.toFixed(1) + 'L' + w + ' ' + t.at.toFixed(1) + '" stroke="' + t.l.color + '"/>';
      });
      if (lead) h += '<svg width="' + el.clientWidth + '" height="' + el.clientHeight + '" fill="none" stroke-width="2">' + lead + '</svg>';
      over.innerHTML = h;
    }
    chart.timeScale().subscribeVisibleLogicalRangeChange(function () { requestAnimationFrame(paintZones); });
    if (root.ResizeObserver) new ResizeObserver(function () { requestAnimationFrame(paintZones); }).observe(el);

    function set(d) {
      var cs = d.candles, future = d.future || [];
      series.setData(cs.concat(future.map(function (t) { return { time: t }; })));
      lines.forEach(function (l) { series.removePriceLine(l); }); lines = [];
      prices = (d.lines || []).map(function (l) { return l.price; });
      levels = (d.lines || []).map(function (l) { return { price: l.price, color: l.color || css('--warn') }; });
      levels.forEach(function (l, i) {
        lines.push(series.createPriceLine({ price: l.price, color: l.color, lineWidth: 2, lineStyle: d.lines[i].solid ? 0 : 2, axisLabelVisible: false, title: '' }));
      });
      var items = (d.lines || []).map(function (l) { return '<span><i style="border-color:' + (l.color || css('--warn')) + '"></i>' + l.title + ' ' + Math.round(l.price) + '</span>'; });
      var GLYPH = { buy: ['arrowUp', 'belowBar', '▲'], sell: ['arrowDown', 'aboveBar', '▼'], settle: ['circle', 'aboveBar', '●'] };
      series.setMarkers((d.markers || []).map(function (m) {
        var k = GLYPH[m.kind] || GLYPH.buy, color = m.kind === 'settle' ? css('--muted') : m.close ? css('--fg') : css('--accent');
        items.push('<span><b style="color:' + color + '">' + k[2] + '</b>' + m.text + '</span>');
        return { time: m.time, position: k[1], color: color, shape: k[0], text: '' };
      }));
      key.innerHTML = items.join('');
      zones = d.zones || []; cue = d.cue || '';
      // The slots to show (all of them unless the page asks for fewer), with a little room each side for a marker.
      var all = cs.length + future.length, show = Math.min(all, d.show || all);
      chart.timeScale().setVisibleLogicalRange({ from: -1, to: show < all ? show - 0.3 : all + 1.5 });
      chart.priceScale('right').applyOptions({}); // the lines moved: rebuild the axis prices so the ones under a tag hide
      requestAnimationFrame(paintZones);
    }
    return { set: set, chart: chart, series: series };
  }

  // One line for screen readers after each step: "NIFTY 23,798, down 201 since Wednesday; your strike 24,000 is 202 above."
  function say(o) {
    var n = function (x) { return Math.round(x).toLocaleString('en-IN'); }, c = Math.round(o.chg || 0), s = 'NIFTY ' + n(o.S);
    if (o.since) s += ', ' + (c ? (c > 0 ? 'up ' : 'down ') + n(Math.abs(c)) : 'unchanged') + ' since ' + o.since;
    if (o.K) { var d = Math.round(o.K - o.S); s += '; your ' + (o.what || 'strike') + ' ' + n(o.K) + (d ? ' is ' + n(Math.abs(d)) + (d > 0 ? ' above' : ' below') : ' is right at NIFTY'); }
    return s + '.';
  }

  root.Chart = { say: say, mount: mount, candles: candles, bridge: bridge, week: week, dayTick: dayTick, stamp: stamp, hhmm: hhmm, DAYS: DAYS, PER: PER };
})(this);
