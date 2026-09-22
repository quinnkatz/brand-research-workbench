# Completion workflow

Adapted for this project after reading [AdiiX's article](https://x.com/adiix_official/article/2097014889990545608). Hook behavior checked against [OpenAI's hook documentation](https://learn.chatgpt.com/docs/hooks).

`AGENTS.md` records the operating rule. `customer-release.json` records customer acceptance and concrete live blockers. `scripts/completion_gate.py` enforces the distinction between local software verification and customer readiness.

- `python3 scripts/completion_gate.py --verify`: run TypeScript, production build, regression tests, and completion-gate tests; save an ignored, source-fingerprinted receipt. No paid requests, outbound messages or production data mutations.
- `python3 scripts/completion_gate.py --check`: read-only check. Exit 0 means every required criterion has current evidence. Exit 1 means work is pending/failed/stale. Exit 2 means local verification passes but documented external dependencies still block customer readiness.
- `python3 scripts/completion_gate.py --hook`: consume the documented Stop event. Return a continuation request for actionable unfinished work, at most once per hook continuation. External-only blockers return a warning, not a success claim or an infinite loop.

Receipts are consistency checks, not cryptographic proof of a human attestation. Passing a live gate requires a redacted evidence file, its SHA-256, live provenance, a reviewer and an observation date. A second reviewer must inspect the evidence before customer-ready is asserted; the script cannot authenticate a claimed live test by itself. Keep client data and credentials out of the repository.

## Hook installation and honest activation status

`workflow/hooks.json` is the portable project template. It is installed locally as `.codex/hooks.json`; the existing ignore rule keeps local host configuration out of Site archives. The authoritative template and checker are versioned with the code.

This ChatGPT Work session exposes no hook-registration/trust control and has no `codex` executable. Therefore **automatic continuation in this session is not verified or claimed**. The checker is invoked explicitly here. In a Codex CLI that supports hooks, review/trust the exact project hook through `/hooks`, then deliberately fail a disposable contract and verify a continuation occurs. Only then record the hook as active. Never manufacture trust records or bypass required review.

The article's guard permits one automatic continuation; it does not guarantee indefinite execution. Hooks cannot override user interruptions, host limits or safety controls. Adding this workflow does not make the product customer-ready.

## Independent review

A reviewer should inspect the gate's output and actual evidence without trusting the implementer's summary. Re-run affected checks, verify deployment source matches, confirm real-client access and the complete brand → answer → source → assessment → report journey, and distinguish fixtures from live evidence. Report failures without quietly weakening acceptance criteria. Parallel agents are used only when authorized by the user or applicable instructions.
