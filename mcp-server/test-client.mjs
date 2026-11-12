#!/usr/bin/env node
/* ============================================================
   MCP test client

   Spawns server.mjs over real stdio, speaks JSON-RPC to it, and
   proves two things:

     1. the server implements initialize / tools/list / tools/call
     2. approval gating actually bites - an unapproved call writes
        nothing and returns an error

   It also produces the submitted artefacts in outputs/:
     product-pulse-doc.md, doc-entry.json, email-draft.txt, mcp-audit.log

   Run from the project root:  node mcp-server/test-client.mjs
   ============================================================ */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const require = createRequire(import.meta.url);

const Pipeline = require(path.join(ROOT, 'pipeline.js'));
const Generators = require(path.join(ROOT, 'generators.js'));

const OUT = path.join(ROOT, 'outputs');
fs.mkdirSync(OUT, { recursive: true });
for (const f of ['product-pulse-doc.md', 'doc-entry.json', 'email-draft.txt', 'mcp-audit.log']) {
  const p = path.join(OUT, f);
  if (fs.existsSync(p)) fs.unlinkSync(p);          // fresh run
}

const srv = spawn(process.execPath, [path.join(HERE, 'server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });

let nextId = 1;
const pending = new Map();
let buf = '';

srv.stdout.setEncoding('utf8');
srv.stdout.on('data', chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    const msg = JSON.parse(line);
    const r = pending.get(msg.id);
    if (r) { pending.delete(msg.id); r(msg); }
  }
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise(res => {
    pending.set(id, res);
    srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
function notify(method, params) {
  srv.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n');
}

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ok    ' + label + (extra ? '  - ' + extra : '')); }
  else { fail++; console.log('  FAIL  ' + label + (extra ? '  - ' + extra : '')); }
}

const run = async () => {
  // --- handshake ---
  const init = await rpc('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'pulse-test-client', version: '1.0.0' }
  });
  ok('initialize handshake', !!init.result?.serverInfo, init.result?.serverInfo?.name);
  ok('protocol version echoed', init.result?.protocolVersion === '2024-11-05', init.result?.protocolVersion);
  notify('notifications/initialized', {});

  // --- discovery ---
  const list = await rpc('tools/list', {});
  const names = (list.result?.tools || []).map(t => t.name).sort();
  ok('tools/list returns both tools', names.join(',') === 'append_to_doc,create_email_draft', names.join(','));
  const schema = list.result.tools.find(t => t.name === 'append_to_doc').inputSchema;
  ok('append_to_doc schema requires approval', (schema.required || []).includes('approved'));
  ok('schema carries the brief\'s six fields',
     ['date','top_themes','weekly_pulse','identified_fee_issue','explanation_bullets','source_links']
       .every(k => k in schema.properties));

  // --- the real analysis ---
  const a = Pipeline.run();
  const pulse = Generators.weeklyPulse(a);
  const fee = Generators.feeExplainer(a);
  ok('pulse within 250 words', pulse.words <= 250, pulse.words + ' words');
  ok('explainer within 6 bullets', fee.bulletCount <= 6, fee.bulletCount + ' bullets');
  ok('explainer has exactly 2 sources', fee.sources.length === 2);
  ok('explainer stamped "Last checked"', /Last checked:/.test(fee.markdown));

  // standalone artefacts the brief asks for as their own deliverables
  fs.writeFileSync(path.join(OUT, 'weekly-pulse.md'), pulse.markdown, 'utf8');
  fs.writeFileSync(path.join(OUT, 'fee-explainer.md'), fee.markdown, 'utf8');
  ok('weekly-pulse.md written', fs.existsSync(path.join(OUT, 'weekly-pulse.md')));
  ok('fee-explainer.md written', fs.existsSync(path.join(OUT, 'fee-explainer.md')));

  const docArgs = {
    date: pulse.date,
    top_themes: a.top.map(t => t.name),
    weekly_pulse: pulse.markdown,
    identified_fee_issue: fee.title,
    explanation_bullets: fee.bullets,
    source_links: fee.sources.map(s => s.url)
  };

  // --- gate test 1: NO approval ---
  const denied = await rpc('tools/call', { name: 'append_to_doc', arguments: docArgs });
  ok('unapproved append is REFUSED', denied.result?.isError === true,
     (denied.result?.content?.[0]?.text || '').slice(0, 60));
  ok('nothing written while unapproved', !fs.existsSync(path.join(OUT, 'doc-entry.json')));

  // --- gate test 2: approved ---
  const okDoc = await rpc('tools/call', {
    name: 'append_to_doc',
    arguments: { ...docArgs, approved: true, approved_by: 'Jhanvi Chaturvedi (PM)' }
  });
  ok('approved append succeeds', okDoc.result?.isError !== true,
     (okDoc.result?.content?.[0]?.text || '').slice(0, 56));
  ok('doc file created', fs.existsSync(path.join(OUT, 'product-pulse-doc.md')));
  ok('structured entry created', fs.existsSync(path.join(OUT, 'doc-entry.json')));

  const entry = JSON.parse(fs.readFileSync(path.join(OUT, 'doc-entry.json'), 'utf8'));
  ok('entry has all six keys',
     ['date','top_themes','weekly_pulse','identified_fee_issue','explanation_bullets','source_links']
       .every(k => k in entry));

  // --- email draft ---
  const subject = `Weekly Product Pulse + Customer Clarification - ${pulse.date}`;
  const body =
    pulse.markdown + '\n\n' +
    '---\n\n' +
    '## Reusable support snippet - ' + fee.title + '\n\n' +
    fee.bullets.map(b => '- ' + b).join('\n') + '\n\n' +
    'Sources:\n' + fee.sources.map(s => '- ' + s.label + ': ' + s.url).join('\n') + '\n\n' +
    'Last checked: ' + fee.date + '\n';

  const deniedMail = await rpc('tools/call', {
    name: 'create_email_draft', arguments: { subject, body }
  });
  ok('unapproved email draft is REFUSED', deniedMail.result?.isError === true);
  ok('no draft written while unapproved', !fs.existsSync(path.join(OUT, 'email-draft.txt')));

  const okMail = await rpc('tools/call', {
    name: 'create_email_draft',
    arguments: {
      approved: true, approved_by: 'Jhanvi Chaturvedi (PM)',
      to: ['product-team@internal', 'support-leads@internal'],
      subject, body
    }
  });
  ok('approved email draft succeeds', okMail.result?.isError !== true);
  const draft = fs.readFileSync(path.join(OUT, 'email-draft.txt'), 'utf8');
  ok('draft is marked NOT SENT', /STATUS: DRAFT - NOT SENT/.test(draft));
  ok('draft subject matches the brief\'s format',
     /^Subject: Weekly Product Pulse \+ Customer Clarification - /m.test(draft));
  ok('draft carries the pulse', draft.includes('Top themes'));
  ok('draft carries the fee snippet', draft.includes('Reusable support snippet'));

  // --- audit trail ---
  const audit = fs.readFileSync(path.join(OUT, 'mcp-audit.log'), 'utf8').trim().split('\n').map(JSON.parse);
  ok('audit logged 2 rejections', audit.filter(a => a.event === 'rejected_unapproved').length === 2);
  ok('audit logged 2 approved writes',
     audit.filter(a => a.event === 'append_to_doc' || a.event === 'create_email_draft').length === 2);
  ok('audit records who approved', audit.some(a => a.approved_by === 'Jhanvi Chaturvedi (PM)'));

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  srv.stdin.end();
  process.exit(fail === 0 ? 0 : 1);
};

run().catch(e => { console.error(e); process.exit(1); });
