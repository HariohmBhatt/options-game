// The result card parts the three price games share: one P/L breakdown with the same rows everywhere, and Wick's reaction.
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
  // o: { rows, net, risk (premium paid or received, ₹), seller, lapsed (a bought option expired worthless) }
  function mood(o) {
    if (o.lapsed) return 'think';
    var k = o.net / Math.max(1, Math.abs(o.risk));
    return k >= 0.5 ? 'wow' : k > 0 ? 'cheer' : k > -0.5 ? 'oops' : 'sad';
  }
  function line(o) {
    if (o.lapsed) return 'NIFTY never got past your strike, so all you paid was time value, and it melted to zero.';
    var k = main(o.rows, o.net), say = (o.seller && SELLER[k]) || SAY[k];
    return say[o.net < 0 ? 1 : 0] || SAY.direction[o.net < 0 ? 1 : 0];
  }
  function wick(o) {
    var m = mood(o), cl = o.net > 0 ? ' is-up' : o.net < 0 && !o.lapsed ? ' is-down' : '';
    return '<div class="g-wick' + cl + '">' + root.Art.wick(m, 56) + '<p>' + line(o) + '</p></div>';
  }

  var Result = { ROWS: ROWS, breakdown: breakdown, main: main, mood: mood, line: line, wick: wick };
  if (typeof module !== 'undefined') module.exports = Result; else root.Result = Result;
})(this);
