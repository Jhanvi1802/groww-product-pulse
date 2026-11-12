#!/usr/bin/env node
/* ============================================================
   MCP server - Groww Product Pulse
   JSON-RPC 2.0 over stdio. No dependencies.

   Exposes two tools, both of which WRITE, and neither of which
   sends anything outward:

     append_to_doc        append the weekly entry to a notes doc
     create_email_draft   write an email draft to disk (never sends)

   Approval gating: this server will refuse any call whose
   arguments do not carry an explicit `approved: true`, and it
   records who approved and when. The host UI collects that
   approval; the server enforces it. A tool that can be called
   without approval is not gated, it is merely polite.

   Run directly:   node mcp-server/server.mjs
   Drive it with:  node mcp-server/test-client.mjs
   ============================================================ */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'outputs');
fs.mkdirSync(OUT, { recursive: true });

const DOC = path.join(OUT, 'product-pulse-doc.md');
const DOC_JSON = path.join(OUT, 'doc-entry.json');
const EMAIL = path.join(OUT, 'email-draft.txt');
const AUDIT = path.join(OUT, 'mcp-audit.log');

const SERVER_INFO = { name: 'groww-product-pulse', version: '1.0.0' };
const DEFAULT_PROTOCOL = '2024-11-05';

function audit(event, detail) {
  const line = JSON.stringify({ at: new Date().toISOString(), event, ...detail }) + '\n';
  fs.appendFileSync(AUDIT, line, 'utf8');
}

/* ---------------- tool definitions ---------------- */
const TOOLS = [
  {
    name: 'append_to_doc',
    description:
      'Append one weekly product-pulse entry to the internal notes document. ' +
      'Requires explicit human approval: the call is rejected unless approved is true.',
    inputSchema: {
      type: 'object',
      required: ['approved', 'date', 'top_themes', 'weekly_pulse',
                 'identified_fee_issue', 'explanation_bullets', 'source_links'],
      properties: {
        approved: { type: 'boolean', description: 'Must be true. Set only after a human approves.' },
        approved_by: { type: 'string', description: 'Who approved it.' },
        date: { type: 'string', description: 'Week of, e.g. "9 Nov 2026".' },
        top_themes: { type: 'array', items: { type: 'string' }, description: 'Top 3 themes.' },
        weekly_pulse: { type: 'string', description: 'The <=250 word pulse, markdown.' },
        identified_fee_issue: { type: 'string', description: 'The fee/charge users are confused by.' },
        explanation_bullets: { type: 'array', items: { type: 'string' }, description: '<=6 bullets.' },
        source_links: { type: 'array', items: { type: 'string' }, description: 'Official source URLs.' }
      }
    }
  },
  {
    name: 'create_email_draft',
    description:
      'Create an email DRAFT on disk combining the weekly pulse and the fee explainer. ' +
      'Never sends. Requires explicit human approval.',
    inputSchema: {
      type: 'object',
      required: ['approved', 'subject', 'body'],
      properties: {
        approved: { type: 'boolean', description: 'Must be true.' },
        approved_by: { type: 'string' },
        to: { type: 'array', items: { type: 'string' }, description: 'Intended recipients. Not contacted.' },
        subject: { type: 'string' },
        body: { type: 'string' }
      }
    }
  }
];

/* ---------------- tool implementations ---------------- */
function requireApproval(name, args) {
  if (args?.approved !== true) {
    audit('rejected_unapproved', { tool: name });
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `Refused: ${name} was called without approval. ` +
              `Nothing was written. Re-issue the call with approved: true ` +
              `only after a human has reviewed the exact payload.`
      }]
    };
  }
  return null;
}

function appendToDoc(args) {
  const blocked = requireApproval('append_to_doc', args);
  if (blocked) return blocked;

  const entry = {
    date: args.date,
    top_themes: args.top_themes,
    weekly_pulse: args.weekly_pulse,
    identified_fee_issue: args.identified_fee_issue,
    explanation_bullets: args.explanation_bullets,
    source_links: args.source_links
  };

  const header = `\n\n---\n\n## Entry appended ${new Date().toISOString().slice(0, 10)}` +
                 ` (approved by ${args.approved_by || 'unnamed'})\n\n`;
  const block =
    `**Week of:** ${entry.date}\n\n` +
    `**Top themes:** ${(entry.top_themes || []).join(' | ')}\n\n` +
    `**Identified fee issue:** ${entry.identified_fee_issue}\n\n` +
    `${entry.weekly_pulse}\n\n` +
    `### Fee explainer\n` +
    (entry.explanation_bullets || []).map(b => `- ${b}`).join('\n') + '\n\n' +
    `**Sources:**\n` + (entry.source_links || []).map(s => `- ${s}`).join('\n') + '\n';

  if (!fs.existsSync(DOC)) {
    fs.writeFileSync(DOC, '# Groww - Weekly Product Pulse (internal notes)\n', 'utf8');
  }
  fs.appendFileSync(DOC, header + block, 'utf8');
  fs.writeFileSync(DOC_JSON, JSON.stringify(entry, null, 2), 'utf8');
  audit('append_to_doc', { approved_by: args.approved_by, bytes: block.length });

  return {
    content: [{
      type: 'text',
      text: `Appended to ${path.basename(DOC)} (${block.length} bytes). ` +
            `Structured entry written to ${path.basename(DOC_JSON)}.`
    }]
  };
}

function createEmailDraft(args) {
  const blocked = requireApproval('create_email_draft', args);
  if (blocked) return blocked;

  const to = (args.to && args.to.length) ? args.to.join(', ') : 'product-team@internal, support-leads@internal';
  const draft =
    `STATUS: DRAFT - NOT SENT\n` +
    `Created: ${new Date().toISOString()}\n` +
    `Approved by: ${args.approved_by || 'unnamed'}\n` +
    `${'='.repeat(64)}\n` +
    `To: ${to}\n` +
    `Subject: ${args.subject}\n` +
    `${'='.repeat(64)}\n\n` +
    `${args.body}\n`;

  fs.writeFileSync(EMAIL, draft, 'utf8');
  audit('create_email_draft', { approved_by: args.approved_by, subject: args.subject, sent: false });

  return {
    content: [{
      type: 'text',
      text: `Draft written to ${path.basename(EMAIL)} (${draft.length} bytes). Not sent.`
    }]
  };
}

const IMPL = { append_to_doc: appendToDoc, create_email_draft: createEmailDraft };

/* ---------------- JSON-RPC plumbing ---------------- */
function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}
function fail(id, code, message) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n');
}

function handle(msg) {
  const { id, method, params } = msg;

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: params?.protocolVersion || DEFAULT_PROTOCOL,
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO
    });
  }
  if (method === 'notifications/initialized' || method === 'initialized') return;
  if (method === 'ping') return reply(id, {});
  if (method === 'tools/list') return reply(id, { tools: TOOLS });

  if (method === 'tools/call') {
    const name = params?.name;
    const fn = IMPL[name];
    if (!fn) return fail(id, -32602, `Unknown tool: ${name}`);
    try {
      return reply(id, fn(params.arguments || {}));
    } catch (e) {
      return reply(id, { isError: true, content: [{ type: 'text', text: `Tool threw: ${e.message}` }] });
    }
  }
  if (id !== undefined) fail(id, -32601, `Method not found: ${method}`);
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, nl).trim();
    buf = buf.slice(nl + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); }
    catch { continue; }
    handle(msg);
  }
});
process.stdin.on('end', () => process.exit(0));
