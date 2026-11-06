// Concept lessons shown between the games on the learning path: a few teach cards (some with a chart or chain to touch),
// then six questions. A teach card is a string or { text, dial } / { text, chain }.
// Plain script (browser) + node module (tests). Facts follow market.js: NIFTY lot 65, Tuesday 15:30 expiry, cash settled.
(function (root) {
  function leg(side, type, K) { return { side: side, type: type, K: K }; }
  // A teach-card dial: the curve shows from the start and the player drags along it (lessons/dial.js).
  function explore(dial, pos, min, max) {
    return { dial: dial, pos: pos, goal: dial === 'expiry' ? 0 : null, x: { min: min, max: max, step: dial === 'days' ? 0.25 : dial === 'strike' ? 50 : 5, start: dial === 'days' ? 0 : 24000 } };
  }

  var LESSONS = {
    'u1-l1': {
      title: 'What an option is', unit: 1,
      teach: [
        'An option is a right, not an obligation. The buyer pays a premium for that right; the seller receives the premium and takes on the obligation.',
        { text: 'A CE (call) gains when NIFTY rises above its strike. A PE (put) gains when NIFTY falls below its strike. Here is a bought CE.',
          dial: explore('expiry', leg('buy', 'call', 24000), 23700, 24300) },
        'One NIFTY lot is 65 units. Weekly options expire on Tuesday at 15:30 and settle in cash: no shares change hands.'
      ],
      questions: [
        { kind: 'choice', prompt: 'You buy a NIFTY CE. What do you hold?',
          choices: ['An obligation to buy NIFTY at the strike', 'A right to the gain if NIFTY ends above the strike', 'A promise from the seller that NIFTY will rise by expiry'],
          answer: 1, why: 'A buyer pays for a right, not a duty. If NIFTY ends below the strike, the buyer lets it lapse and loses only the premium.' },
        { kind: 'truefalse', prompt: 'A PE gains value when NIFTY rises.', answer: false,
          why: 'A PE pays when NIFTY ends below its strike, so it gains when NIFTY falls. The CE is the one that gains when NIFTY rises.' },
        { kind: 'payoff', prompt: 'Which line is a bought PE?',
          choices: [leg('buy', 'call', 24000), leg('sell', 'put', 24000), leg('buy', 'put', 24000)],
          answer: 2, why: 'A bought PE sits at a small fixed loss above the strike and rises as NIFTY falls below it. The fixed loss is the premium.' },
        { kind: 'numbers', prompt: 'A 24,000 CE trades at 120 points. What does one lot cost, before charges?',
          choices: ['₹120', '₹7,800', '₹12,000'], answer: 1, calc: { expr: '120*65' },
          why: 'Premiums are quoted per unit. One NIFTY lot is 65 units, so you pay 120 × 65 = ₹7,800, plus charges.' },
        { kind: 'match', prompt: 'Match each term to its meaning.',
          pairs: [['Strike', 'The NIFTY level the option is measured against'], ['Premium', 'The price paid for the option'],
            ['Lot', '65 units, the smallest NIFTY order'], ['Expiry', 'Tuesday 15:30, when the weekly option ends']],
          why: 'These four words are on every order screen. Strike and expiry define the contract; premium and lot size set what you pay.' },
        { kind: 'choice', prompt: 'NIFTY settles at 24,150 on expiry. You hold one lot of the 24,000 CE. What happens?',
          choices: ['You receive NIFTY shares', 'Nothing, options only pay if sold early', 'You are paid 150 × 65 in cash'],
          answer: 2, why: 'NIFTY options are cash settled. An in-the-money option pays its intrinsic value, here 150 × 65 = ₹9,750, less STT.' }
      ]
    },

    'u1-l2': {
      title: 'Time value and VIX', unit: 1,
      teach: [
        'Premium = intrinsic value + time value. Intrinsic value is what the option would pay if expiry were now. The rest is time value.',
        { text: 'Time value falls every trading day, and faster near expiry. That daily fall is theta. When India VIX rises, premiums get dearer.',
          dial: explore('days', leg('buy', 'call', 24000), 0, 4) },
        'You buy at the ask, sell at the bid, and pay charges on each order. A buyer can lose at most the premium plus charges.'
      ],
      questions: [
        { kind: 'numbers', prompt: 'NIFTY is at 24,180. A 24,000 CE costs 230 points. What is its intrinsic value for one lot?',
          choices: ['₹11,700', '₹14,950', '₹3,250'], answer: 0, calc: { expr: 'Math.max(0, 24180-24000)*65' },
          why: 'Intrinsic value is 24,180 − 24,000 = 180 points, and 180 × 65 = ₹11,700. The other 50 points of the premium are time value.' },
        { kind: 'numbers', prompt: 'Same CE: premium 230 points, intrinsic value 180 points. How much time value is that per lot?',
          choices: ['₹11,700', '₹3,250', '₹50'], answer: 1, calc: { expr: '(230-180)*65' },
          why: 'Time value = premium − intrinsic = 50 points, and 50 × 65 = ₹3,250. This is the part that will be gone by expiry.' },
        { kind: 'dial', dial: 'days', pos: leg('buy', 'call', 24000),
          x: { min: 0, max: 4, step: 0.25, start: 0 }, goal: 5489.25, answer: 3, tol: 0.25,
          prompt: 'Thursday 09:15: the 24,000 CE costs ₹10,979 a lot. If NIFTY stays at 24,000, when is half of that gone?',
          why: 'Half is gone at Tuesday 09:15, with 1 trading day left. Decay speeds up near expiry: the first 3 days take ₹5,489, the last day takes the other ₹5,489.' },
        { kind: 'choice', prompt: 'India VIX rises from 14 to 18 and NIFTY has not moved. What happens to premiums?',
          choices: ['They fall, because nervous markets push all prices down', 'They rise, because bigger moves are expected', 'They stay the same, NIFTY has not moved'],
          answer: 1, why: 'VIX measures the size of move the market expects. A bigger expected move makes every option dearer, CEs and PEs alike.' },
        { kind: 'match', prompt: 'Match each term to its meaning.',
          pairs: [['Theta', 'Value lost per day if nothing moves'], ['Vega', 'Change in value per 1-point move in VIX'],
            ['Ask', 'The price you buy at'], ['Bid', 'The price you sell at']],
          why: 'Buying at the ask and selling at the bid costs the spread on every round trip, on top of theta and charges.' },
        { kind: 'choice', prompt: 'You buy one lot at 100 points per unit. What is the most you can lose?',
          choices: ['₹100 per lot, plus charges', 'No limit if NIFTY moves against you', '₹6,500 plus charges'], answer: 2,
          why: 'A buyer can lose at most the premium paid, 100 × 65 = ₹6,500, plus brokerage and other charges on each order.' }
      ]
    },

    'u2-l1': {
      title: 'Reading a payoff chart', unit: 2,
      teach: [
        { text: 'A payoff chart shows profit or loss for one lot (up the side) against where NIFTY ends at expiry (along the bottom).',
          dial: explore('expiry', leg('buy', 'call', 24000), 23700, 24300) },
        'The line bends at the strike. It crosses zero at the breakeven: strike + premium for a CE, strike − premium for a PE.',
        { text: "A seller's line is the buyer's line turned upside down. What the buyer gains, the seller loses. Here is the sold CE.",
          dial: explore('expiry', leg('sell', 'call', 24000), 23700, 24300) }
      ],
      questions: [
        { kind: 'payoff', prompt: 'Which line is a bought CE?',
          choices: [leg('buy', 'put', 24000), leg('sell', 'call', 24000), leg('buy', 'call', 24000)],
          answer: 2, why: 'A bought CE sits at a small fixed loss below the strike and rises to the right. The fixed loss is the premium paid.' },
        { kind: 'dial', dial: 'expiry', pos: leg('buy', 'call', 24000),
          x: { min: 23700, max: 24300, step: 5, start: 24000 }, goal: 0, answer: 24168.9, tol: 20,
          prompt: 'You buy the 24,000 CE for 168.90 points. Drag NIFTY to its breakeven at expiry.',
          why: 'Breakeven is strike + premium: 24,000 + 168.90 = 24,168.90. Below it the CE pays back less than the ₹10,979 you paid for the lot, before charges.' },
        { kind: 'numbers', prompt: 'You buy a 24,000 PE for 80 points. Where is the breakeven at expiry, before charges?',
          choices: ['NIFTY 24,080', 'NIFTY 23,920', 'NIFTY 24,000'], answer: 1, calc: { expr: '24000-80' },
          why: 'A PE gains as NIFTY falls, so the breakeven is below the strike: 24,000 − 80 = 23,920.' },
        { kind: 'payoff', prompt: 'Which line is a sold PE?',
          choices: [leg('buy', 'put', 23900), leg('sell', 'put', 23900), leg('sell', 'call', 23900)],
          answer: 1, why: 'A sold PE keeps the premium while NIFTY stays above the strike, and loses more for every point NIFTY falls below it.' },
        { kind: 'truefalse', prompt: 'On a payoff chart, the line going up the side is the NIFTY level at expiry.', answer: false,
          why: 'NIFTY at expiry runs along the bottom. The side shows profit or loss in rupees for one lot.' },
        { kind: 'choice', prompt: "Where does a single option's payoff line bend?",
          choices: ['At the breakeven', "At today's NIFTY level", 'At the strike'], answer: 2,
          why: 'Below a CE strike the option pays nothing; above it, it pays point for point. That change happens exactly at the strike.' }
      ]
    },

    'u2-l2': {
      title: 'Spreads, straddles, strangles', unit: 2,
      teach: [
        { text: 'A spread buys one option and sells another of the same type. The sold option lowers the cost and caps the gain.',
          dial: explore('expiry', [leg('buy', 'call', 24000), leg('sell', 'call', 24100)], 23700, 24400) },
        'A long straddle buys a CE and a PE at the same strike. It pays when NIFTY moves far in either direction.',
        'A strangle uses a CE above NIFTY and a PE below it. Selling one collects two premiums but leaves both sides open.'
      ],
      questions: [
        { kind: 'payoff', prompt: 'Which line is a bull call spread?',
          choices: [leg('buy', 'call', 24000), [leg('buy', 'call', 24000), leg('sell', 'call', 24100)], [leg('buy', 'call', 24000), leg('buy', 'put', 24000)]],
          answer: 1, why: 'Buying the 24,000 CE and selling the 24,100 CE gives a line that rises between the strikes and goes flat above 24,100.' },
        { kind: 'payoff', prompt: 'Which line is a long straddle?',
          choices: [[leg('buy', 'call', 24000), leg('buy', 'put', 24000)], [leg('sell', 'call', 24100), leg('sell', 'put', 23900)], [leg('buy', 'put', 24000), leg('sell', 'put', 23900)]],
          answer: 0, why: 'A long straddle is a V. It loses both premiums if NIFTY ends at the strike and gains as NIFTY moves far either way.' },
        { kind: 'truefalse', prompt: 'A short strangle has a capped loss because it has two legs.', answer: false,
          why: 'Both legs are sold. Above the CE strike the loss grows without limit, and below the PE strike it grows as NIFTY falls.' },
        { kind: 'numbers', prompt: 'Bull call spread: buy 24,000 CE at 120, sell 24,100 CE at 75. What does one lot cost?',
          choices: ['₹7,800', '₹2,925', '₹4,875'], answer: 1, calc: { expr: '(120-75)*65' },
          why: 'You pay 120 and receive 75, a net 45 points. 45 × 65 = ₹2,925, which is also the most the spread can lose.' },
        { kind: 'numbers', prompt: 'Same spread, net cost 45 points. What is its maximum gain per lot at expiry?',
          choices: ['₹6,500', '₹2,925', '₹3,575'], answer: 2, calc: { expr: '(24100-24000-45)*65' },
          why: 'The spread pays at most the 100-point gap between strikes. Minus the 45 points paid, that leaves 55 × 65 = ₹3,575.' },
        { kind: 'dial', dial: 'expiry', pos: [leg('buy', 'call', 24000), leg('buy', 'put', 24000)],
          x: { min: 23600, max: 24400, step: 5, start: 24000 }, goal: 0, answer: 24337.8, tol: 20,
          prompt: 'A long 24,000 straddle costs 168.90 (CE) + 168.90 (PE) points. Drag NIFTY to its upper breakeven.',
          why: 'NIFTY must move more than both premiums together, 337.80 points: 24,000 + 337.80 = 24,337.80. The lower breakeven is 23,662.20.' }
      ]
    },

    'u3-l1': {
      title: 'Expiry day', unit: 3,
      teach: [
        "On expiry Tuesday every option's time value goes to zero by 15:30. What is left is intrinsic value, settled in cash.",
        'An out-of-the-money option has no intrinsic value. It is all time value, so it ends at zero unless NIFTY crosses the strike.',
        { text: 'Time value falls faster as expiry gets closer. On expiry day theta is counted per hour, not per day.',
          dial: explore('days', leg('buy', 'call', 24000), 0, 4) }
      ],
      questions: [
        { kind: 'truefalse', prompt: 'At 15:30 on expiry day, an option still has some time value left.', answer: false,
          why: 'At 15:30 no time is left, so time value is zero. An in-the-money option settles at its intrinsic value; the rest pay nothing.' },
        { kind: 'numbers', prompt: 'NIFTY settles at 24,130 at 15:30 on expiry. What does one lot of the 24,050 CE pay?',
          choices: ['₹0', '₹8,450', '₹5,200'], answer: 2, calc: { expr: 'Math.max(0, 24130-24050)*65' },
          why: 'At expiry the CE pays only its intrinsic value: 24,130 − 24,050 = 80 points, and 80 × 65 = ₹5,200, before STT.' },
        { kind: 'numbers', prompt: 'NIFTY settles at 24,130 at 15:30 on expiry. What does one lot of the 24,200 CE pay?',
          choices: ['₹4,550', '₹0', '₹325'], answer: 1, calc: { expr: 'Math.max(0, 24130-24200)*65' },
          why: 'NIFTY ended below the 24,200 strike, so the CE has no intrinsic value. With its time value gone, it expires worthless.' },
        { kind: 'choice', prompt: 'NIFTY is 24,000 on expiry morning. Why is the 24,300 CE so cheap?',
          choices: ['It is a bargain the market has missed so far', 'NIFTY rarely moves 300 points in a day', 'Sellers are required to sell it cheap'],
          answer: 1, why: 'The price reflects how unlikely the move is. Most options this far out end at zero, so the market charges little for them.' },
        { kind: 'match', prompt: 'Match each term to its meaning.',
          pairs: [['ITM', 'Has intrinsic value right now'], ['ATM', 'Strike closest to NIFTY'],
            ['OTM', 'Would pay nothing if expiry were now'], ['Theta', 'Time value lost as time passes']],
          why: 'At 15:30 on expiry only ITM options are worth anything. ATM and OTM options are mostly or entirely time value.' },
        { kind: 'dial', dial: 'days', pos: leg('buy', 'call', 24000),
          x: { min: 3, max: 4, step: 0.04, start: 3 }, goal: 2744.625, answer: 3.76, tol: 0.04,
          prompt: 'Expiry day, 09:15: the 24,000 CE costs ₹5,489 a lot. If NIFTY stays at 24,000, when is half of that gone?',
          why: 'Half is gone at 14:00: 4 h 45 min take the first ₹2,745, the last 90 minutes take the rest. Decay is fastest just before the close.' }
      ]
    },

    'u3-l2': {
      title: 'Why cheap options trap buyers', unit: 3,
      teach: [
        'A cheap option is cheap because the market expects it to expire worthless. A low price per unit does not mean low risk.',
        { text: 'A cheap option can double in minutes and still end at zero. Doubling once is not the same as finishing in profit. Here is the 24,300 CE.',
          dial: explore('days', leg('buy', 'call', 24300), 0, 4) },
        "SEBI's FY25 study found that 91% of individual F&O traders lost money."
      ],
      questions: [
        { kind: 'truefalse', prompt: 'An option costing 5 points is safer to buy than one costing 100 points.', answer: false,
          why: 'Both buyers can lose all they paid. The 5-point option is more likely to, because it needs a bigger move to finish in the money.' },
        { kind: 'numbers', prompt: 'You buy 3 lots of a CE at 5 points. What have you paid, before charges?',
          choices: ['₹15', '₹325', '₹975'], answer: 2, calc: { expr: '5*65*3' },
          why: 'Premium × 65 × lots: 5 × 65 × 3 = ₹975. All of it is lost if NIFTY does not cross the strike by 15:30.' },
        { kind: 'dial', dial: 'strike', pos: leg('buy', 'call'),
          x: { min: 24000, max: 24600, step: 50, start: 24000 }, goal: 2000, answer: 24450, tol: 0,
          prompt: 'The 24,000 CE costs ₹10,979 a lot, 4 days to expiry. Drag to the nearest CE strike that costs under ₹2,000.',
          why: 'The 24,450 CE costs 26.40 points, ₹1,716 a lot. It is cheap because NIFTY has to rise 450 points in 4 days just to reach the strike.' },
        { kind: 'choice', prompt: 'Your 5-point option rises to 10 points at 11:00. What does that tell you about 15:30?',
          choices: ['It will probably double again before 15:30', 'Little; it can still end at zero', 'It is now safe to hold to expiry'], answer: 1,
          why: 'A doubled premium is still mostly time value. If NIFTY drifts back, that time value is gone by 15:30 and the option settles at zero.' },
        { kind: 'choice', prompt: 'You bought at 10 points and it falls to 4. What does buying more to average down do?',
          choices: ['Puts more money on the same losing bet', 'Lowers your total risk on the trade', 'Makes a recovery to your entry price more likely'], answer: 0,
          why: 'It lowers your average price, but the total amount at risk goes up. The option still needs NIFTY to cross the strike.' },
        { kind: 'numbers', prompt: 'You buy 1 lot at 6 points and sell at 8. Brokerage is ₹20 per order. Profit after brokerage?',
          choices: ['₹130', '₹90', '₹110'], answer: 1, calc: { expr: '(8-6)*65-2*20' },
          why: 'Gross profit is 2 × 65 = ₹130. Two orders cost ₹40 in brokerage, and STT, exchange fees and GST take a little more.' }
      ]
    },

    'u4-l1': {
      title: 'The option chain', unit: 4,
      teach: [
        'The option chain lists every strike for one expiry: CEs on the left, PEs on the right, strikes in the middle.',
        { text: 'ATM is the strike closest to NIFTY. ITM sides are shaded: CEs with strikes below NIFTY, PEs with strikes above it.',
          chain: { spot: 24000, rows: [23950, 24000, 24050], notes: [
            'The 23,950 CE is ITM: its strike is below NIFTY, so 50 points of its price is intrinsic value. The PE is OTM.',
            'ATM: the strike closest to NIFTY. Neither side has intrinsic value; both prices are all time value.',
            'The 24,050 PE is ITM: its strike is above NIFTY. The CE is OTM, so its price is all time value.'] } },
        'OI is how many contracts are open. Change in OI shows today\'s new positions. LTP is the last traded price per unit.'
      ],
      questions: [
        { kind: 'choice', prompt: 'NIFTY is at 24,080. Which strike is ATM?',
          choices: ['24,000', '24,050', '24,100'], answer: 2,
          why: 'ATM is the strike closest to NIFTY. 24,100 is 20 points away and 24,050 is 30 points away.' },
        { kind: 'truefalse', prompt: 'With NIFTY at 24,080, the 24,000 PE is in the money.', answer: false,
          why: 'A PE is in the money when its strike is above NIFTY. The 24,000 PE is below 24,080, so it is out of the money.' },
        { kind: 'numbers', prompt: 'The 24,100 CE shows LTP 92.40. What does one lot cost at that price?',
          choices: ['₹92', '₹6,006', '₹9,240'], answer: 1, calc: { expr: '92.40*65' },
          why: 'LTP is per unit. One lot is 65 units, so 92.40 × 65 = ₹6,006, before the spread and charges.' },
        { kind: 'match', prompt: 'Match each column to what it shows.',
          pairs: [['OI', 'Contracts still open'], ['Change in OI', 'Contracts opened minus closed today'],
            ['IV', 'Volatility implied by the option price'], ['LTP', 'Last traded price per unit']],
          why: 'These are the main columns of the NSE chain. OI and change in OI count positions; IV and LTP describe the price.' },
        { kind: 'choice', prompt: 'The 24,200 CE shows a large positive change in OI. What does that mean?',
          choices: ['Many new 24,200 CE contracts opened today', 'NIFTY is now likely to reach 24,200 by expiry', 'The 24,200 CE price rose today'], answer: 0,
          why: 'Change in OI counts positions, not direction. Every new contract has a buyer and a seller, so it shows activity at that strike.' },
        { kind: 'truefalse', prompt: 'OTM PEs usually show a higher IV than OTM CEs the same distance from NIFTY.', answer: true,
          why: 'This is called skew. Traders pay more for protection against falls, so OTM PEs carry a higher IV than OTM CEs.' }
      ]
    },

    'u4-l2': {
      title: 'OI walls, PCR, max pain, delta', unit: 4,
      teach: [
        { text: 'The strike with the most CE OI is often read as resistance, the most PE OI as support. These are readings of positions, not forecasts.',
          chain: { spot: 24000, rows: [23900, 24000, 24100], oi: [[0.8, 2.4], [1.6, 1.5], [2.7, 0.6]], notes: [
            'Biggest PE OI: the PE wall. Many read it as support. It is where puts were sold, not a floor.',
            'ATM: busy on both sides, but neither side has its biggest OI here.',
            'Biggest CE OI: the CE wall. Many read it as resistance, and NIFTY can still close above it.'] } },
        'PCR is total PE OI divided by total CE OI. Max pain is the expiry level where option holders together would be paid least.',
        'Delta is how much the premium moves for a 1-point NIFTY move. It is also a rough guide to the chance of finishing in the money.'
      ],
      questions: [
        { kind: 'numbers', prompt: 'A CE has delta 0.30. NIFTY rises 50 points. Roughly how much does one lot gain?',
          choices: ['₹975', '₹3,250', '₹15'], answer: 0, calc: { expr: '0.30*50*65' },
          why: 'Delta 0.30 means about 0.30 points per NIFTY point: 0.30 × 50 = 15 points, and 15 × 65 = ₹975. Delta itself changes as NIFTY moves.' },
        { kind: 'choice', prompt: 'Total PE OI is 1.2 times total CE OI. What is the PCR?',
          choices: ['0.83', '1.2', '2.2'], answer: 1,
          why: 'PCR = PE OI ÷ CE OI, so 1.2. Some read a high PCR as support from put sellers, but it is a reading, not a law.' },
        { kind: 'truefalse', prompt: 'NIFTY cannot close above the strike with the biggest CE OI.', answer: false,
          why: 'The CE wall shows where many contracts have been sold. NIFTY can and does close above it; it is a reading, not a limit on price.' },
        { kind: 'choice', prompt: 'What is max pain?',
          choices: ['The level NIFTY is pulled to and must settle at on expiry', 'The level where option holders would be paid least', 'The strike with the biggest PE OI'], answer: 1,
          why: "Max pain is worked out from today's OI. It moves as positions change, and NIFTY often settles away from it." },
        { kind: 'choice', prompt: 'A 24,300 CE has delta 0.05. What chance does the market roughly give it of finishing ITM?',
          choices: ['About 5%', 'About 50%', 'About 30%'], answer: 0,
          why: 'Delta is a rough guide to the chance of finishing in the money. A delta of 0.05 says about 1 chance in 20.' },
        { kind: 'match', prompt: 'Match each reading to how it is worked out.',
          pairs: [['CE wall', 'Strike with the biggest CE OI'], ['PE wall', 'Strike with the biggest PE OI'],
            ['PCR', 'PE OI divided by CE OI'], ['Delta', 'Premium change per 1-point NIFTY move']],
          why: 'All four come from the chain. Each describes where positions or prices sit now; none of them predicts where NIFTY will go.' }
      ]
    },

    'u5-l1': {
      title: 'Selling an option', unit: 5,
      teach: [
        { text: 'A seller receives the premium now and takes on the obligation. The most a seller can make is that premium. Here is a sold PE.',
          dial: explore('expiry', leg('sell', 'put', 24000), 23500, 24300) },
        'Selling blocks margin, about ₹1,25,000 per NIFTY lot in these games. STT of 0.15% is charged on the premium when you sell.',
        "A sold CE's loss has no limit as NIFTY rises. A sold PE's loss is large but capped, because NIFTY cannot fall below zero."
      ],
      questions: [
        { kind: 'payoff', prompt: 'Which line is a sold CE?',
          choices: [leg('buy', 'call', 24100), leg('sell', 'put', 24100), leg('sell', 'call', 24100)],
          answer: 2, why: 'A sold CE keeps the premium below the strike and loses more for every point NIFTY rises above it, with no limit.' },
        { kind: 'numbers', prompt: 'You sell one lot of a CE at 80 points. What is the most you can make?',
          choices: ['₹80', '₹5,200', '₹1,25,000'], answer: 1, calc: { expr: '80*65' },
          why: 'A seller can make at most the premium received: 80 × 65 = ₹5,200, less charges. That happens only if the CE expires worthless.' },
        { kind: 'dial', dial: 'expiry', pos: leg('sell', 'call', 24000),
          x: { min: 23700, max: 24700, step: 5, start: 24000 }, goal: -21957, answer: 24506.7, tol: 20,
          prompt: 'You sell the 24,000 CE for 168.90 points, ₹10,979 a lot. Drag NIFTY to where your loss is twice that.',
          why: 'A ₹21,957 loss needs NIFTY 3 × 168.90 points above the strike: 24,000 + 506.70 = 24,506.70. A 2.1% rise does it.' },
        { kind: 'truefalse', prompt: 'A sold PE has an unlimited loss, just like a sold CE.', answer: false,
          why: 'NIFTY cannot fall below zero, so a sold PE loss is capped at (strike − premium) × 65. For a 24,000 PE that is still about ₹15 lakh.' },
        { kind: 'choice', prompt: 'Why does a broker block margin when you sell an option?',
          choices: ['To cover losses if NIFTY moves against you', 'Because the premium you receive is paid to you later', 'It is a fee you do not get back'], answer: 0,
          why: 'A seller can lose many times the premium. Margin is held so those losses can be paid, and it is released when you close the position.' },
        { kind: 'match', prompt: 'Match each term to its meaning for a seller.',
          pairs: [['Premium received', 'The most a seller can make'], ['Margin', 'Money blocked while the position is open'],
            ['STT', '0.15% tax on the sell premium'], ['Sold CE', 'Loss grows without limit as NIFTY rises']],
          why: 'A seller earns little and slowly, blocks a lot of money, and carries the risk of a large loss. Know all three before you sell.' }
      ]
    },

    'u5-l2': {
      title: 'Gap days and hedging', unit: 5,
      teach: [
        'A sold option is marked to market each day: its loss or gain is counted at today\'s price, before you close it.',
        "NIFTY can open far from yesterday's close. A stop-loss cannot fill inside that gap; it fills at the first price available.",
        { text: 'A credit spread sells one option and buys a further-out one. The bought option caps the loss at (width − credit) × 65.',
          dial: explore('expiry', [leg('sell', 'call', 24000), leg('buy', 'call', 24100)], 23700, 24400) }
      ],
      questions: [
        { kind: 'truefalse', prompt: 'A stop-loss at 150 points guarantees you exit at 150 on a gap day.', answer: false,
          why: 'If NIFTY opens past your stop, the order fills at the first price available, which can be far worse than the stop.' },
        { kind: 'numbers', prompt: 'Sell 24,000 PE at 90, buy 23,900 PE at 50: a 40-point credit. Maximum loss per lot?',
          choices: ['₹6,500', '₹3,900', '₹2,600'], answer: 1, calc: { expr: '(24000-23900-(90-50))*65' },
          why: 'The strikes are 100 points apart. Take away the 40-point credit and 60 points remain: 60 × 65 = ₹3,900, however far NIFTY falls.' },
        { kind: 'numbers', prompt: 'Same spread, 40-point credit. What is the maximum gain per lot?',
          choices: ['₹2,600', '₹5,850', '₹3,900'], answer: 0, calc: { expr: '(90-50)*65' },
          why: 'The most a credit spread makes is the net credit: 40 × 65 = ₹2,600, if NIFTY stays above 24,000. The bought PE costs part of the premium.' },
        { kind: 'dial', dial: 'expiry', pos: [leg('sell', 'put', 24000), leg('buy', 'put', 23900)],
          x: { min: 23600, max: 24300, step: 5, start: 24000 }, goal: -3809, answer: 23900, tol: 10,
          prompt: 'You sell the 24,000 PE and buy the 23,900 PE. Drag NIFTY down to where the loss stops growing.',
          why: 'Below 23,900 the bought PE gains what the sold PE loses. Here the loss stops at ₹3,809 a lot, however far NIFTY falls.' },
        { kind: 'choice', prompt: 'NIFTY opens 3% lower on Monday. Which position loses the most?',
          choices: ['A bought PE', 'A sold PE spread', 'A naked sold PE'], answer: 2,
          why: 'A gap down takes NIFTY far below a sold PE strike, and VIX usually jumps too. The spread loss stops at its width; the naked loss keeps growing.' },
        { kind: 'choice', prompt: "Why is a credit spread's margin much lower than a naked sale's?",
          choices: ['The broker trusts spreads more than naked sales', 'Its maximum loss is known and small', 'Spreads cannot lose money'], answer: 1,
          why: 'The bought option caps the loss, so the broker only needs to block about that maximum loss instead of over ₹1 lakh.' }
      ]
    }
  };

  var Lessons = { LESSONS: LESSONS, ids: Object.keys(LESSONS) };
  if (typeof module !== 'undefined') module.exports = Lessons; else root.Lessons = Lessons;
})(this);
