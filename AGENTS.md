# Part A — finish the customer workflow

The standing goal is a customer-usable brand investigation product. A completed feature package or a passing fixture suite is not a completed customer launch. Continue from the existing implementation; preserve Part A and keep Part B autonomous outreach/publishing separate.

## Execution

- Carry authorized work through implementation, appropriate verification, fixes and deployment. Do not stop after a plan, first implementation, elapsed-time milestone or arbitrary feature count.
- When a dependency blocks one item, record the evidence and continue every independent item. Ask only for a dependency that cannot be obtained through authorized available access, after completing the independent work.
- Do not substitute new promises or large hour estimates for execution. Report observable outcomes. Do not claim continued background work unless an actual supported task is running.
- Before a completion claim, run `python3 scripts/completion_gate.py --check`. If local checks need refreshing, run `python3 scripts/completion_gate.py --verify`. If the product is blocked, say which criterion remains blocked; never call it customer-ready.
- Read `workflow/customer-release.json` for the finish line and blockers; `workflow/AUTHORIZATION.md` for existing authorization. Read `BUILD_STATUS.md` for product scope and `docs/IMPLEMENTATION_LEDGER.md` for the earlier six-item release. Read other docs only when the current change needs them.
- Run checks that resolve the change's concrete risks. Reuse a successful receipt only while its inputs match. Fixture success never satisfies a live gate. Do not edit the gate to make an unfinished feature pass.
- Preserve exact next actions and evidence in the release ledger across context changes. A progress update does not end the task.

## Boundaries

User instructions take precedence over project/skill guidelines where higher-priority instructions allow. Do not alter host safeguards, permissions or trust records to avoid a blocker. If an instruction requires stopping, identify its actual source and applicability; do not invent a permission requirement.

Preserve tenant isolation, original evidence, API/consumer distinctions, explicit uncertainty and study-level access. Hosting is Quinn's own Cloudflare account (docs/SELF_HOSTING.md): deploy with `pnpm cf:deploy`, never to ChatGPT Sites. Sign-in is Cloudflare Access; never trust identity headers outside `AUTH_MODE=sites` (local dev and tests only). Do not expose credentials or claim access to undisclosed model reasoning.
