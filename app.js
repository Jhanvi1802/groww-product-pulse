/* ============================================================
   app.js - renders the four workflow steps and drives the
   approval-gated MCP calls.

   Steps 1-3 run live on the real corpus every page load; nothing
   on screen is precomputed. Step 4 prepares two tool calls and
   executes neither until a human approves.
   ============================================================ */
(function () {
  'use strict';

  var A = window.Pipeline.run();
  var pulse = window.Generators.weeklyPulse(A);
  var fee = window.Generators.feeExplainer(A);

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  /* Minimal markdown. The block marker is stripped from the RAW line before
     escaping: escaping first turns "> " into "&gt; ", and slicing 2 characters
     off that leaves a stray "t;" at the front of every quote. */
  function inline(raw) {
    var t = esc(raw);
    t = t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    t = t.replace(/_([^_]+)_/g, '<i>$1</i>');
    return t;
  }
  function md(src) {
    var out = [], inUl = false, inOl = false;
    function close() {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    }
    src.split('\n').forEach(function (line) {
      var mHead = line.match(/^(#{1,3})\s+(.*)$/);
      var mUl = line.match(/^-\s+(.*)$/);
      var mOl = line.match(/^\d+\.\s+(.*)$/);
      var mQ = line.match(/^>\s?(.*)$/);

      if (mHead) { close(); out.push('<h3>' + inline(mHead[2]) + '</h3>'); }
      else if (mUl) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push('<li>' + inline(mUl[1]) + '</li>');
      }
      else if (mOl) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push('<li>' + inline(mOl[1]) + '</li>');
      }
      else if (mQ) {
        close();
        out.push('<div style="color:var(--ink2);font-style:italic">' + inline(mQ[1]) + '</div>');
      }
      else if (!line.trim()) { close(); }
      else { close(); out.push('<p style="margin:0 0 8px">' + inline(line) + '</p>'); }
    });
    close();
    return out.join('');
  }

  /* ---------------- header ---------------- */
  var m = A.meta;
  $('corpusmeta').textContent =
    m.total_reviews.toLocaleString() + ' public Google Play reviews for ' + m.app +
    ' (' + m.package + '), ' + m.window_start + ' to ' + m.window_end +
    ' | ' + A.analysed.toLocaleString() + ' substantive (>=' + m.min_chars + ' chars) analysed live in this page';

  [['Step 1 Reviews -> themes', true], ['Step 2 Weekly pulse', true],
   ['Step 3 Fee explainer', true], ['Step 4 MCP, approval-gated', false]]
    .forEach(function (s) {
      var c = el('div', 'stepchip' + (s[1] ? ' done' : ''), s[0]);
      $('stepchips').appendChild(c);
    });

  /* ---------------- step 1 ---------------- */
  $('s1sub').textContent = A.themes.length + ' themes (max ' + window.Pipeline.MAX_THEMES +
    ') | top ' + window.Pipeline.TOP_N + ' highlighted';

  var tbl = $('themetable');
  tbl.innerHTML = '<tr><th style="width:26px"></th><th>Theme</th><th style="width:92px">Reviews</th>' +
                  '<th style="width:110px">Share</th><th style="width:96px">1-2 star</th></tr>';
  var max = A.themes[0].count;
  A.themes.forEach(function (t, i) {
    var tr = el('tr', i < 3 ? 'istop' : '');
    tr.innerHTML =
      '<td><span class="rank">' + (i < 3 ? '#' + (i + 1) : '') + '</span></td>' +
      '<td>' + esc(t.name) + '</td>' +
      '<td><b>' + t.count + '</b></td>' +
      '<td><div class="bar"><i style="width:' + Math.round(100 * t.count / max) + '%"></i></div></td>' +
      '<td class="neg">' + t.negative + ' (' + t.negRate + '%)</td>';
    tbl.appendChild(tr);
  });

  var qbox = $('quotes');
  qbox.appendChild(el('div', 'stepchip', '3 real user quotes, verbatim'));
  qbox.lastChild.style.cssText = 'display:inline-block;margin-bottom:10px';
  A.quotes.forEach(function (q) {
    var b = el('blockquote', 'q');
    b.appendChild(el('div', 'th', q.theme));
    b.appendChild(el('p', null, '"' + q.text + '"'));
    b.appendChild(el('div', 'by', q.rating + ' star | ' + q.date + ' | ' + q.upvotes +
      ' upvotes | review ' + q.id));
    qbox.appendChild(b);
  });

  var f = A.feeIssue;
  var chargeTheme = A.themes.filter(function (x) { return x.name.indexOf('Charges') === 0; })[0];
  var fc = el('div', 'callout');
  fc.innerHTML = '<b>Recurring fee confusion identified:</b> ' + esc(f.label) +
    ' - named in <b>' + f.count + '</b> of ' + chargeTheme.count +
    ' charge-theme reviews, <b>' + f.negative + '</b> of them rated 1-2 star. ' +
    'Runners-up: ' + A.chargeKinds.slice(1, 4).map(function (k) {
      return esc(k.label) + ' (' + k.count + ')';
    }).join(', ') + '. This was derived from the reviews, not chosen in advance.';
  $('feecallout').appendChild(fc);

  /* ---------------- step 2 ---------------- */
  $('s2sub').textContent = 'limit 250 words';
  $('pulsedoc').innerHTML = md(pulse.markdown);
  $('pulsewords').innerHTML = 'Generated length: <b>' + pulse.words +
    ' words</b> against a 250-word limit.';

  /* ---------------- step 3 ---------------- */
  $('s3sub').textContent = fee.bulletCount + ' bullets (limit 6) | ' + fee.sources.length + ' official sources';
  $('feedoc').innerHTML = md(fee.markdown);

  /* ---------------- step 4: prepare the tool calls ---------------- */
  var docArgs = {
    date: pulse.date,
    top_themes: A.top.map(function (t) { return t.name; }),
    weekly_pulse: pulse.markdown,
    identified_fee_issue: fee.title,
    explanation_bullets: fee.bullets,
    source_links: fee.sources.map(function (s) { return s.url; })
  };
  var subject = 'Weekly Product Pulse + Customer Clarification - ' + pulse.date;
  var body =
    pulse.markdown + '\n\n---\n\n## Reusable support snippet - ' + fee.title + '\n\n' +
    fee.bullets.map(function (b) { return '- ' + b; }).join('\n') + '\n\n' +
    'Sources:\n' + fee.sources.map(function (s) { return '- ' + s.label + ': ' + s.url; }).join('\n') +
    '\n\nLast checked: ' + fee.date + '\n';
  var mailArgs = { to: ['product-team@internal', 'support-leads@internal'], subject: subject, body: body };

  function preview(o, clip) {
    var c = JSON.parse(JSON.stringify(o));
    if (clip && c.weekly_pulse) c.weekly_pulse = c.weekly_pulse.slice(0, 180) + '... [' + c.weekly_pulse.length + ' chars]';
    if (clip && c.body) c.body = c.body.slice(0, 180) + '... [' + c.body.length + ' chars]';
    return JSON.stringify(c, null, 2);
  }

  var calls = [
    { tool: 'append_to_doc', desc: window.MCP.TOOLS[0].description, args: docArgs },
    { tool: 'create_email_draft', desc: window.MCP.TOOLS[1].description, args: mailArgs }
  ];
  $('s4sub').textContent = calls.length + ' pending tool calls';

  var tc = $('toolcalls');
  calls.forEach(function (c) {
    var box = el('div', 'toolcall');
    var head = el('div', 'toolhead');
    head.appendChild(el('span', 'toolname', c.tool));
    head.appendChild(el('span', 'pill blue', 'pending'));
    head.appendChild(el('div', 'tooldesc', c.desc));
    box.appendChild(head);
    var bodyEl = el('div', 'toolbody');
    var pre = el('pre', 'json', preview(c.args, true));
    bodyEl.appendChild(pre);
    box.appendChild(bodyEl);
    tc.appendChild(box);
  });

  /* ---------------- approval gate ---------------- */
  var ack = $('ack'), approver = $('approver'), approveBtn = $('approve');
  function refresh() {
    approveBtn.disabled = !(ack.checked && approver.value.trim().length >= 2);
  }
  ack.addEventListener('change', refresh);
  approver.addEventListener('input', refresh);

  function showResult(title, res) {
    var ok = res.isError !== true;
    var d = el('div', 'result ' + (ok ? 'ok' : 'err'));
    d.appendChild(el('div', 'rt', (ok ? 'OK  ' : 'REFUSED  ') + title));
    d.appendChild(el('div', null, res.content[0].text));
    $('mcpout').appendChild(d);
  }

  function renderOutputs() {
    var st = window.MCP.getState();
    if (!st.doc && !st.draft) return;

    var tabs = el('div', 'tabs');
    var pane = el('pre', 'out');
    var views = [];
    if (st.doc) views.push(['product-pulse-doc.md', st.doc]);
    if (st.docEntry) views.push(['doc-entry.json', JSON.stringify(st.docEntry, null, 2)]);
    if (st.draft) views.push(['email-draft.txt', st.draft]);
    views.push(['mcp-audit.log', st.audit.map(function (a) { return JSON.stringify(a); }).join('\n')]);

    views.forEach(function (v, i) {
      var b = el('button', i === 0 ? 'on' : '', v[0]);
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs.children, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        pane.textContent = v[1];
      });
      tabs.appendChild(b);
    });
    pane.textContent = views[0][1];
    $('mcpout').appendChild(tabs);
    $('mcpout').appendChild(pane);
  }

  approveBtn.addEventListener('click', function () {
    var who = approver.value.trim();
    $('mcpout').innerHTML = '';
    showResult('append_to_doc', window.MCP.callTool('append_to_doc',
      Object.assign({ approved: true, approved_by: who }, docArgs)));
    showResult('create_email_draft', window.MCP.callTool('create_email_draft',
      Object.assign({ approved: true, approved_by: who }, mailArgs)));
    renderOutputs();
    Array.prototype.forEach.call(document.querySelectorAll('.toolhead .pill'), function (p) {
      p.textContent = 'executed'; p.className = 'pill';
    });
    $('stepchips').lastChild.classList.add('done');
    approveBtn.disabled = true;
    ack.checked = false;
  });

  $('tryunapproved').addEventListener('click', function () {
    $('mcpout').innerHTML = '';
    showResult('append_to_doc (no approval flag)',
      window.MCP.callTool('append_to_doc', docArgs));
    showResult('create_email_draft (no approval flag)',
      window.MCP.callTool('create_email_draft', mailArgs));
    var note = el('div', 'callout');
    note.innerHTML = '<b>That is the gate working.</b> Both calls were rejected and nothing was written. ' +
      'The same rule is enforced by the stdio server in <code>mcp-server/server.mjs</code>.';
    $('mcpout').appendChild(note);
  });

  $('resetbtn').addEventListener('click', function () {
    window.MCP.reset();
    $('mcpout').innerHTML = '';
    ack.checked = false; approver.value = ''; refresh();
    Array.prototype.forEach.call(document.querySelectorAll('.toolhead .pill'), function (p) {
      p.textContent = 'pending'; p.className = 'pill blue';
    });
    $('stepchips').lastChild.classList.remove('done');
  });

  /* ---------------- footer ---------------- */
  $('foot').innerHTML =
    'Student case-study prototype for a product-management assignment. Not affiliated with, endorsed by, ' +
    'or an official product of Groww. Review text is public Google Play content, reproduced verbatim and ' +
    'quoted for analysis; reviewer names are not carried. Fee figures are read from Groww\'s own pricing ' +
    'and help pages on the date shown and change over time - confirm on the linked source before relying ' +
    'on them. No email is ever sent: the draft is written to disk only.';
})();
