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

test('Matched comparisons separate changed protocols and exclude failures',async()=>{
 const {createComparison}=await import('../lib/comparisons.ts');const c=createComparison(['Aster'],{from:'2026-08-01',to:'2026-08-31'},{from:'2026-09-01',to:'2026-09-30'});
 const run=(id,text,date,changes={})=>({...fixture(id,text),created_at:date+'T12:00:00Z',settings:{questionVersion:'v1',questionContext:{purpose:'baseline',market:'US'}},...changes});
 c.add(run('before','Aster is compact.','2026-08-05'));c.add(run('latest','Fern is compact.','2026-09-12'));c.add(run('earlier','Aster is compact.','2026-09-03'));
 c.add(run('changed','Aster is compact.','2026-09-13',{settings:{questionVersion:'v2'}}));c.add(run('failed','','2026-09-13',{status:'failed'}));const result=c.result();assert.equal(result.denominator,1);assert.equal(result.change,-100);assert.equal(result.excluded.onlyAfter,1);assert.equal(result.excluded.failedOrEmpty,1);assert.equal(result.pairs[0].after.id,'latest');
});
test('Rejected interpretations disappear from the brand portrait; edits retain human wording',async()=>{
 const {reviewedThemes}=await import('../lib/analytics.ts'),analysis={id:'analysis',payload:{themes:[{title:'Wrong',description:'Wrong'},{title:'Original',description:'Original'}]}};
 const reviews=[0,1].map((index)=>({kind:'classification',updated_at:'2026-09-22',payload:{method:'human_analysis_review',analysisId:'analysis',section:'themes',index,verdict:index?'edited':'rejected',title:'Reviewed title',interpretation:'Reviewed interpretation'}}));
 assert.deepEqual(reviewedThemes(analysis,reviews).map(t=>[t.title,t.description]),[['Reviewed title','Reviewed interpretation']]);
});

test('Full-study metrics count complete text before trimming display summaries',async()=>{
 const {metricsAccumulator}=await import('../lib/study-metrics.ts'),a=metricsAccumulator(exampleStudy,[]);
 a.add([fixture('late',`${'A long introduction. '.repeat(25)} Aster is recommended.`)]);a.add([fixture('absent','Fern alone.')]);const m=a.result();assert.equal(m.brands[0].mentions,1);assert.equal(m.brands[0].denominator,2);assert.equal(m.eligible[0].normalized.segments[0].text.includes('Aster'),false);assert.deepEqual(m.brands[0].runIds,['late']);
});

test('Recorded consumer personalization prevents a false matched comparison',async()=>{
 const {createComparison}=await import('../lib/comparisons.ts'),c=createComparison(['Aster'],{from:'2026-08-01',to:'2026-08-31'},{from:'2026-09-01',to:'2026-09-30'});
 const a={...fixture('a','Aster','complete','consumer'),created_at:'2026-08-10T00:00:00Z',settings:{memory:'off'}},b={...fixture('b','Fern','complete','consumer'),created_at:'2026-09-10T00:00:00Z',settings:{memory:'on'}};c.add(a);c.add(b);assert.equal(c.result().denominator,0);
});
test('Starter questions read naturally for short and long audience descriptions', async () => {
  const { starterQuestions } = await import('../lib/analytics.ts');
  const { emptyProfile } = await import('../lib/research.ts');
  const base = { ...emptyProfile(), category: 'over-the-counter hearing aids', competitors: [{ name: 'Lexie' }] };
  const long = starterQuestions('Audien', { ...base, audience: 'Adults with mild to moderate hearing loss who find prescription hearing aids too expensive or hard to get.' }).map(q => q.prompt);
  assert.equal(long[0], "What are the best over-the-counter hearing aids? I'm buying for: Adults with mild to moderate hearing loss who find prescription hearing aids too expensive or hard to get.");
  assert.ok(long.some(p => p.startsWith('How does Audien compare with Lexie? I\'m buying for:')));
  for (const p of long) { assert.ok(!/[.,;:]\?/.test(p), p); assert.ok(!p.includes('..'), p); }
  const short = starterQuestions('Audien', { ...base, audience: 'busy parents.' }).map(q => q.prompt);
  assert.equal(short[0], 'What are the best over-the-counter hearing aids for busy parents?');
  assert.equal(short[3], 'Which over-the-counter hearing aids would you recommend for busy parents, and why?');
});
test('Rates carry a Wilson interval, and overlapping rates are never rankable', async () => {
  const { wilson, overlaps } = await import('../lib/analytics.ts');
  assert.equal(wilson(0, 0), null, 'no sample, no interval');
  const one = wilson(1, 1);                       // n=1 says almost nothing
  assert.ok(one.high - one.low > 70, `n=1 interval should be very wide, got ${one.low}-${one.high}`);
  const twenty = wilson(10, 20), hundred = wilson(50, 100);
  assert.ok(hundred.high - hundred.low < twenty.high - twenty.low, 'more runs, tighter interval');
  for (const [s, n] of [[0, 20], [20, 20]]) { const i = wilson(s, n); assert.ok(i.low >= 0 && i.high <= 100, 'stays inside 0-100'); }
  assert.ok(overlaps(wilson(11, 20), wilson(9, 20)), '55% vs 45% at n=20 cannot be ranked');
  assert.equal(overlaps(wilson(95, 100), wilson(5, 100)), false, 'far apart at n=100 can be ranked');
  assert.equal(overlaps(null, wilson(5, 10)), true, 'an unknown rate is never rankable');
});
