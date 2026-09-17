# Brand Research Workbench

A private research product for investigating how AI describes a brand and delivering traceable client findings.

## First client workflow

1. Create a study for one brand and define the decision you want the investigation to inform.
2. Add dated reference facts with exact source excerpts. A brand preference is not a verified fact.
3. Save realistic customer questions. Keep baseline questions separate from diagnostic experiments in study names/notes.
4. Collect real consumer observations (paste the answer, visible links, and session conditions; attach screenshots), import supported provider JSON, or connect a provider account for a direct API experiment.
5. Click an answer passage. Inspect the citation location or its broader block association. Review it against recorded facts, describe business significance, and record an action or follow-up test.
6. Compare responses with their conditions visible. Prepare the client report, inspect its contents, then download the standalone HTML file. Full originals and attachments can be downloaded separately from Evidence.

## Coverage and limits

Direct REST adapters: OpenAI Responses, Anthropic Messages, Google Gemini Interactions. They require the operator's provider credentials and compatible model access. No paid provider requests are made automatically. Live adapters have not yet been validated with real account keys in this project.

Manual consumer observations: ChatGPT, Claude, Google AI Mode, Google AI Overviews, Gemini, Perplexity, Microsoft Copilot, Grok, or another named product. These are manually recorded observations, not automated browser integrations. API tests are never labeled as consumer-app measurements.

Passage segmentation is a navigation aid; it does not assert that every sentence is one atomic claim. Exact OpenAI citation-position mapping currently requires valid offsets and ASCII answer text. Other or ambiguous citation formats remain explicitly at block scope. Native citation fields remain available. The app cannot expose hidden reasoning, private rankings, or complete rejected-source sets.

Claim reviews and recommendations are human-authored. Saving a review validates its passage anchor against the unchanged answer and snapshots the reference facts. Later reference edits cannot silently rewrite the evidence saved with that review. Older records without snapshots are labeled as current references in reports.

The client report includes exact answer text, indexed citations/events, conditions, findings, reference excerpts, hypotheses, and proposed actions. Inspect it before sending. The report is a standalone file, not a shared workspace or a scheduled monitoring service. Reports with no reviews explicitly identify that limitation.

## Data and operation

D1 stores studies, runs, review records, and attachment metadata. R2 retains original evidence and uploaded files with SHA-256 hashes. Every server operation enforces account ownership. Hosted authentication is supplied by Sites dispatch. API credentials remain in tab memory and travel only to the selected provider through the server; they are not persisted in the database or original request record.

Evidence uploads accept PNG, JPEG, PDF, text, and JSON up to 5 MB. Request bodies are bounded even without Content-Length. State and exports include the latest 500 runs. Original evidence files are downloaded individually to bound export memory.

The registered Site is private. Client delivery currently uses reviewed HTML reports and separately supplied evidence files. Broad client access, billing, automatic consumer collection, scheduling, causal experiments, and autonomous remediation are not implemented. Part B agent autonomy remains outside this release.

## Validation

Use the configured Sites build workflow. After building:

```sh
node --experimental-strip-types --test tests/providers.test.mjs tests/claims.test.mjs
node --test tests/workflow.test.mjs
node node_modules/typescript/bin/tsc --noEmit
```

The workflow test runs the built Worker with isolated ephemeral D1/R2 stores and synthetic dispatcher identities. It verifies persistence, exact text, evidence hashes, immutable reference snapshots, uploads, cross-account isolation, and cross-origin mutation rejection. It does not call a paid provider or bypass deployed authentication.

Provider contracts: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [Anthropic web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [Gemini Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview).
