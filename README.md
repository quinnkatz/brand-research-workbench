# Brand Research Workbench

A private product for investigating how AI describes a brand and delivering traceable client findings. See [BUILD_STATUS.md](BUILD_STATUS.md) for verified scope, unfinished capabilities and launch gates.

## Workflow

1. Set up a brand, audience, positioning and competitors; review the suggested customer questions.
2. Add dated reference facts. Brand preferences are not automatically facts.
3. Create a repeatable collection plan across connected provider accounts, import original provider JSON, or manually record an actual consumer-app observation with its conditions and screenshots.
4. Review the scoped brand portrait. Click measurements to inspect their exact answer set.
5. Open a passage to inspect citation locations, disclosed searches, native fields and preserved originals. Capture source excerpts and distinguish capture date from the model's observation date.
6. Analyze selected answers for themes and tentative findings. The analysis validates exact quotations, while interpretations remain subject to human assessment.
7. Review claims against fact snapshots, record business significance and create actions with verification criteria.
8. Compare answers and prepare a method-separated client report. Download it or create an expiring, revocable report link for an authorized site visitor. Reader questions can refer to individual findings.

## Coverage

Direct adapters: OpenAI Responses, Anthropic Messages, Google Gemini Interactions. Live accounts and compatible models are required; these have not yet been validated against real credentials in this project.

Manual consumer observations: ChatGPT, Claude, Google AI Mode, Google AI Overviews, Gemini, Perplexity, Microsoft Copilot, Grok and another named product. This is not automatic consumer-app capture. API experiments are not represented as consumer-app results.

Keys remain in tab memory and are not persisted. No paid provider requests start without an explicit operator action. Planned collections require the collection page to remain open; the queue and progress survive interruption but there is no unattended scheduler yet.

## Evidence model

D1 stores studies, runs, research records, record history, durable collection items, report metadata and reader questions. R2 retains originals, attachments and report snapshots. Account ownership is checked on private operations. Shared reports require an unexpired bearer token and the surrounding site's access policy.

Citations show attribution, not proof of factual support or causal influence. The app cannot expose hidden chain of thought, source-selection rankings or a complete rejected-source set. Passage segmentation is a navigation aid, not a claim of atomic semantic segmentation. Ambiguous citation positions remain at block scope with original native metadata available.

Presence uses explicit names/aliases and excludes failed, partial or empty answers. Tracked share uses only configured brands. The selected sample is not all consumer traffic. Fact review snapshots, historical edits and report versions preserve earlier context.

## Validation

After the configured Sites production build:

```sh
node node_modules/typescript/bin/tsc --noEmit
node --experimental-strip-types --test tests/providers.test.mjs tests/claims.test.mjs tests/analytics.test.mjs tests/workflow.test.mjs tests/research-workflow.test.mjs
```

Tests use isolated ephemeral D1/R2 storage, synthetic dispatcher identities and a mocked provider transport. No authentication bypass is added to the app, and tests make no paid requests.

Provider contracts: [OpenAI web search](https://developers.openai.com/api/docs/guides/tools-web-search), [Anthropic web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool), [Gemini Interactions](https://ai.google.dev/gemini-api/docs/interactions-overview).
