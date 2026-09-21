# Part A — implementation and acceptance

Updated 2026-09-21. Continuing the original Brand Research Workbench. Part B autonomous publishing/outreach and physical activations remain separate.

## Implemented client product

| Area | Delivered behavior |
| --- | --- |
| Brand setup | Guided profile, audience, positioning, aliases, competitors, market/language and editable customer questions; first-investigation checklist |
| Products | Dated SKU, variant, retailer and offer references; fact/question links preserve product snapshots |
| Collection | Five API adapters, provider JSON imports, nine consumer observation surfaces, downloadable local browser capture helper and screenshot evidence |
| Planning | Saved exact prompts, models, question/context versions, repeated requests, manual execution with pause, idempotent job claiming |
| Connections | AES-GCM encrypted credentials; private metadata; per-brand authorization and persistent request allowances |
| Background execution | QStash EU transport, limited-scope hashed callback credentials, concurrency/rate configuration, idempotency, visible uncertain delivery, guarded replacement |
| Monitoring | Daily/weekly UTC protocols, same-day retry deduplication, local pause, allowance exhaustion guard, evidence-linked mention/source alerts and terminal-batch reports |
| Measurement | Name/alias presence, tracked share, matched competitor cohorts, dated trends, explicit sample denominators, human recommendation/sentiment/rank classifications |
| Investigation | Exact passage links, citations distinguished by scope, disclosed search events, original response/native fields, hashes and screenshot attachments |
| Sources | Categories, reverse answer links, exact URL comparisons, competitor-associated answer counts, preserved dated excerpts and source deep links |
| Interpretation | Scoped narrative analysis with exact-quote validation; separate accepted/edited/rejected human review with evidence and history |
| Advice | Evidence-scoped assistant and content briefs; exact reference verification, rejected invented quotes, unanswered questions, human-reviewed proposed actions |
| Actions | Priorities, due/implementation dates, linked reviews, verification criteria and follow-up records |
| Readiness | Same-host public HTML audit, DNS/redirect checks, robots policy, metadata/headings/text/canonical/JSON-LD evidence, crawler permissions and capture comparisons |
| First-party signals | Mapped GA4 referral, Search Console and crawler CSV exports; preview, validation, rejected rows, originals and explicit attribution limits |
| Collaboration | Study owner/editor/viewer roles, email-bound expiring invites, challenge/evidence threads, responses, version history and activity |
| Delivery | Dated report snapshots, downloadable HTML, human-reviewed narrative and scoped actions, expiring/revocable links and finding-specific reader questions |
| User experience | Five main destinations, progressive filters, saved views, private evidence pins, draft recovery/conflict handling for core review forms, exact navigation URLs, older-run pagination, accessible components and reduced-motion CSS |

## Verified and not yet verified

- TypeScript and production build validated.
- Parser, claim, metrics and report tests cover immutable response handling, scope, exact quotation/anchor integrity, non-executable report rendering, provider completion states and citation roles.
- Worker integration tests cover D1/R2 persistence, tenant/role isolation, invitation email matching and replay, grants/quotas, concurrent duplicate callbacks, retained originals, client challenges, draft conflicts, traffic validation, page extraction, rejected fabricated evidence and scheduled report creation.
- All transport tests use synthetic provider/queue responses. They establish implementation behavior, not provider account access, actual model support, search completeness, vendor uptime or actual billing.
- Browser checks on the managed preview exercise the rendered example, primary navigation, collection planner and exact-passage deep-link restoration. The screenshot in `docs/qa/` is explicitly fictional example data. Authenticated browser acceptance with a separate client account remains a launch check; authenticated server flows are covered by Worker tests.
- Consumer Capture's JavaScript and import contract are checked; it has not been installed and exercised in a real signed-in consumer app in this session. It is not a store-published extension or autonomous scraping service.

## Activation dependencies

1. Provider credentials have not been supplied. Save a real account connection in the app and perform a deliberate small brand investigation to validate each desired adapter/model/search combination.
2. The production vault master secret is configured. Provider and QStash secrets are not.
3. The existing Site audience remains owner-private. Study invitations alone cannot bypass that boundary. Named pilot access or an explicitly authorized broader audience is required before outside clients can open it.
4. Unattended callbacks cannot pass the current outer private gate. QStash scheduling is built and synthetic-transport tested, but not active. A reachable callback and real QStash EU account are required. The app stops activation if its external callback probe fails.
5. Billing/subscriptions, email delivery, automatic Google/ChatGPT/Claude consumer-account collectors and managed service accounts are not included. They are not claimed as finished. Traffic ingestion uses file exports, not live OAuth connectors. Readiness audits deliberate pages, not an autonomous whole-site crawl.

## Operational limits

- Initial loading: latest 500 observations, then 200 older records per explicit page. Metrics describe loaded/filtered evidence; structured default export retains its explicit latest-500 limit. Original files are individually downloadable.
- Manual collection plan: at most 100 requests; at most 2,000 plan items per study. Monitoring protocols: 20 questions, up to 3 repetitions, one provider each; additional providers use separate protocols.
- Report links: at most 100 observations / 12 MB, expiring within 30 days. Monitor reports are evidence inventories until reviewed findings exist.
- Narrative analysis: at most 25 answers / 90,000 input characters. Assistant/brief: up to 30 answers and 50 selected reference records / 120,000 input characters.
- Public audit: exact configured HTTPS hostname, bounded response size and redirects, no JavaScript rendering. Captured crawler rules are policy, not proof of a visit.
- Request allowances are conservative logical-call caps, not a dollar budget. Failed or uncertain requests can consume allowance. A provider request may have several billable tool calls.
- Site/client traffic, conversions, deployment load and vendor costs have not been measured with real clients. No competitive-parity or completed-live-launch claim is made.

## Definition of a successful pilot

An authorized client can access their brand only, a researcher completes a real evidence-backed study, the client opens an exact claim and challenges it, the team records its response, and a dated report contains useful verified decisions. Where recurring monitoring is enabled, one real scheduled delivery and duplicate callback must be verified without duplicate provider execution. These account-dependent checks cannot be substituted with the fictional example.
