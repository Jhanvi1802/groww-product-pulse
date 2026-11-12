# Product Pulse Workflow - Groww

An AI workflow that turns raw app-store reviews into two things a real team
would actually use: a **weekly internal product pulse** and a **reusable
customer explanation** for whichever fee users are most confused by. Both are
then logged through **approval-gated MCP tool calls** - nothing is written or
drafted until a human approves the exact payload.

**Live prototype:** _(see submission form)_
**Product:** Groww | **Corpus:** 12,300 public Google Play reviews, 16 Aug - 8 Nov 2026

---

## Contents

1. [What fee issue was identified](#1-what-fee-issue-was-identified-from-reviews)
2. [How to run](#2-how-to-run)
3. [Where MCP approval happens](#3-where-mcp-approval-happens)
4. [How the workflow works](#4-how-the-workflow-works)
5. [The data, and how it was collected](#5-the-data-and-how-it-was-collected)
6. [Deliverables map](#6-deliverables-map)
7. [Source list](#7-source-list)
8. [Known limits](#8-known-limits)

---

## 1. What fee issue was identified from reviews

**Brokerage on an equity order.**

This was derived from the corpus, not chosen in advance. Within the
"Charges & fee transparency" theme (189 substantive reviews), the specific
charges users name break down as:

| Charge named | Reviews | 1-2 star |
|---|---|---|
| **Brokerage on equity orders** | **71** | **43** |
| Account maintenance (AMC) | 10 | 6 |
| DP / demat sell charge | 5 | 5 |
| Intraday auto square-off | 5 | 5 |
| GST / STT / stamp duty | 4 | 4 |
| Mutual fund expense ratio | 3 | 3 |

Reading the actual review text, the confusion is specific and repeatable:

- users read "₹20" as a **flat fee** rather than *the lower of ₹20 or 0.1%, per order*
- they do not expect brokerage **per executed order**, so an active day compounds
- several explicitly believe **delivery buys are free**, comparing against brokers
  who charge zero delivery brokerage - *"there is no brokerage on buy of shares
  groww is charging on buy of shares also"*
- the gap between order value and portfolio value is read as concealment -
  *"Too many hidden charges"*, *"they deduct small amounts... hoping people won't notice"*

So the explainer does not describe brokerage in the abstract. It addresses the
four misreadings above, in that order, and separates **brokerage** from the
**statutory bundle** (STT, stamp duty, exchange, SEBI, GST, DP on sell) that
users currently experience as one unexplained number.

---

## 2. How to run

No build step and no dependencies.

**The prototype (steps 1-4, including the approval gate):**

```bash
git clone <this-repo>
cd groww-pulse
python -m http.server 8000      # then open http://localhost:8000
```

It must be served over HTTP rather than opened as a file, because the page
loads `data/corpus.js` as a script.

**The real MCP server, driven end to end:**

```bash
node mcp-server/test-client.mjs
```

This spawns `mcp-server/server.mjs` as a child process, speaks JSON-RPC to it
over stdio, and runs 27 checks - including that an **unapproved call writes
nothing**. It regenerates every artefact in `outputs/`.

**Run the server by itself** (for example to attach it to an MCP-capable client):

```bash
node mcp-server/server.mjs      # JSON-RPC 2.0 over stdio
```

### Files

| Path | What it is |
|---|---|
| `index.html`, `app.js` | the prototype UI, four workflow steps |
| `pipeline.js` | Step 1 - clustering, theme ranking, quote selection, fee detection |
| `generators.js` | Steps 2 and 3 - the pulse and the fee explainer |
| `mcp-browser.js` | in-page MCP host, mirrors the stdio server exactly |
| `mcp-server/server.mjs` | **real MCP server**, JSON-RPC over stdio, zero dependencies |
| `mcp-server/test-client.mjs` | drives the server, 27 checks, writes `outputs/` |
| `data/reviews.csv` | 12,300 public reviews, the full corpus |
| `data/corpus.js` | the 1,581 substantive reviews the page analyses live |
| `outputs/` | the appended doc, the structured entry, the email draft, the audit log |
| `sources.csv` | the 6 official URLs |

---

## 3. Where MCP approval happens

Approval is enforced in **two independent places**, and both refuse by default.

### In the prototype - Step 4

Both tool calls are rendered with their **full JSON payload** before anything
runs. The Approve button stays disabled until you have:

1. ticked *"I have reviewed both payloads"*, and
2. entered a name, which is recorded in the audit log

There is also a **"Try without approval"** button. It issues both calls with
the `approved` flag missing. Both are refused, nothing is written, and the
rejections appear in the audit log. The gate is demonstrable, not asserted.

### In the MCP server - `mcp-server/server.mjs`

The server does not trust its caller. Every tool begins with:

```js
function requireApproval(name, args) {
  if (args?.approved !== true) {
    audit('rejected_unapproved', { tool: name });
    return { isError: true, content: [{ type: 'text',
      text: `Refused: ${name} was called without approval. Nothing was written.` }] };
  }
  return null;
}
```

`approved: true` is in the `required` array of both input schemas, so the
requirement is visible to any MCP client through `tools/list`. A tool that can
be called without approval is not gated, it is merely polite - so the UI
collects the approval and the server enforces it.

### The two tools

| Tool | Does | Never does |
|---|---|---|
| `append_to_doc` | appends the weekly entry to `outputs/product-pulse-doc.md` and writes `outputs/doc-entry.json` with the six fields the brief specifies | - |
| `create_email_draft` | writes `outputs/email-draft.txt`, headed `STATUS: DRAFT - NOT SENT` | **sends email** |

Every call, approved or refused, is appended to `outputs/mcp-audit.log` with a
timestamp and the approver's name.

---

## 4. How the workflow works

```
data/corpus.js  (1,581 substantive reviews, from 12,300)
      |
  Step 1  pipeline.js
      |     cluster into <= 5 themes     -> rank -> take top 3
      |     pick 3 verbatim quotes       -> one per top theme, negative, most upvoted
      |     count named charges          -> the leading fee confusion
      |
  Step 2  generators.js  weekly pulse, <= 250 words
  Step 3  generators.js  fee explainer, <= 6 bullets, 2 official links, "Last checked"
      |
  Step 4  approval gate  <-- a human approves the exact payloads here
      |
      +-- append_to_doc        -> product-pulse-doc.md + doc-entry.json
      +-- create_email_draft   -> email-draft.txt   (never sent)
```

### Clustering

Five themes, each defined by word-boundary regular expressions. Each review is
assigned to the theme matching the **most** patterns, and the matched patterns
are kept on the record so any count can be traced back to the reviews behind it.

Word boundaries matter here. An earlier substring version matched `"fee"` inside
**"feedback"**, which pulled order-failure reviews into the charges theme and
changed the ranking. The patterns are anchored for that reason.

### Theme ranking (current corpus)

| # | Theme | Reviews | 1-2 star |
|---|---|---|---|
| 1 | App reliability & order execution | 216 | 64% |
| 2 | Charges & fee transparency | 189 | 68% |
| 3 | Support unresponsive | 177 | 83% |
| 4 | Money movement delays | 50 | 58% |
| 5 | Account opening & KYC | 34 | 74% |

The pulse's key observation leans on the third column rather than the second:
*support* is only the third-largest theme but has by far the worst negative
rate, which volume alone would hide.

---

## 5. The data, and how it was collected

- **Source:** public Google Play reviews for Groww, package `com.nextbillion.groww`
- **Collected:** 9 Nov 2026, paging the newest-first review feed to the 12-week boundary
- **Window:** 16 Aug 2026 - 8 Nov 2026, exactly **12.0 weeks** (the brief asks for 8-12)
- **Volume:** 12,300 reviews, de-duplicated by review id
- **Rating mix:** 1★ 1,307 | 2★ 196 | 3★ 331 | 4★ 1,004 | 5★ 9,462

**Why only 1,581 are analysed.** The median review is **9 characters** long -
overwhelmingly "Good", "Nice", "Best app". Reviews under 60 characters cannot
carry a theme, so the analysis runs on the 1,581 substantive ones. The full
12,300 remain in `data/reviews.csv` so the filter can be checked or changed.

**Reviewer names are not carried.** The reviews are public, but a name adds
nothing to the analysis. Each row keeps a stable pseudonymous `author_ref` so
rows stay traceable without carrying an identity. Quotes are attributed by
date, rating and review id.

Quotes are reproduced **verbatim**, including spelling and grammar as written.
Nothing in this repository is a synthesised or illustrative review.

---

## 6. Deliverables map

| Asked for | Where it is |
|---|---|
| Working prototype link | GitHub Pages, see the submission form |
| Weekly product pulse (MD) | [`outputs/weekly-pulse.md`](outputs/weekly-pulse.md) |
| Notes/Doc snippet showing appended entry | [`outputs/product-pulse-doc.md`](outputs/product-pulse-doc.md) and [`outputs/doc-entry.json`](outputs/doc-entry.json) |
| Email draft text | [`outputs/email-draft.txt`](outputs/email-draft.txt) |
| Reviews CSV sample | [`data/reviews.csv`](data/reviews.csv) |
| Source list (4-6 URLs) | [`sources.csv`](sources.csv) - 6 URLs, all verified live |
| README: how to run | [section 2](#2-how-to-run) |
| README: where MCP approval happens | [section 3](#3-where-mcp-approval-happens) |
| README: what fee issue was identified | [section 1](#1-what-fee-issue-was-identified-from-reviews) |

Also included, beyond the brief: a **real MCP server** rather than only a
simulated approval step, and `outputs/mcp-audit.log` recording every approved
write and every refusal.

---

## 7. Source list

Six official pages. No blogs, no aggregators. All returned HTTP 200 on 9 Nov 2026.
Machine-readable copy with per-source notes: [`sources.csv`](sources.csv).

| # | Publisher | Page | URL |
|---|---|---|---|
| S1 | Groww | Pricing and charges | https://groww.in/pricing |
| S2 | Groww | Why is my brokerage more than 20 rupees? | https://groww.in/help/payments-&-withdrawals/payments-charges/why-is-my-brokerage-more-than-20-rupees--71 |
| S3 | Groww | What is the charge for buy order (delivery)? | https://groww.in/help/stocks,-f&o,-ipo-&-mtf/sx-pricing/what-is-the-charge-for-buy-order-delivery |
| S4 | Groww | What fees does Groww charge? | https://groww.in/help/payments-&-withdrawals/payments-charges/what-fees-does-groww-charge--58 |
| S5 | NSE | SEBI Turnover Fees, STT and Other Levies | https://www.nseindia.com/static/invest/first-time-investor-sebi-turnover-fees-stt-other-levies |
| S6 | NSE | Stamp Duty charges and taxes | https://www.nseindia.com/static/invest/first-time-investor-stamp-duty-charges-taxes |

S2 and S3 are not generic pricing pages. They are the two help articles that
answer the exact misreadings the reviews contain, which is why the explainer
cites them rather than the pricing table alone.

---

## 8. Known limits

1. **Fee figures are a snapshot.** Read from Groww's own pages on 9 Nov 2026 and
   baked into `generators.js`. Charges change. Every output carries
   *"Last checked"* and links the source; the app does not re-fetch.

2. **Clustering is lexical, not semantic.** Five hand-built pattern sets, which
   is interpretable and auditable but will miss paraphrases. 915 of 1,581
   substantive reviews match no theme and are counted as unassigned rather than
   forced into one.

3. **A review can touch several themes.** Each is assigned to its strongest
   match only, so the theme counts do not sum to the number of reviews.

4. **Rating is a proxy for sentiment.** 1-2 star is treated as negative. No
   sentiment model is used, so sarcasm and mixed reviews are not detected.

5. **Play Store reviews are a biased sample.** They skew to the delighted and
   the furious - 77% are 5★ and 11% are 1★, with little in between. These are
   signals to investigate, not a measure of the user base.

6. **One platform.** Android only. iOS reviews may differ.

7. **The browser host is not the stdio server.** A static page cannot spawn a
   process, so `mcp-browser.js` reimplements the same two tools, schemas and
   approval rule in-page. The real server is `mcp-server/server.mjs`, and
   `test-client.mjs` proves it over actual stdio.

---

**Disclaimer.** Student case-study prototype for a product-management
assignment. Not affiliated with, endorsed by, or an official product of Groww.
Review text is public Google Play content quoted for analysis. Fee figures come
from Groww's published pages on the date shown and change over time - confirm on
the linked source before relying on them. No email is ever sent.
