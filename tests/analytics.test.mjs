import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { try { return next(specifier, context); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context); throw e; } } });
const { mentioned, measure, scopeRuns, emptyScope, validateAnalysis } = await import('../lib/analytics.ts');
const { exampleStudy, exampleRuns } = await import('../lib/example.ts');
const fixture = (id, text, status='complete', environment='api') => ({ ...structuredClone(exampleRuns[0]), id, status, environment, normalized:{...structuredClone(exampleRuns[0].normalized), segments:[{text,raw_path:'$.test'}]} });
test('Presence rejects substrings, normalizes Unicode, and safely treats regex characters as literal names', () => {
  assert.equal(mentioned('Aster One is compact.', ['aster']),true);
  assert.equal(mentioned('Faster brewing.', ['aster']),false);
  assert.equal(mentioned('Use C++ or A.C.M.E.', ['C++']),true);
  assert.equal(mentioned('Café works.', ['Cafe\u0301']),true);
  assert.equal(mentioned('asteroid', ['Aster']),false);
  assert.equal(mentioned('xyz', ['.*']),false);
});
test('Failed, partial and empty responses never inflate the omission denominator; mentions are deduplicated', () => {
  const runs=[fixture('a','Aster and Aster One alongside Fern.'),fixture('b','Hearth only.'),fixture('c','Aster','failed'),fixture('d','Aster','partial'),fixture('e','')];
  const m=measure(exampleStudy,runs,[]);
  assert.equal(m.eligible.length,2); assert.equal(m.excluded.length,3);
  assert.equal(m.brands[0].mentions,1); assert.equal(m.brands[0].rate,50);
  assert.equal(Math.round(m.brands[0].share),33);
  assert.equal(measure(exampleStudy,[],[]).brands[0].rate,null);
});
test('Consumer observation dates and collection methods scope every measurement consistently', () => {
  const run=fixture('consumer','Aster', 'manually_recorded','consumer'); run.settings.observedAt='2026-08-01T10:00:00Z';
  const scope={...emptyScope(),from:'2026-08-01',to:'2026-08-01'};
  assert.deepEqual(scopeRuns([run,...exampleRuns],[],scope).map(r=>r.id),['consumer']);
  assert.equal(scopeRuns([run],[],{...scope,from:'2026-09-01'}).length,0);
});
test('Disclosed search-result URLs do not become citations in source metrics', () => {
  const run=fixture('source','Aster'); run.normalized.sources=[{url:'https://example.com/page',role:'provider_disclosed_consulted',raw_path:'$.result'}];
  const domain=measure(exampleStudy,[run],[]).domains[0]; assert.equal(domain.runIds.length,1); assert.equal(domain.citedIds.length,0);
});
test('Analysis discards invented run IDs, paraphrased quotes and nonexistent facts', () => {
  const run=fixture('real','Aster has a removable filter.');
  const valid={runId:'real',quote:'Aster has a removable filter.'};
  const result=validateAnalysis({summary:'Draft',themes:[{title:'Kept',description:'Draft',evidence:[valid],tone:'positive'},{title:'Rejected',description:'Draft',evidence:[{...valid,runId:'fake'}]}],findings:[{title:'Tentative',explanation:'Needs review',evidence:[valid,{runId:'real',quote:'Aster has a washable filter.'}],factIds:['invented']}]},[run],[]);
  assert.equal(result.themes.length,1); assert.equal(result.rejectedEvidence,2);
  assert.deepEqual(result.findings[0].factIds,[]); assert.equal(result.status,'needs_review');
});
