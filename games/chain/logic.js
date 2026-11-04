// Pure game logic for "Read the Chain" (NSE option chain: OI, IV, PCR, max pain, delta). Browser script + node module.
(function (root) {
  var node = typeof module !== 'undefined';
  var Engine = node ? require('../../engine.js') : root.Engine;
  var Market = node ? require('../../market.js') : root.Market;
  var LOT = 65, STEP = 50, NOW = new Date(2026, 10, 4, 9, 15), EXPIRY = new Date(2026, 10, 10);
  var T = Market.yearsToExpiry(NOW, EXPIRY);

  var inr = typeof Intl !== 'undefined' ? new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }) : null;
  function num(x) { var r = Math.round(x), s = inr ? inr.format(Math.abs(r)) : String(Math.abs(r)); return (r < 0 ? '-' : '') + s; }
  var inr2 = inr && new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  function num2(x) { return inr2 ? inr2.format(x) : x.toFixed(2); } // NIFTY level: 24,158.89
  function crore(x) { return '₹' + num(x / 1e7) + ' crore'; }

  // Synthetic open interest (contracts) for one side. ponytail: shape only, not fitted to real NSE OI.
  function openInterest(rand, K, spot, itm) {
    var d = Math.abs(K - spot) / STEP;
    var oi = (50000 + 350000 * Math.exp(-d / 3)) * (0.8 + 0.4 * rand());
    if (K % 500 === 0) oi *= 3; else if (K % 100 === 0) oi *= 1.5; // round numbers attract sellers
    if (itm) oi *= 0.15;
    return oi;
  }
  // Make the biggest OI on a side clearly the wall (≥ 20% above the runner-up) and give it fresh writing (+30–40%).
  function wall(rows, side, rand) {
    var sorted = rows.slice().sort(function (a, b) { return b[side].oi - a[side].oi; }), top = sorted[0][side];
    top.oi = Math.max(top.oi, sorted[1][side].oi * 1.2);
    top.chg = top.oi * (0.3 + 0.1 * rand());
  }

  function build(seed) {
    var sim = Market.simulate({ S0: 24000, days: 1, seed: seed });
    var spot = Math.round(sim.S[1] * 100) / 100, vix = sim.vix[1], rand = Engine.rng(seed * 7919 + 13);
    if (Math.abs(spot - Market.atm('NIFTY', spot)) === STEP / 2) spot += 0.05; // exactly halfway: two strikes would be "closest"
    var tilt = 0.7 + 0.7 * rand(); // put side OI multiplier, so PCR varies around 1
    var rows = Market.strikes('NIFTY', spot, 5).map(function (K) {
      var row = { K: K };
      ['call', 'put'].forEach(function (type) {
        var o = { type: type, S: spot, K: K, T: T, vix: vix }, itm = type === 'call' ? K < spot : K > spot;
        var oi = openInterest(rand, K, spot, itm) * (type === 'put' ? tilt : 1);
        row[type === 'call' ? 'ce' : 'pe'] = { ltp: Market.premium(o), iv: Math.round(Market.iv(o) * 1000) / 10, oi: oi,
          chg: oi * (0.05 + 0.35 * rand()) * (rand() < 0.6 ? 1 : -1), itm: itm, delta: Market.greeks(o).delta };
      });
      return row;
    });
    wall(rows, 'ce', rand); wall(rows, 'pe', rand);
    if (Math.abs(pcr(rows) - 1) < 0.05) rows.forEach(function (r) { r.pe.oi *= 1.1; r.pe.chg *= 1.1; }); // keep PCR clearly above or below 1
    rows.forEach(function (r) {
      [r.ce, r.pe].forEach(function (s) { s.oi = Math.round(s.oi); s.chg = Math.round(s.chg); s.vol = Math.round(s.oi * (0.3 + 0.9 * rand())); });
    });
    var c = { seed: seed, spot: spot, vix: vix, T: T, atm: Market.atm('NIFTY', spot), rows: rows };
    c.pcr = pcr(rows);
    c.maxPain = maxPain(rows).K;
    var a = row(c, c.atm);
    c.straddle = Math.round((a.ce.ltp + a.pe.ltp) * 100) / 100; // ± points the market expects by expiry
    return c;
  }

  function row(c, K) { return c.rows.filter(function (r) { return r.K === K; })[0]; }
  function sum(rows, side) { return rows.reduce(function (a, r) { return a + r[side].oi; }, 0); }
  function pcr(rows) { return sum(rows, 'pe') / sum(rows, 'ce'); }
  // Total paid to option buyers (points × contracts) if NIFTY expires at Kstar.
  function painAt(rows, Kstar) {
    return rows.reduce(function (a, r) { return a + r.ce.oi * Math.max(0, Kstar - r.K) + r.pe.oi * Math.max(0, r.K - Kstar); }, 0);
  }
  function maxPain(rows) {
    var best = null;
    rows.forEach(function (r) { var p = painAt(rows, r.K); if (!best || p < best.pain) best = { K: r.K, pain: p }; });
    return best;
  }
  function wallK(c, side) { return c.rows.reduce(function (a, r) { return r[side].oi > a[side].oi ? r : a; }).K; }
  function dearest(c) {
    var best = null;
    c.rows.forEach(function (r) { [['call', r.ce], ['put', r.pe]].forEach(function (x) { if (!best || x[1].ltp > best.ltp) best = { type: x[0], K: r.K, ltp: x[1].ltp }; }); });
    best.ltpOf = function (type, K) { return side(c, type, K).ltp; }; // a tie at the same price also counts
    return best;
  }
  function side(c, type, K) { var r = row(c, K); return type === 'call' ? r.ce : r.pe; }
  // |delta| ≈ chance of expiring in the money.
  function prob(c, type, K) { return Math.abs(side(c, type, K).delta); }
  // Answer choices in %: the |delta| rounded to 5, plus the two choices from a fixed ladder nearest to it but ≥ 15 away.
  function probChoices(p) {
    var right = Math.max(5, Math.round(p * 20) * 5);
    var others = [5, 25, 50, 75, 95].filter(function (x) { return Math.abs(x - right) >= 15; })
      .sort(function (a, b) { return Math.abs(a - right) - Math.abs(b - right); }).slice(0, 2);
    return { right: right, list: others.concat(right).sort(function (a, b) { return a - b; }) };
  }

  function nm(type, K) { return num(K) + (type === 'call' ? ' CE' : ' PE'); }

  // 8 questions. kind: 'strike' (tap a row), 'option' (tap a CE/PE cell), 'mc' (choose). answer checked by check().
  function questions(c) {
    var ceW = wallK(c, 'ce'), peW = wallK(c, 'pe'), dear = dearest(c), up = c.atm + 200, dn = c.atm - 200;
    var ivC = side(c, 'call', up).iv, ivP = side(c, 'put', dn).iv, pr = Math.round(c.pcr * 100) / 100;
    var mp = c.maxPain, prow = function (K) { return row(c, K) ? nm('call', K).replace(' CE', '') + ': ' + crore(painAt(c.rows, K) * LOT) : ''; };
    var pK = c.atm + 200, pCE = side(c, 'call', pK), pc = probChoices(prob(c, 'call', pK));
    var dearIntr = Math.abs(c.spot - dear.K);
    return [
      { kind: 'strike', text: 'Tap the ATM (at-the-money) strike: the one closest to NIFTY ' + num2(c.spot) + '.', answer: c.atm,
        why: 'NIFTY ' + num2(c.spot) + ' is ' + Math.abs(c.spot - c.atm).toFixed(2) + ' points from ' + num(c.atm) + ', closer than any other strike, so ' + num(c.atm) + ' is ATM.' },
      { kind: 'strike', text: 'Which strike has the highest CE (call) OI? Tap its row.', answer: ceW,
        why: num(ceW) + ' CE has ' + num(row(c, ceW).ce.oi) + ' contracts open. That\'s the call wall: many sellers bet NIFTY stays below it; traders read it as resistance.' },
      { kind: 'strike', text: 'Which strike has the highest PE (put) OI? Tap its row.', answer: peW,
        why: num(peW) + ' PE has ' + num(row(c, peW).pe.oi) + ' contracts open. That\'s the put wall: many sellers bet NIFTY stays above it; traders read it as support.' },
      { kind: 'option', text: 'Tap the option (a CE or PE price) that costs the most for 1 lot of 65.', answer: dear,
        why: nm(dear.type, dear.K) + ' at ' + dear.ltp.toFixed(2) + ' × 65 = ' + Market.fmt(dear.ltp * LOT) + ' per lot is the dearest. ITM options cost more because they already have intrinsic value (here ' + dearIntr.toFixed(0) + ' points).' },
      { kind: 'mc', text: nm('call', up) + ' and ' + nm('put', dn) + ' are both 200 points from ATM. Which has the higher IV, and why?',
        choices: ['The ' + nm('put', dn) + ': index puts carry higher IV because crashes are faster than rallies and people pay up for protection',
          'The ' + nm('call', up) + ': calls carry higher IV because NIFTY usually rises', 'Neither: same distance means the same IV'],
        answer: ivP > ivC ? 0 : ivC > ivP ? 1 : 2, rot: c.seed % 3, // rotated below so the right answer is not always first
        why: nm('put', dn) + ' IV ' + ivP.toFixed(1) + '% vs ' + nm('call', up) + ' IV ' + ivC.toFixed(1) + '%. This tilt is called skew: index puts carry higher IV because crashes are faster than rallies and people pay up for protection.' },
      { kind: 'mc', text: 'PCR (put-call ratio) = total PE OI ÷ total CE OI = ' + pr.toFixed(2) + '. What does it mean?',
        choices: ['More put contracts than call contracts are open', 'More call contracts than put contracts are open', 'Nothing: it compares option prices'],
        answer: c.pcr > 1 ? 0 : 1,
        why: 'PCR ' + pr.toFixed(2) + (c.pcr > 1 ? ' is above 1, so more put OI is open' : ' is below 1, so more call OI is open, often read as a ceiling (call sellers defend higher strikes)') +
          '. A PCR above 1 means more put OI, often read as support (put sellers defend lower strikes) or as a crowded hedge. Both are trader habits, not rules.' },
      { kind: 'strike', text: 'Max pain is the expiry level where option buyers would collect the least in total. Tap the max-pain strike.', answer: mp,
        why: 'Total paid to buyers if NIFTY expires at ' + [mp - STEP, mp, mp + STEP].map(prow).filter(String).join(' · ') + '. ' + num(mp) + ' is the lowest, so it is max pain.' },
      { kind: 'mc', text: 'The ' + nm('call', pK) + ' costs ' + Market.fmt(pCE.ltp * LOT) + ' for a lot. Roughly what chance does the market give NIFTY to be above ' + num(pK) + ' at Tuesday\'s expiry?',
        choices: pc.list.map(function (x) { return '~' + x + '%'; }), answer: pc.list.indexOf(pc.right),
        why: 'Its delta is ' + pCE.delta.toFixed(2) + ', so about ' + pc.right + '%: delta ≈ probability of expiring in the money.' }
    ].map(function (q) {
      if (!q.rot) return q;
      q.choices = q.choices.slice(q.rot).concat(q.choices.slice(0, q.rot));
      q.answer = (q.answer - q.rot + 3) % 3;
      return q;
    });
  }

  // ans: {K} for a row tap, {type, K} for a cell tap, a choice index for 'mc'.
  function check(q, ans) {
    if (q.kind === 'mc') return ans === q.answer;
    if (!ans || ans.K == null) return false;
    if (q.kind === 'strike') return ans.K === q.answer;
    return !!ans.type && q.answer.ltpOf(ans.type, ans.K) === q.answer.ltp;
  }

  var Chain = { LOT: LOT, T: T, NOW: NOW, EXPIRY: EXPIRY, num: num, num2: num2, build: build, row: row, pcr: pcr, painAt: painAt, maxPain: maxPain,
    wallK: wallK, dearest: dearest, prob: prob, probChoices: probChoices, questions: questions, check: check };
  if (node) module.exports = Chain; else root.Chain = Chain;
})(this);
