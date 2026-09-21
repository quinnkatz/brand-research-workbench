# Part A — implementation checkpoint

Updated 2026-09-21. This is the continuation of the original Brand Research Workbench, not a replacement project. Part B autonomous agent infrastructure and physical activations remain separate.

## Outcome of this release

A private brand research application with a connected workflow: brand setup → reusable questions → collection plan / observation → scoped brand portrait → source and passage inspection → narrative interpretation → human decisions → dated client report and questions.

### Implemented

- Guided brand setup with category, audience, intended positioning, aliases, competitor names, market/language brief, and editable starter questions. Templates are labelled as scenarios, not search-demand evidence.
- Persistent collection plans spanning the three existing API adapters. Exact questions, models, repetitions, search mode and output limits are captured before execution. Atomic job claiming prevents a completed or already-started item from being billed again by repeated execution clicks. Interrupted or uncertain requests require operator attention and are not retried automatically.
- Page-driven sequential execution with pause/resume and explicit limitations. The queue persists; the browser must remain on the collection page for further requests to start.
- Shared evidence filters across portrait, sources, narrative, comparisons, decisions and reports. Consumer observations, API experiments and imported responses stay visibly distinct. Failed, partial and empty answers do not become brand omissions.
- Name/alias presence, tracked share of voice, configured competitor comparisons, daily sample trends, source-domain counts and evidence health. Metrics open their underlying observations. These are sample measurements, not market-share estimates or recommendation-quality scores.
- AI-assisted narrative analysis of selected recorded answers, with provider/model labels and preserved input, request, original response text and hash. Exact quotes and run IDs are checked; unsupported evidence references are rejected. Interpretations remain explicitly awaiting human review.
- Source library with reverse links to observations and immutable, researcher-supplied, dated excerpt captures. A later excerpt capture is not presented as proof of what a model read.
- Existing sentence/passage inspection, native citations, disclosed search events, full originals, screenshot attachments, review anchors and fact snapshots retained.
- Historical versions of edited facts, questions, claim reviews and actions; stale writes are rejected by the new clients. Action lifecycle includes priorities, linked reviews, dates, verification criteria and follow-up observations.
- Downloadable HTML client reports now include method-separated brand/competitor measurements alongside human findings, references and full answer records.
- Immutable report-link versions with expiry, revocation and finding-specific reader questions. The link is a bearer credential within the site's access boundary. It does not change the site's audience. Reader-supplied names are explicitly unverified; no messages are sent automatically.
- Improved navigation, editorial brand portrait, clear empty states, a labelled fictional multi-provider example, scoped URLs, responsive layouts and on-demand loading of heavier views.

## What is not complete

- No real provider credentials are connected and no paid live calls were made. Provider request orchestration is tested against a synthetic transport; account/model/search compatibility still needs real validation.
- Broad consumer-product coverage currently means manual observations with conditions/screenshots. There is no automated ChatGPT/Claude/Google/Perplexity consumer-app capture integration.
- No unattended scheduler, notifications, managed customer billing, pooled provider budget, subscriptions, automatic client provisioning or agency/team workspace roles. Configured recurring monitoring belongs to Part A and remains planned; do not move it to Part B.
- Reports include human assessments and scoped measurements. AI-generated themes remain in the workspace for assessment; they are not silently promoted into reviewed client findings.
- No automatic crawling or technical site-audit service, content publishing, external outreach, conversion attribution or controlled causal experiment engine.
- Alias detection is deterministic text matching and can be ambiguous. The configuration and exact sample should be reviewed before interpretation.
- State and structured exports currently load at most the latest 500 observations. The total and truncation warning are visible. Collection plans have a 100-request limit and a study has a 2,000 collection-item limit. Report snapshots include at most 100 observations and 12 MB of structured evidence; analysis is limited to 25 answers and 90,000 input characters.
- API keys are held in tab memory only. Clients cannot simply enter a website and receive a paid automated audit without a connected provider account or a future managed service layer.
- Hosted audience remains owner-private. External pilot access must be configured before sending the site or report links to clients.

## Verification

- TypeScript validation and production build.
- 25 automated tests covering parsers, exact passage anchors, safe report rendering, metric denominators and alias boundaries, analysis evidence validation, D1/R2 persistence, immutable fact snapshots, file ownership, account isolation, cross-origin rejection, collection deduplication, redirects, malformed provider responses, historical edits, report versions, reader questions and revocation.
- Isolated Worker integration tests use synthetic dispatcher identities and mocked provider responses. They do not add an authentication bypass to application code or send paid requests.
- Browser inspection confirmed the empty workspace and rendered multi-provider brand portrait. The remote browser's interaction/screenshot operations repeatedly timed out; full visual and interactive browser acceptance remains to be completed. No live-provider or external-client acceptance is claimed.
- Integration testing found and fixed a hosting-runtime incompatibility with `redirect: "error"`. Provider requests now use manual redirect handling, never forwarding credentials through a redirect.

## Next client-launch gates

1. Validate real collection and narrative analysis with one connected provider account, then the other adapters. Confirm model support, search disclosure and error/billing behavior.
2. Run a real brand through setup, collection, exact-claim inspection, fact review, action and report delivery. Assess whether its findings change a useful brand decision.
3. Finish browser acceptance and configure named pilot access (or explicitly authorize a broader audience). Test with a separate client account; current records remain account-isolated.
4. Add a managed execution/budget layer, unattended schedules and automatic capture integrations in separately validated increments. Preserve method labels and original evidence throughout.

Do not represent this release as competitive parity with established visibility platforms or as the completed 30-hour product. It is a substantial implementation increment with explicit launch dependencies.
