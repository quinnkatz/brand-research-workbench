# Brand Research Workbench

A client research application for investigating how AI describes brands. It combines repeatable collection, inspectable original evidence, brand and competitor measurement, reviewed interpretation, and client delivery.

## Client journey

1. Set up a brand, audience, market, language, positioning and competitors. Review the starter questions; they are scenarios, not search-demand estimates.
2. Add dated facts and product/SKU/offer identities. Facts and questions can preserve a particular product version.
3. Save encrypted provider connections and authorize a request allowance per brand. Plan exact questions across providers and repetitions, import original responses, or capture what an actual consumer app displayed.
4. Inspect presence, tracked share, source exposure and reviewed recommendation/sentiment labels. Open each contributing answer, save filters, and search the complete study. Server-side portrait metrics include older observations. Matched-period comparisons separate changed protocols.
5. Use the coverage board to define expected observations for each question and exact API/consumer/import surface. Assign consumer records explicitly; missing and failed observations remain gaps. Click an answer passage to see its native citations, disclosed search events, supporting reference snapshots and assessments. Copy its exact link, pin it for later, or challenge a reviewed finding directly from the passage panel.
6. Review narrative findings, ask an assistant about selected evidence, and draft content briefs. Unsupported exact quotations are rejected; interpretations and proposed actions require human review.
7. Agree on actions with criteria and follow-up evidence. Inspect public website readiness and import first-party traffic, Search Console and crawler exports.
8. Select and order findings/actions, write an executive summary, preview the chosen evidence and publish an immutable dated report. Source captures preserve original bytes and exact excerpts without claiming to reproduce what the model read. Invite editors/viewers, receive client challenges, and preserve the response and edit history.
9. Configure daily or weekly UTC monitoring through a saved QStash EU connection. Reports and source/mention change alerts appear in the app. Optional Resend batch summaries go only to explicitly selected, accepted workspace members after the owner enables delivery. Provider acceptance, failures, and uncertain outcomes are recorded; no public posting or independent outreach occurs.

## Collection coverage

- API adapters: OpenAI Responses, Anthropic Messages, Gemini Interactions, Perplexity Sonar, xAI Responses. Exact model IDs and account compatibility must be checked with real credentials.
- Consumer observations: ChatGPT, Claude, Gemini, Google AI Mode, AI Overviews, Perplexity, Copilot, Grok and other. The locally installed [Consumer Capture helper](capture-extension/README.md) preserves selected visible text/links; screenshots can be attached in the app. This is deliberate human collection, not autonomous consumer-app querying.
- Methods are never silently merged. Consumer observations and API experiments remain distinct cohorts. Hidden ranking, complete rejected-source sets, private reasoning and true source influence cannot be reconstructed from ordinary responses.

## Access, secrets and execution

Hosting and sign-in: see [docs/SELF_HOSTING.md](docs/SELF_HOSTING.md). In production, identity comes only from a verified Cloudflare Access token (email one-time code); locally a stand-in user is signed in. Each study has its own owner/editor/viewer permissions; email-bound invitations grant access to that study, not to the site's outer gate. An editor may use a connection authorized by the owner but cannot retrieve its secret.

Saved credentials use AES-GCM with a secret `VAULT_MASTER_KEY` and owner/connection/provider-bound authenticated data. The production master key is configured separately from source. Keys can also remain in tab memory. No provider credentials are sent to the delivery queue. Optional email requests carry only their configured message content and recipient addresses to Resend.

Request reservations are persistent and atomic. Provider execution is atomically claimed; replayed callbacks or repeated clicks do not repeat started work. Caps count logical requests conservatively, not dollars. Uncertain delivery is visible and can be replaced after review only while the provider request has never started. Interrupted provider requests are not retried automatically.

Unattended operation uses QStash's EU API, not an open browser or `waitUntil`. Activation checks whether the callback is externally reachable. The current owner-private gate blocks external callback delivery, so schedules remain inactive until access is configured. The app does not forward an authentication bypass. Activation requires a provider account, request allowance, queue account and reachable callback.

D1 stores studies, observations, jobs, roles, invitations, quotas, encrypted connections, schedules, drafts, histories, alerts and report metadata. R2 retains original responses, attachments, audit pages, import files, model-assistant originals and immutable report snapshots. There is no payment/subscription system or autonomous publishing.

## Evidence and measurement

Citation means attribution, not factual support or causal influence. Ambiguous citation coordinates remain at block scope. Presence is deterministic name/alias matching in completed non-empty answers; tracked share only concerns configured brands. Recommendation, sentiment and explicit ranks have exact evidence and human criteria. None of these samples represent all customers automatically.

A later source capture does not authenticate the page version used by a provider. Public website audits respect captured robots rules, permit only the configured public HTTPS hostname, validate DNS and redirects, and do not execute JavaScript. JSON-LD checks validate JSON syntax, not rich-result eligibility. Traffic imports preserve dates, mappings and rejected rows without automatically combining overlapping exports or claiming conversion attribution.

See [BUILD_STATUS.md](BUILD_STATUS.md) for verification, limits and activation requirements, and [the six-item acceptance ledger](docs/IMPLEMENTATION_LEDGER.md) for this release’s exact checks.

## Validation

After `pnpm build`:

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/*.test.mjs
```

Tests run with isolated D1/R2 databases, synthetic dispatcher identities and mocked provider/queue/email transports. A 522-observation fixture checks full-study search, metrics, comparison and export beyond the initial page. No authentication bypass is installed and no paid requests are made.

Provider contracts: [OpenAI](https://developers.openai.com/api/docs/guides/tools-web-search), [Anthropic](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [Gemini](https://ai.google.dev/gemini-api/docs/interactions-overview), [Perplexity](https://docs.perplexity.ai/api-reference/sonar-post), [xAI](https://docs.x.ai/developers/tools/web-search), [QStash](https://upstash.com/docs/qstash/api-reference/messages/publish-a-message).

## Search, comparisons and delivery

Full-text search uses SQLite FTS5 over question text, original answer text and disclosed URLs; all plain search terms must match by word prefix. Its index is maintained transactionally by insert/update/delete triggers, including legacy-record backfill. Tenant authorization is applied to every search, facet, aggregate and export request. Context filters use the saved question version, not a later edit to a question with the same wording.

The portrait aggregates complete response text on the server in bounded pages, returning short display summaries and exact contributing IDs. The loaded workspace subset still bounds deliberately selected narrative/assistant/report inputs. Cross-period comparison selects one latest eligible observation per exact recorded protocol in each period, including memory, model, question/context version and repetition. Unknown personalization remains unknown; matching does not imply causality or representative consumer sampling.

The default Export downloads a streamed NDJSON archive containing study metadata, all runs, records, record histories and attachment metadata with authenticated original-evidence links. Check its final `completion` record for counts. This is not a transactional snapshot of edits occurring during download. The older JSON API export remains explicitly capped at 500 for compatibility.

Email delivery uses an immutable outbox payload and one idempotency key per monitored batch. Accepted members are rechecked before sending. Provider acceptance is not proof of inbox delivery. Uncertain retries reuse exactly the same payload/key and are blocked after 23 hours, within Resend's documented 24-hour idempotency window. Revoked recipients or changed preferences cancel pending delivery.

Contracts checked for this increment: [D1 FTS5 support](https://developers.cloudflare.com/d1/sql-api/sql-statements/), [Resend batch delivery](https://resend.com/docs/api-reference/emails/send-batch-emails), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Completion discipline

[Project instructions](AGENTS.md) keep authorized work moving through fixes and deployment. [The completion workflow](workflow/COMPLETION.md) separates local software checks from real customer acceptance; `python3 scripts/completion_gate.py --check` must not report customer-ready while live dependencies remain unverified. The optional Stop hook is prepared for a compatible trusted Codex host; automatic activation in ChatGPT Work is not claimed.
