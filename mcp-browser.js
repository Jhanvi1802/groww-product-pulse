/* ============================================================
   mcp-browser.js - in-page MCP host

   The prototype is a static page, so it cannot spawn the stdio
   server in mcp-server/server.mjs. This host mirrors that server
   exactly: same two tools, same input schemas, same approval
   rule, same audit trail - executed against in-memory documents
   instead of the filesystem.

   The rule both implementations share: a tools/call whose
   arguments lack `approved: true` is refused and writes nothing.
   ============================================================ */
(function (root) {
  'use strict';

  var TOOLS = [
    {
      name: 'append_to_doc',
      description: 'Append one weekly product-pulse entry to the internal notes document. ' +
                   'Requires explicit human approval.',
      inputSchema: {
        type: 'object',
        required: ['approved', 'date', 'top_themes', 'weekly_pulse',
                   'identified_fee_issue', 'explanation_bullets', 'source_links'],
        properties: {
          approved: { type: 'boolean' }, approved_by: { type: 'string' },
          date: { type: 'string' }, top_themes: { type: 'array' },
          weekly_pulse: { type: 'string' }, identified_fee_issue: { type: 'string' },
          explanation_bullets: { type: 'array' }, source_links: { type: 'array' }
        }
      }
    },
    {
      name: 'create_email_draft',
      description: 'Create an email DRAFT combining the weekly pulse and the fee explainer. ' +
                   'Never sends. Requires explicit human approval.',
      inputSchema: {
        type: 'object',
        required: ['approved', 'subject', 'body'],
        properties: {
          approved: { type: 'boolean' }, approved_by: { type: 'string' },
          to: { type: 'array' }, subject: { type: 'string' }, body: { type: 'string' }
        }
      }
    }
  ];

  var state = { doc: null, docEntry: null, draft: null, audit: [] };

  function log(event, detail) {
    state.audit.push(Object.assign({ at: new Date().toISOString(), event: event }, detail || {}));
  }

  function refuse(name) {
    log('rejected_unapproved', { tool: name });
    return {
      isError: true,
      content: [{ type: 'text',
        text: 'Refused: ' + name + ' was called without approval. Nothing was written. ' +
              'Re-issue with approved: true only after a human has reviewed the exact payload.' }]
    };
  }

  function appendToDoc(args) {
    if (args.approved !== true) return refuse('append_to_doc');
    var entry = {
      date: args.date,
      top_themes: args.top_themes,
      weekly_pulse: args.weekly_pulse,
      identified_fee_issue: args.identified_fee_issue,
      explanation_bullets: args.explanation_bullets,
      source_links: args.source_links
    };
    var block =
      '## Entry appended ' + new Date().toISOString().slice(0, 10) +
      ' (approved by ' + (args.approved_by || 'unnamed') + ')\n\n' +
      '**Week of:** ' + entry.date + '\n\n' +
      '**Top themes:** ' + (entry.top_themes || []).join(' | ') + '\n\n' +
      '**Identified fee issue:** ' + entry.identified_fee_issue + '\n\n' +
      entry.weekly_pulse + '\n\n' +
      '### Fee explainer\n' +
      (entry.explanation_bullets || []).map(function (b) { return '- ' + b; }).join('\n') + '\n\n' +
      '**Sources:**\n' + (entry.source_links || []).map(function (s) { return '- ' + s; }).join('\n') + '\n';

    state.doc = (state.doc ? state.doc + '\n\n---\n\n' : '# Groww - Weekly Product Pulse (internal notes)\n\n') + block;
    state.docEntry = entry;
    log('append_to_doc', { approved_by: args.approved_by, bytes: block.length });
    return { content: [{ type: 'text', text: 'Appended to product-pulse-doc.md (' + block.length + ' bytes). Structured entry written to doc-entry.json.' }] };
  }

  function createEmailDraft(args) {
    if (args.approved !== true) return refuse('create_email_draft');
    var to = (args.to && args.to.length) ? args.to.join(', ') : 'product-team@internal, support-leads@internal';
    var sep = new Array(65).join('=');
    state.draft =
      'STATUS: DRAFT - NOT SENT\n' +
      'Created: ' + new Date().toISOString() + '\n' +
      'Approved by: ' + (args.approved_by || 'unnamed') + '\n' +
      sep + '\n' +
      'To: ' + to + '\n' +
      'Subject: ' + args.subject + '\n' +
      sep + '\n\n' + args.body + '\n';
    log('create_email_draft', { approved_by: args.approved_by, subject: args.subject, sent: false });
    return { content: [{ type: 'text', text: 'Draft written to email-draft.txt (' + state.draft.length + ' bytes). Not sent.' }] };
  }

  var IMPL = { append_to_doc: appendToDoc, create_email_draft: createEmailDraft };

  function listTools() { return TOOLS; }
  function callTool(name, args) {
    var fn = IMPL[name];
    if (!fn) return { isError: true, content: [{ type: 'text', text: 'Unknown tool: ' + name }] };
    return fn(args || {});
  }
  function getState() { return state; }
  function reset() { state = { doc: null, docEntry: null, draft: null, audit: [] }; }

  var API = { listTools: listTools, callTool: callTool, getState: getState, reset: reset, TOOLS: TOOLS };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.MCP = API;
})(typeof window !== 'undefined' ? window : globalThis);
