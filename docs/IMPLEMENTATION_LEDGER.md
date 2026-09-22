# Part A — six-item build acceptance ledger

September 22, 2026. Implementation complete against `Part-A-Next-Build-Package.md`; final source is this repository commit. Deployment identifiers are recorded in the saved build package and project checkpoint after successful publishing. No claim of elapsed engineering hours or a finished commercial launch is made.

## 1. Observation coverage board — implemented / verified

Question-version × exact platform/method targets preserve expected repetitions. Complete, queued, running, partial, failed, cancelled and missing counts remain distinct. API answers cannot fill consumer or imported-response targets. Explicit assignments retain the original conditions. Collection entry points reuse the existing planner and import/record flows; no paid request starts from a coverage click.

Verification: the integrated Worker test creates 513 observations and counts an assigned older answer outside the latest 500; tests consumer assignment, failed-answer exclusion, ownership and viewer rejection. Unit checks cover queued work and unknown memory. Browser inspection opened the consumer observation from its coverage cell and retained the API/consumer distinction. The mobile board has contained table scrolling and no horizontal page overflow.

## 2. Connected passage investigation — implemented / verified

Desktop keeps the full answer, available source evidence and assessment visible together. The selected passage is highlighted at its exact recorded location. Mobile uses keyboard-accessible Answer / Source / Review tabs. Source evidence has provider/observer/later-retrieval provenance. Disclosed events remain in recorded response order; hidden ranking and private reasoning are never invented. Exact passage and selected source links restore across page navigation. Queue links use a verified stored anchor, including repeated quotations; unanchored ambiguous quotations remain unresolved.

Verification: desktop at 1363 × 936 and a 390 × 844 same-origin responsive frame; source text readability, no horizontal page overflow, arrow-key tab navigation, visible focus and Escape dismissal. Deep-link restoration retained the consumer answer and chosen manual source. Existing draft-race tests exercise restoration, concurrent typing, conflicts and cleared drafts. Authenticated writes were tested at the Worker boundary using isolated identities; a separate authenticated client browser session was not available. Screenshots contain clearly fictional data only.

## 3. Preserve cited public sources — implemented / fixture-verified; live success unverified

A disclosed public HTTPS URL can be captured explicitly from an authorized observation. Captures preserve original bytes, extracted text, requested/final URL, timestamp, content hash, content type and status. Each success is immutable. Exact UTF-16 excerpt offsets and text are server-validated and embedded with capture identity in the review. Later versions do not replace old reviews or reports. Saved reviews can reopen their original preserved source.

Controls: DNS and redirect validation, public HTTPS only, same-host redirects, robots policy, 12-second request limits, a 1.5 MB response limit, HTML/plain-text content types, no forwarded auth/cookies and no execution of captured HTML. Unsupported, blocked, inaccessible and short/JavaScript-dependent responses retain explicit limitations and the manual-excerpt route. A failed capture now leaves the current source selection and pending assessment intact; its attempt remains in source history.

Verification: successful capture/extraction, original-byte retention, exact excerpt rejection, repeated captures, cross-study denial, private DNS, private redirect, robots exclusion, HTTP 403, unsupported PDF and oversized responses all pass isolated Worker tests. The rendered unavailable-capture state and prior manual version were inspected in the browser.

**Live transport limitation:** an actual isolated request for `https://example.com/` failed because this build environment could not resolve `cloudflare-dns.com`. The app persisted an unavailable attempt safely. Successful real public-page retrieval is not claimed; repeat this check from the deployed application with a disclosed, supported public source. This is not a provider-account test, and no network safeguards were bypassed.

## 4. Persistent evidence review queue — implemented / verified

Researchers queue a passage without inventing a verdict and filter by platform, state, product and assigned priority. Existing assessments also appear. Changed dated facts or newer differing source captures request a recheck while preserving the previous verdict/evidence. Findings link to actions and verification criteria. Reviewer identity, time, revision conflict protection and history remain recorded. Viewers cannot write shared assessments.

Verification: queue replay and invalid-anchor rejection; reviewer identity and permissions; source/fact-version retention; unit checks that changed references do not reverse a supported verdict. Browser inspection distinguishes awaiting assessment from a saved finding and displays its connected action/verification criterion.

## 5. Curated client report builder — implemented / verified

Select and order reviewed findings and their supported actions, edit the title/summary, recover the draft, inspect a preview, download HTML and publish a dated immutable report. Full-study coverage is separate from the selected supporting observations. Unselected internal records are excluded. Sources retain exact excerpts and provenance alongside the original answer, uncertainty and recommendations. Publishing checks a fingerprint of the selected evidence and coverage; stale previews are rejected. Existing expiry, revocation, size limits and the private Site gate remain in force.

Verification: the integrated scenario saves a review/action, previews/publishes a selected report, excludes an unrelated internal fact, rejects stale evidence, preserves the report after a new source capture, and rejects an expired report interaction. Unit checks confirm selection order, escaped summary and action/finding dependency. Browser checks select a finding/action, render the report, show full-study coverage, and disable downloads after draft changes until a fresh preview. Report controls fit mobile without page overflow. Fictional example drafts intentionally do not persist.

## 6. Integrated checks and deployment — implementation/checks complete

- Final TypeScript check: passed.
- Final production build: passed.
- Final regression run: **41 passed, 0 failed, 0 skipped**, using `node --experimental-strip-types --test tests/*.test.mjs` against the final build.
- Full scenario: coverage → exact passage → captured source → review → action → curated immutable report. It includes older observations, changed versions, failures, expired reports, tenant isolation and role restrictions.
- Browser QA: desktop investigation; mobile investigation, queue, coverage and report builder; keyboard tabs/focus/dismissal; selected source restoration and unavailable-source history.
- Screenshots: `docs/qa/part-a-investigation-desktop.jpg` and `docs/qa/part-a-investigation-mobile.jpg`. The mobile image uses a 390-pixel iframe viewport, not a physical-device claim. The temporary QA harness was removed before the final build.
- Migration `0005_investigation_workflow.sql` adds partial unique indexes for targets, assignments and queued passages; isolated tests apply every migration from an empty database. Earlier migrations are unchanged.
- Source and screenshots are committed through the existing Site repository; publication preserves the existing owner-private audience. Native deployment receipt belongs in the saved package/checkpoint, so this commit does not invent its own future SHA.

## Explicit remaining live launch checks

Provider/model/search compatibility needs real account credentials and deliberate requests. Consumer-app capture needs a real signed-in consumer session. Outside-client access needs the intended authorized Site audience and a separate client browser acceptance. Scheduled callbacks and email need their real accounts and reachable endpoints. The successful live source capture described above also remains unverified. None is represented by transport fixtures, screenshots or this deployment.

This release adds no autonomous consumer-account querying, billing, OAuth analytics, hidden model reasoning, public content publishing or Part B outreach. Configured monitoring remains Part A. These boundaries preserve the agreed product; they do not diminish the requirement to test real client value next.
