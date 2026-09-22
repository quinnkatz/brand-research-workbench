#!/usr/bin/env python3
"""Evidence-aware release gate. Never equate fixture checks with customer readiness."""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = {'customer_access', 'live_api', 'consumer_observation', 'source_capture', 'client_report', 'monitoring', 'email'}
RECEIPT = ROOT / '.codex' / 'verification.json'
CONTRACT = ROOT / 'workflow' / 'customer-release.json'

def fingerprint(root=ROOT):
    result = subprocess.run(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root, capture_output=True, check=True)
    digest = hashlib.sha256()
    for name in sorted(set(result.stdout.decode().split('\0')) - {''}):
        path = root / name
        # Documentation edits do not invalidate unchanged application checks.
        if name.startswith(('docs/', 'workflow/')) or name in {'AGENTS.md', 'README.md', 'BUILD_STATUS.md'}:
            continue
        digest.update(name.encode() + b'\0')
        digest.update(path.read_bytes() if path.is_file() else b'<missing>')
    return digest.hexdigest()

def read_json(path):
    with path.open() as handle:
        return json.load(handle)

def evaluate(contract, receipt, source_hash, root=ROOT):
    actionable, blocked = [], []
    if not isinstance(receipt, dict) or receipt.get('sourceFingerprint') != source_hash:
        actionable.append('Current source has no matching verification receipt. Run python3 scripts/completion_gate.py --verify and fix any failures.')
    elif {r.get('name') for r in receipt.get('checks', []) if r.get('exitCode') == 0} != {'types', 'build', 'regression', 'gate_tests'}:
        actionable.append('Required local checks are missing or failed; inspect the receipt and rerun affected checks.')
    items = contract.get('items', []) if isinstance(contract, dict) else []
    ids = [item.get('id') for item in items if isinstance(item, dict)]
    if len(ids) != len(items) or len(set(ids)) != len(ids) or not REQUIRED.issubset(ids):
        actionable.append('Customer contract has missing, duplicate or invalid criteria. Restore the required finish line.')
    for item in items:
        if not isinstance(item, dict):
            continue
        label, state = item.get('id', 'unknown'), item.get('state')
        if label in REQUIRED and item.get('required') is not True:
            actionable.append(f'{label}: required acceptance cannot be silently disabled.')
            continue
        if item.get('required') is not True:
            continue
        if state == 'blocked':
            if not item.get('dependency') or not item.get('nextAction'):
                actionable.append(f'{label}: blocked status needs an exact dependency and next action.')
            else:
                blocked.append(f"{label}: {item['dependency']} Next: {item['nextAction']}")
        elif state == 'passed':
            if item.get('provenance') != 'live' or not item.get('reviewer') or not item.get('observedAt'):
                actionable.append(f'{label}: live evidence, reviewer and observation date are required; a fixture is not acceptance.')
                continue
            try:
                path = (root / item['evidence']).resolve()
                path.relative_to(root.resolve())
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                if digest != item.get('evidenceSha256'):
                    raise ValueError('evidence hash mismatch')
            except (OSError, ValueError, KeyError, TypeError):
                actionable.append(f'{label}: referenced evidence is missing, outside the project or changed.')
        else:
            actionable.append(f"{label}: {state or 'pending'} — {item.get('nextAction') or item.get('criterion', 'complete acceptance')}")
    return {'customerReady': not actionable and not blocked,
            'status': 'needs_work' if actionable else 'blocked' if blocked else 'ready',
            'actionable': actionable, 'blocked': blocked}

def hook_response(event, report):
    if event.get('stop_hook_active'):
        return {'systemMessage': 'Completion continuation already ran. Report remaining unmet criteria honestly; do not claim customer readiness.'} if not report['customerReady'] else {}
    if report['actionable']:
        return {'decision': 'block', 'reason': 'Part A completion check found unfinished work. Continue authorized implementation and verification; do not stop at a milestone.\n' + '\n'.join(report['actionable']) + '\nFinish independent work even if a live dependency is blocked.'}
    if report['blocked']:
        return {'systemMessage': 'The product is NOT customer-ready. Local checks pass but external acceptance remains blocked:\n' + '\n'.join(report['blocked'])}
    return {}

def verify():
    before = fingerprint()
    commands = [('types', ['node', 'node_modules/typescript/bin/tsc', '--noEmit']),
                ('build', ['pnpm', 'build']),
                ('regression', ['node', '--experimental-strip-types', '--test', *[str(p.relative_to(ROOT)) for p in sorted((ROOT / 'tests').glob('*.test.mjs'))]]),
                ('gate_tests', ['python3', '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'completion_gate_test.py'])]
    checks = []
    RECEIPT.parent.mkdir(exist_ok=True)
    logs = RECEIPT.parent / 'verification-logs'
    logs.mkdir(exist_ok=True)
    for name, command in commands:
        print(f'Checking {name}…', flush=True)
        try:
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, timeout=240)
            code, output = result.returncode, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            code, output = 124, 'Check exceeded its four-minute limit; investigate before rerunning.'
        log = logs / f'{name}.log'
        log.write_text(output)
        checks.append({'name': name, 'command': command, 'exitCode': code, 'log': str(log.relative_to(ROOT))})
        print(f'{name}: {"PASS" if code == 0 else "FAIL"}', flush=True)
        if code:
            print('\n'.join(output.splitlines()[-15:]), flush=True)
            break
    after = fingerprint()
    receipt = {'sourceFingerprint': before, 'verifiedAt': datetime.now(timezone.utc).isoformat(), 'checks': checks}
    if before != after:
        receipt['sourceFingerprint'] = 'CHANGED_DURING_VERIFICATION'
    RECEIPT.write_text(json.dumps(receipt, indent=2) + '\n')
    return before == after and len(checks) == len(commands) and all(c['exitCode'] == 0 for c in checks)

def main():
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    for flag in ('verify', 'check', 'hook'):
        group.add_argument('--' + flag, action='store_true')
    args = parser.parse_args()
    if args.verify:
        return 0 if verify() else 1
    event = {}
    try:
        if args.hook:
            event = json.load(sys.stdin)
            if not isinstance(event, dict):
                raise ValueError('Hook input must be an object')
        receipt = read_json(RECEIPT) if RECEIPT.exists() else None
        report = evaluate(read_json(CONTRACT), receipt, fingerprint())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        report = {'customerReady': False, 'status': 'needs_work', 'actionable': [f'Completion evidence could not be checked: {error}'], 'blocked': []}
    if args.hook:
        print(json.dumps(hook_response(event, report)))
        return 0
    print(json.dumps(report, indent=2))
    return 0 if report['customerReady'] else 1 if report['actionable'] else 2

if __name__ == '__main__':
    sys.exit(main())
