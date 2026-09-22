import copy
import hashlib
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('gate', Path(__file__).resolve().parents[1] / 'scripts/completion_gate.py')
gate = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gate)

class CompletionGateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'evidence.txt').write_text('Redacted live acceptance receipt')
        digest = hashlib.sha256((self.root / 'evidence.txt').read_bytes()).hexdigest()
        self.contract = {'items': [{'id': name, 'required': True, 'state': 'passed', 'provenance': 'live', 'reviewer': 'independent reviewer', 'observedAt': '2026-09-22', 'evidence': 'evidence.txt', 'evidenceSha256': digest} for name in gate.REQUIRED]}
        self.receipt = {'sourceFingerprint': 'current', 'checks': [{'name': name, 'exitCode': 0} for name in ['types', 'build', 'regression', 'gate_tests']]}
    def report(self):
        return gate.evaluate(self.contract, self.receipt, 'current', self.root)
    def test_valid_evidence_passes_but_changed_source_does_not(self):
        self.assertTrue(self.report()['customerReady'])
        self.receipt['sourceFingerprint'] = 'older'
        self.assertEqual(self.report()['status'], 'needs_work')
    def test_fixture_evidence_never_satisfies_live_acceptance(self):
        self.contract['items'][0]['provenance'] = 'fixture'
        self.assertFalse(self.report()['customerReady'])
    def test_missing_modified_and_outside_evidence_rejected(self):
        self.contract['items'][0]['evidenceSha256'] = 'wrong'
        self.assertFalse(self.report()['customerReady'])
        self.contract['items'][0]['evidence'] = '../outside.txt'
        self.assertFalse(self.report()['customerReady'])
    def test_external_blocker_is_not_pass_or_endless_continuation(self):
        self.contract['items'][0].update(state='blocked', dependency='Account unavailable', nextAction='Configure authorized account')
        report = self.report()
        self.assertEqual(report['status'], 'blocked')
        self.assertNotIn('decision', gate.hook_response({}, report))
        self.assertIn('NOT customer-ready', gate.hook_response({}, report)['systemMessage'])
    def test_actionable_failure_requests_one_continuation(self):
        self.receipt['checks'][0]['exitCode'] = 1
        report = self.report()
        self.assertEqual(gate.hook_response({}, report)['decision'], 'block')
        self.assertNotIn('decision', gate.hook_response({'stop_hook_active': True}, report))
    def test_silent_scope_reduction_cannot_pass(self):
        self.contract['items'][0]['required'] = False
        self.assertEqual(self.report()['status'], 'needs_work')
        self.contract['items'].pop()
        self.assertEqual(self.report()['status'], 'needs_work')
    def test_undocumented_blocker_remains_actionable(self):
        self.contract['items'][0]['state'] = 'blocked'
        self.assertEqual(self.report()['status'], 'needs_work')

if __name__ == '__main__':
    unittest.main()
