/* ============================================================
   pipeline.js - Step 1, the Review Intelligence Layer

   Runs live on the real review corpus in data/corpus.js:
     1. cluster reviews into at most 5 themes
     2. rank them and take the top 3
     3. pull 3 real user quotes, verbatim
     4. isolate one recurring fee/charge confusion

   Every assignment records the patterns that triggered it, so any
   number on screen can be traced back to the reviews behind it.
   ============================================================ */
(function (root) {
  'use strict';

  var C = (typeof require !== 'undefined' && typeof module !== 'undefined')
    ? require('./data/corpus.js')
    : { REVIEWS: root.REVIEWS, CORPUS_META: root.CORPUS_META };

  var MAX_THEMES = 5;
  var TOP_N = 3;

  /* Word-boundary patterns throughout. Substring matching is wrong here:
     "feedback" contains "fee", which drags order-failure reviews into the
     charges theme and corrupts the ranking. */
  var THEMES = [
    { name: 'Charges & fee transparency', pats: [
      /brokerage/i, /charges?\b/i, /charged\b/i, /\bfees?\b/i,
      /hidden (charge|fee|cost)/i, /expense ratio/i, /dp charge/i, /\bamc\b/i,
      /stamp duty/i, /\bgst\b/i, /\bstt\b/i, /deduct(ed|ion)?/i, /commission/i,
      /costly/i, /expensive/i, /too much (charge|money)/i,
      /square[- ]?off charge/i, /\bloot\b/i ] },
    { name: 'Support unresponsive', pats: [
      /customer (support|care|service)/i, /support team/i, /no response/i,
      /not respond(ing)?/i, /no reply/i, /unhelpful/i, /helpless/i,
      /raised? a ticket/i, /chat support/i, /no resolution/i, /never resolve/i,
      /\bai agent\b/i, /chatbot/i, /human agent/i ] },
    { name: 'Account opening & KYC', pats: [
      /\bkyc\b/i, /aadh?ar/i, /pan card/i, /verification/i, /account opening/i,
      /open(ing)? (a )?demat/i, /nominee/i, /re-?kyc/i, /signature/i,
      /account (is )?not opened/i, /activation/i ] },
    { name: 'App reliability & order execution', pats: [
      /crash(es|ed|ing)?/i, /hang(s|ing)?/i, /stuck/i, /freez(e|es|ing)/i,
      /lag(gy|s|ging)?/i, /slow/i, /not loading/i, /\berror\b/i, /\bbug\b/i,
      /glitch/i, /\btpin\b/i, /order (failed|not placed|placing)/i,
      /square[- ]?off/i, /not working/i, /chart (is )?not/i, /app (is )?not/i ] },
    { name: 'Money movement delays', pats: [
      /withdraw(al|n)?/i, /not credited/i, /money (is )?not/i, /fund transfer/i,
      /\bpending\b/i, /redeem|redemption/i, /refund/i, /payout/i, /settlement/i,
      /deposit(ed)?/i, /not added/i, /balance not/i ] }
  ].slice(0, MAX_THEMES);

  /* Which specific charge a user names, inside the charges theme. */
  var CHARGE_KINDS = [
    { key: 'brokerage',   label: 'Brokerage on equity orders', pat: /brokerage/i },
    { key: 'amc',         label: 'Account maintenance (AMC)',  pat: /\bamc\b|annual maintenance/i },
    { key: 'dp',          label: 'DP / demat sell charge',     pat: /dp charges?|demat charges?|depository/i },
    { key: 'squareoff',   label: 'Intraday auto square-off',   pat: /square[- ]?off/i },
    { key: 'statutory',   label: 'GST / STT / stamp duty',     pat: /\bgst\b|\bstt\b|stamp duty/i },
    { key: 'expense',     label: 'Mutual fund expense ratio',  pat: /expense ratio/i },
    { key: 'pledge',      label: 'Pledge / margin charge',     pat: /pledge/i }
  ];

  function classify(text) {
    var best = null, bestN = 0, bestHits = [];
    for (var i = 0; i < THEMES.length; i++) {
      var hits = [];
      for (var j = 0; j < THEMES[i].pats.length; j++) {
        if (THEMES[i].pats[j].test(text)) hits.push(THEMES[i].pats[j].source);
      }
      if (hits.length > bestN) { bestN = hits.length; best = THEMES[i].name; bestHits = hits; }
    }
    return { theme: best, hits: bestHits };
  }

  function asciiRatio(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) if (s.charCodeAt(i) < 128) n++;
    return s.length ? n / s.length : 0;
  }

  function run() {
    var reviews = C.REVIEWS;
    var buckets = {}, counts = {}, negs = {}, unassigned = 0;

    THEMES.forEach(function (t) { buckets[t.name] = []; counts[t.name] = 0; negs[t.name] = 0; });

    reviews.forEach(function (r) {
      var c = classify(r.t);
      if (!c.theme) { unassigned++; return; }
      r._hits = c.hits;
      buckets[c.theme].push(r);
      counts[c.theme]++;
      if (r.r <= 2) negs[c.theme]++;
    });

    var ranked = THEMES.map(function (t) {
      return {
        name: t.name,
        count: counts[t.name],
        negative: negs[t.name],
        negRate: counts[t.name] ? Math.round(100 * negs[t.name] / counts[t.name]) : 0,
        share: Math.round(1000 * counts[t.name] / reviews.length) / 10
      };
    }).sort(function (a, b) { return b.count - a.count; });

    var top = ranked.slice(0, TOP_N);

    /* one verbatim quote per top theme: negative, readable, most upvoted */
    var quotes = top.map(function (t) {
      var pool = buckets[t.name].filter(function (r) {
        return r.r <= 2 && r.t.length >= 90 && r.t.length <= 240 && asciiRatio(r.t) > 0.98;
      }).sort(function (a, b) { return b.u - a.u; });
      var q = pool[0];
      return q ? {
        theme: t.name, text: q.t, rating: q.r, date: q.d,
        upvotes: q.u, id: q.i
      } : null;
    }).filter(Boolean);

    /* the fee confusion, derived - not assumed */
    var feeRows = buckets['Charges & fee transparency'] || [];
    var kinds = CHARGE_KINDS.map(function (k) {
      var hits = feeRows.filter(function (r) { return k.pat.test(r.t); });
      return {
        key: k.key, label: k.label, count: hits.length,
        negative: hits.filter(function (r) { return r.r <= 2; }).length,
        examples: hits.filter(function (r) { return r.r <= 2 && r.t.length >= 70; })
                      .sort(function (a, b) { return b.u - a.u; }).slice(0, 4)
      };
    }).sort(function (a, b) { return b.count - a.count; });

    var leading = kinds[0];

    return {
      meta: C.CORPUS_META,
      analysed: reviews.length,
      assigned: reviews.length - unassigned,
      unassigned: unassigned,
      themes: ranked,
      top: top,
      quotes: quotes,
      chargeKinds: kinds.filter(function (k) { return k.count > 0; }),
      feeIssue: leading,
      buckets: buckets
    };
  }

  var API = { run: run, THEMES: THEMES, MAX_THEMES: MAX_THEMES, TOP_N: TOP_N };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.Pipeline = API;
})(typeof window !== 'undefined' ? window : globalThis);
