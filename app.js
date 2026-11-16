/* ============================================================
   app.js - renders the page and drives the approval-gated calls.
   The analysis runs live on every load; nothing here is canned.
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
  /* Markers are stripped from the RAW line before escaping - escaping first
     turns "> " into "&gt; " and slicing it leaves a stray "t;". */
  function inline(raw) {
    return esc(raw)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      .replace(/_([^_]+)_/g, '<i>$1</i>');
  }
  function md(src) {
    var out = [], inUl = false, inOl = false;
    function close() {
      if (inUl) { out.push('</ul>'); inUl = false; }
      if (inOl) { out.push('</ol>'); inOl = false; }
    }
    src.split('\n').forEach(function (line) {
      var h = line.match(/^(#{1,3})\s+(.*)$/),
          u = line.match(/^-\s+(.*)$/),
          o = line.match(/^\d+\.\s+(.*)$/),
          q = line.match(/^>\s?(.*)$/);
      if (h) { close(); out.push('<h3>' + inline(h[2]) + '</h3>'); }
      else if (u) {
        if (inOl) { out.push('</ol>'); inOl = false; }
        if (!inUl) { out.push('<ul>'); inUl = true; }
        out.push('<li>' + inline(u[1]) + '</li>');
      } else if (o) {
        if (inUl) { out.push('</ul>'); inUl = false; }
        if (!inOl) { out.push('<ol>'); inOl = true; }
        out.push('<li>' + inline(o[1]) + '</li>');
      } else if (q) {
        close(); out.push('<p style="color:var(--ink2)">' + inline(q[1]) + '</p>');
      } else if (!line.trim()) { close(); }
      else { close(); out.push('<p>' + inline(line) + '</p>'); }
    });
    close();
    return out.join('');
  }

  /* ---------- hero stats ---------- */
  var m = A.meta;
  var weeks = Math.round((new Date(m.window_end) - new Date(m.window_start)) / 6048e5);
  [[m.total_reviews.toLocaleString(), 'reviews read'],
   [weeks + ' weeks', m.window_start + ' to ' + m.window_end],
   [A.themes.length + ' themes', 'top ' + A.top.length + ' shown below'],
   [A.feeIssue.count + ' reviews', 'name the same charge']
  ].forEach(function (s) {
    var d = el('div', 'stat');
    d.appendChild(el('div', 'v', s[0]));
    d.appendChild(el('div', 'k', s[1]));
    $('stats').appendChild(d);
  });

  /* ---------- themes ---------- */
  $('s1sub').textContent = A.analysed.toLocaleString() + ' detailed reviews grouped';
  var tbl = $('themetable');
  tbl.innerHTML = '<tr><th>Theme</th><th style="width:80px">Reviews</th>' +
                  '<th style="width:150px">Share of complaints</th><th style="width:110px">Unhappy</th></tr>';
  var max = A.themes[0].count;
  A.themes.forEach(function (t, i) {
    var tr = el('tr', i < 3 ? 'top' : '');
    tr.innerHTML =
      '<td>' + esc(t.name) + (i < 3 ? ' <span class="badge">Top ' + (i + 1) + '</span>' : '') + '</td>' +
      '<td>' + t.count + '</td>' +
      '<td><div class="pct"><div class="track"><i style="width:' +
        Math.round(100 * t.count / max) + '%"></i></div></div></td>' +
      '<td><span class="badge ' + (t.negRate >= 75 ? 'red' : 'grey') + '">' + t.negRate + '%</span></td>';
    tbl.appendChild(tr);
  });

  /* ---------- quotes ---------- */
  A.quotes.forEach(function (q) {
    var c = el('div', 'qc');
    c.appendChild(el('div', 'lbl', q.theme));
    c.appendChild(el('p', null, '"' + q.text + '"'));
    c.appendChild(el('div', 'by', q.rating + '-star | ' + q.date + ' | ' + q.upvotes + ' found this helpful'));
    $('quotes').appendChild(c);
  });

  /* ---------- the fee finding ---------- */
  var chargeTheme = A.themes.filter(function (x) { return x.name.indexOf('Charges') === 0; })[0];
  var p = el('div', 'panel');
  var pt = el('div', 'ptitle');
  pt.innerHTML = '<span class="badge amber">Fee confusion found</span> ' + esc(A.feeIssue.label);
  p.appendChild(pt);
  var pb = el('div', 'pbody');
  pb.innerHTML =
    '<p style="margin:0 0 12px;font-size:14px">Of ' + chargeTheme.count + ' reviews about charges, <b>' +
    A.feeIssue.count + '</b> name this one - ' + A.feeIssue.negative +
    ' of them from users who rated the app 1 or 2 stars. It beat every other charge by a wide margin:</p>' +
    '<table class="t">' + A.chargeKinds.slice(0, 4).map(function (k, i) {
      return '<tr><td>' + esc(k.label) + (i === 0 ? ' <span class="badge">Picked</span>' : '') +
             '</td><td style="width:90px">' + k.count + ' reviews</td></tr>';
    }).join('') + '</table>';
  p.appendChild(pb);
  $('feecallout').appendChild(p);

  /* ---------- documents ---------- */
  $('s2sub').textContent = pulse.words + ' words';
  $('pulsedoc').innerHTML = md(pulse.markdown);
  $('pulsewords').textContent = 'Kept under 250 words so it can be read in a stand-up.';

  $('s3sub').textContent = fee.bulletCount + ' points | ' + fee.sources.length + ' official sources';
  $('feedoc').innerHTML = md(fee.markdown);

  /* ---------- actions ---------- */
  var docArgs = {
    date: pulse.date,
    top_themes: A.top.map(function (t) { return t.name; }),
    weekly_pulse: pulse.markdown,
    identified_fee_issue: fee.title,
    explanation_bullets: fee.bullets,
    source_links: fee.sources.map(function (s) { return s.url; })
  };
  var subject = 'Weekly Product Pulse + Customer Clarification - ' + pulse.date;
  var body = pulse.markdown + '\n\n---\n\n## Reusable support snippet - ' + fee.title + '\n\n' +
    fee.bullets.map(function (b) { return '- ' + b; }).join('\n') + '\n\nSources:\n' +
    fee.sources.map(function (s) { return '- ' + s.label + ': ' + s.url; }).join('\n') +
    '\n\nLast checked: ' + fee.date + '\n';
  var mailArgs = { to: ['product-team@internal', 'support-leads@internal'], subject: subject, body: body };

  function clip(o) {
    var c = JSON.parse(JSON.stringify(o));
    if (c.weekly_pulse) c.weekly_pulse = c.weekly_pulse.slice(0, 140) + '... [' + c.weekly_pulse.length + ' chars]';
    if (c.body) c.body = c.body.slice(0, 140) + '... [' + c.body.length + ' chars]';
    return JSON.stringify(c, null, 2);
  }

  [{ tool: 'append_to_doc', icon: '☰', title: 'Log this week to the team doc',
     desc: 'Appends the update and the fee explanation as one dated entry.', args: docArgs },
   { tool: 'create_email_draft', icon: '✉', title: 'Draft the email to product + support',
     desc: 'Writes a draft only. It is never sent.', args: mailArgs }
  ].forEach(function (c) {
    var box = el('div', 'act');
    var head = el('div', 'acthead');
    head.appendChild(el('div', 'acticon', c.icon));
    head.appendChild(el('div', 'actname', c.title));
    head.appendChild(el('span', 'badge blue', 'Not run'));
    head.appendChild(el('div', 'actdesc', c.desc));
    box.appendChild(head);
    var det = document.createElement('details');
    det.appendChild(el('summary', null, 'See exactly what ' + c.tool + ' will write'));
    det.appendChild(el('pre', 'json', clip(c.args)));
    var ab = el('div', 'actbody');
    ab.appendChild(det);
    box.appendChild(ab);
    $('toolcalls').appendChild(box);
  });
  $('s4sub').textContent = '2 actions pending';

  /* ---------- gate ---------- */
  var ack = $('ack'), approver = $('approver'), approveBtn = $('approve');
  function refresh() { approveBtn.disabled = !(ack.checked && approver.value.trim().length >= 2); }
  ack.addEventListener('change', refresh);
  approver.addEventListener('input', refresh);

  function showResult(title, res) {
    var ok = res.isError !== true;
    var d = el('div', 'res ' + (ok ? 'ok' : 'err'));
    d.appendChild(el('div', 'ic', ok ? '✓' : '✕'));
    var t = el('div');
    t.appendChild(el('div', null, title));
    var sub = el('div', null, res.content[0].text);
    sub.style.cssText = 'color:var(--ink2);font-size:12.5px;margin-top:2px';
    t.appendChild(sub);
    d.appendChild(t);
    $('mcpout').appendChild(d);
  }

  function renderOutputs() {
    var st = window.MCP.getState();
    if (!st.doc && !st.draft) return;
    var tabs = el('div', 'tabs'), pane = el('pre', 'out'), views = [];
    if (st.doc) views.push(['Team doc', st.doc]);
    if (st.docEntry) views.push(['Logged entry (JSON)', JSON.stringify(st.docEntry, null, 2)]);
    if (st.draft) views.push(['Email draft', st.draft]);
    views.push(['Approval log', st.audit.map(function (a) { return JSON.stringify(a); }).join('\n')]);
    views.forEach(function (v, i) {
      var b = el('button', i === 0 ? 'on' : '', v[0]);
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(tabs.children, function (x) { x.classList.remove('on'); });
        b.classList.add('on'); pane.textContent = v[1];
      });
      tabs.appendChild(b);
    });
    pane.textContent = views[0][1];
    $('mcpout').appendChild(tabs);
    $('mcpout').appendChild(pane);
  }

  function setChips(text, cls) {
    Array.prototype.forEach.call(document.querySelectorAll('.acthead .badge'), function (b) {
      b.textContent = text; b.className = 'badge ' + cls;
    });
  }

  approveBtn.addEventListener('click', function () {
    var who = approver.value.trim();
    $('mcpout').innerHTML = '';
    showResult('Logged to the team doc', window.MCP.callTool('append_to_doc',
      Object.assign({ approved: true, approved_by: who }, docArgs)));
    showResult('Email draft created - not sent', window.MCP.callTool('create_email_draft',
      Object.assign({ approved: true, approved_by: who }, mailArgs)));
    renderOutputs();
    setChips('Done', '');
    approveBtn.disabled = true;
    ack.checked = false;
  });

  $('tryunapproved').addEventListener('click', function () {
    $('mcpout').innerHTML = '';
    showResult('Blocked - no approval', window.MCP.callTool('append_to_doc', docArgs));
    showResult('Blocked - no approval', window.MCP.callTool('create_email_draft', mailArgs));
    var n = el('div', 'res ok');
    n.appendChild(el('div', 'ic', 'i'));
    var t = el('div');
    t.innerHTML = '<b>That is the safety check working.</b> Both actions were refused and nothing was ' +
      'written. The same rule is enforced inside the MCP server, not just on this page.';
    n.appendChild(t);
    $('mcpout').appendChild(n);
  });

  $('resetbtn').addEventListener('click', function () {
    window.MCP.reset();
    $('mcpout').innerHTML = '';
    ack.checked = false; approver.value = ''; refresh();
    setChips('Not run', 'blue');
  });

  $('foot').innerHTML =
    'Student case study for a product-management assignment. <b>Not affiliated with or endorsed by Groww.</b> ' +
    'Reviews are public Google Play content, quoted verbatim; reviewer names are not used. Charge figures are ' +
    'taken from Groww\'s published pricing and help pages on the date shown and can change - check the linked ' +
    'source before relying on them. No email is ever sent.';
})();
