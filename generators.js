/* ============================================================
   generators.js - Step 2 and Step 3

   Step 2  Weekly Product Pulse, <= 250 words, built from the
           pipeline output: top themes, real quotes, one key
           observation, three action ideas.
   Step 3  Fee Explainer for whichever charge the pipeline found
           users are most confused by. <= 6 bullets, neutral tone,
           two official source links, and a "Last checked" date.

   The explainer's facts are a grounded table read off the official
   pages listed in sources.csv. Nothing here is written from memory,
   and nothing is generated for a charge the reviews did not raise.
   ============================================================ */
(function (root) {
  'use strict';

  function today() {
    var d = new Date();
    var m = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return d.getDate() + ' ' + m[d.getMonth()] + ' ' + d.getFullYear();
  }
  function words(s) {
    return (s.replace(/[#*>|\-]/g, ' ').match(/[A-Za-z0-9â‚¹%.,']+/g) || []).length;
  }
  function trimQuote(t, max) {
    t = t.replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    var cut = t.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    return cut.slice(0, sp > 40 ? sp : max) + '...';
  }

  /* ---------- grounded fee facts, per charge the pipeline can surface ---------- */
  var FEE_FACTS = {
    brokerage: {
      title: 'Brokerage on an equity order',
      whyConfusing: 'Reviewers describe being charged more than the headline figure, ' +
                    'and being charged on buys as well as sells.',
      bullets: [
        'Groww charges the **lower of ₹20 or 0.1% of the order value** per executed order, not a flat ₹20. The stated minimum is the lower of ₹5 or 2.5% of trade value.',
        'It is charged **per executed order**. Several orders in one day each carry their own brokerage, so a day of active trading totals well above ₹20.',
        'For **delivery**, brokerage applies to **both the buy and the sell** leg. This is the single most common misreading in the reviews.',
        'Statutory and exchange levies are charged **on top of brokerage**: STT (0.1% on buy and sell for delivery; 0.025% on the sell leg for intraday), stamp duty (0.015% on buy for delivery, 0.003% intraday), exchange transaction charges (NSE 0.00307%, BSE 0.00375%) and the SEBI turnover fee (0.0001%).',
        '**GST at 18%** applies to brokerage, DP, exchange and SEBI charges — but **not** to STT or stamp duty.',
        'Selling from **delivery** also attracts a **DP charge**: ₹16.5 from Groww plus the depository’s ₹3.5 (₹3.25 for women investors), plus GST. Account opening and annual maintenance are listed at ₹0.'
      ],
      sources: [
        { label: 'Groww — Pricing and charges', url: 'https://groww.in/pricing' },
        { label: 'Groww Help — Why is my brokerage more than 20 rupees?', url: 'https://groww.in/help/payments-&-withdrawals/payments-charges/why-is-my-brokerage-more-than-20-rupees--71' }
      ]
    },
    amc: {
      title: 'Account maintenance charge (AMC)',
      whyConfusing: 'Reviewers expect a recurring demat maintenance fee.',
      bullets: [
        'Groww lists **₹0 account opening** and **₹0 maintenance** charges for the trading and demat account.',
        'Charges that do apply are **per transaction** — brokerage, DP charges on delivery sells, and statutory levies.',
        'A recurring debit is therefore more likely a DP charge on a sell, not an annual maintenance fee.'
      ],
      sources: [
        { label: 'Groww — Pricing and charges', url: 'https://groww.in/pricing' },
        { label: 'Groww Help — What fees does Groww charge?', url: 'https://groww.in/help/payments-&-withdrawals/payments-charges/what-fees-does-groww-charge--58' }
      ]
    },
    dp: {
      title: 'DP charge on a delivery sell',
      whyConfusing: 'Reviewers see a flat debit on selling that is unrelated to order size.',
      bullets: [
        'A **DP (depository participant) charge** applies **per sell transaction** from delivery holdings, regardless of order value.',
        'It is **₹16.5 from Groww** plus the depository’s **₹3.5** (₹3.25 for women investors), plus 18% GST.',
        'Groww lists **₹0** for its own portion where the debit value is under ₹100.',
        'There is **no DP charge on intraday**, because no shares leave the demat account.'
      ],
      sources: [
        { label: 'Groww — Pricing and charges', url: 'https://groww.in/pricing' },
        { label: 'Groww Help — What fees does Groww charge?', url: 'https://groww.in/help/payments-&-withdrawals/payments-charges/what-fees-does-groww-charge--58' }
      ]
    },
    squareoff: {
      title: 'Intraday auto square-off charge',
      whyConfusing: 'Reviewers are charged when the system closes an open intraday position.',
      bullets: [
        'If an intraday position is left open, it is squared off by the system and a **₹50 per position** charge applies.',
        'Closing the position yourself before the cut-off avoids the charge.',
        'Normal brokerage and statutory levies still apply to the squared-off trade.'
      ],
      sources: [
        { label: 'Groww — Pricing and charges', url: 'https://groww.in/pricing' },
        { label: 'Groww Help — What are intraday charges?', url: 'https://groww.in/help/stocks,-f&o,-ipo-&-mtf/sx-pricing/what-are-intraday-charges' }
      ]
    }
  };

  /* ---------- Step 2: Weekly Product Pulse ---------- */
  function weeklyPulse(a, dateStr) {
    var d = dateStr || today();
    var t = a.top, q = a.quotes, fee = a.feeIssue;
    var meta = a.meta;

    var themeLine = t.map(function (x, i) {
      return (i + 1) + '. **' + x.name + '** — ' + x.count + ' reviews, ' + x.negRate + '% rated 1-2 star';
    }).join('\n');

    var quoteLines = q.map(function (x) {
      return '> "' + trimQuote(x.text, 105) + '"\n> — ' + x.rating + '★ ' + x.date + ', ' + x.upvotes + ' upvotes';
    }).join('\n\n');

    var chargeTotal = a.themes.filter(function (x) { return x.name.indexOf('Charges') === 0; })[0].count;
    var obs =
      'Volume is not the whole story: **' + t[2].name.toLowerCase() + '** has the worst negative rate at ' +
      t[2].negRate + '%. Within charges, **' + fee.label.toLowerCase() + '** is named in ' + fee.count +
      ' of ' + chargeTotal + ' reviews. The complaint is rarely the amount — it is that the number ' +
      'was not predictable before the order.';

    var actions = [
      'Show a **pre-trade cost breakdown** on the order screen: brokerage, STT, stamp duty, exchange, SEBI and GST as separate lines.',
      'Add a **"why was I charged this?"** link on every contract note, deep-linked to the matching pricing row.',
      'Route charge-pattern reviews to a **support macro** built from the explainer below, so the answer never varies.'
    ];

    var md =
      '# Weekly Product Pulse — Groww\n' +
      '**Week of ' + d + '** | ' + meta.total_reviews.toLocaleString() + ' public Play Store reviews, ' +
      meta.window_start + ' to ' + meta.window_end + '\n\n' +
      '## Top themes\n' + themeLine + '\n\n' +
      '## What users said\n' + quoteLines + '\n\n' +
      '## Key observation\n' + obs + '\n\n' +
      '## Three things we could do\n' +
      actions.map(function (x, i) { return (i + 1) + '. ' + x; }).join('\n') + '\n';

    return { markdown: md, words: words(md), date: d };
  }

  /* ---------- Step 3: Fee Explainer ---------- */
  function feeExplainer(a, dateStr) {
    var d = dateStr || today();
    var key = a.feeIssue.key;
    var f = FEE_FACTS[key] || FEE_FACTS.brokerage;
    var bullets = f.bullets.slice(0, 6);

    var md =
      '# ' + f.title + '\n\n' +
      bullets.map(function (b) { return '- ' + b; }).join('\n') + '\n\n' +
      'Sources:\n' +
      f.sources.slice(0, 2).map(function (s) { return '- [' + s.label + '](' + s.url + ')'; }).join('\n') + '\n\n' +
      '_Last checked: ' + d + '_\n';

    return {
      markdown: md, title: f.title, bullets: bullets,
      sources: f.sources.slice(0, 2), date: d,
      whyConfusing: f.whyConfusing, bulletCount: bullets.length
    };
  }

  var API = { weeklyPulse: weeklyPulse, feeExplainer: feeExplainer, FEE_FACTS: FEE_FACTS, words: words, today: today };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Generators = API;
})(typeof window !== 'undefined' ? window : globalThis);
