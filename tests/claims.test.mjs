import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
registerHooks({ resolve(specifier, context, next) { try { return next(specifier, context); } catch (e) { if (e.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context); throw e; } } });
const { passages, validAnchor, citationSpan, inspectClaim } = await import('../lib/claims.ts');
const { buildClientReport, reportStats } = await import('../lib/report.ts');
const { exampleStudy, exampleRuns, exampleRecords } = await import('../lib/example.ts');

test('Passage navigation preserves exact text including whitespace and Unicode', () => {
  const original = '  Café ☕ is open.\n\nIt serves coffee.\n';
  const parts = passages(original, 0); assert.equal(parts.map(p => p.text).join(''), original);
  for (const part of parts) assert.equal(original.slice(part.start, part.end), part.text);
});
test('A claim anchor must match the immutable answer, not just a plausible offset', () => {
  const run = exampleRuns[0], p = exampleRecords[1].payload;
  assert.ok(validAnchor(run, p.anchor, p.claim));
  assert.equal(validAnchor(run, p.anchor, 'A different claim'), false);
  assert.equal(validAnchor(run, {...p.anchor, start: -1}, p.claim), false);
  assert.equal(validAnchor(run, {...p.anchor, segmentIndex: 80}, p.claim), false);
});
test('Citations elsewhere in an answer are not attributed to the selected sentence', () => {
  const run = exampleRuns[0], first = passages(run.normalized.segments[0].text, 0)[0];
  const result = inspectClaim(run, first, exampleRecords);
  assert.equal(result.located.length, 0); assert.equal(result.elsewhere.length, 1); assert.equal(result.reviews.length, 0);
  const p = exampleRecords[1].payload; const selected = { ...p.anchor, text: p.claim };
  assert.equal(inspectClaim(run, selected, exampleRecords).reviews.length, 1);
});
test('Unknown encoding and other providers fall back to block scope', () => {
  const run = structuredClone(exampleRuns[0]); run.normalized.segments[0].text += ' ☕';
  assert.equal(citationSpan(run, run.normalized.citations[0]), null);
  run.provider = 'anthropic'; assert.equal(citationSpan(run, run.normalized.citations[0]), null);
});
test('Client report escapes untrusted text and rejects executable source URLs', () => {
  const records = structuredClone(exampleRecords); records[0].payload.source = 'javascript:alert(1)';
  records[1].payload.explanation = '</p><script>alert(1)</script>';
  const html = buildClientReport({ ...exampleStudy, brand: '<img src=x onerror=alert(1)>' }, exampleRuns, records);
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img')); assert.ok(!html.includes('href="javascript:'));
  assert.ok(html.includes('&lt;script&gt;')); assert.ok(html.includes('href="#response-example-run"'));
});
test('Report counts reviews only when the referenced response is included', () => {
  const records = [...exampleRecords, {...exampleRecords[1], id:'outside', payload:{...exampleRecords[1].payload, runId:'outside'}}];
  assert.equal(reportStats(exampleRuns, records).reviews, 1);
  const html = buildClientReport(exampleStudy, [], records);
  assert.ok(html.includes('No findings have been reviewed'));
});

test('Evidence links anchor only uniquely located exact quotes',async()=>{
 const {uniqueQuoteAnchor}=await import('../lib/claims.ts');const run=structuredClone(exampleRuns[0]);run.normalized.segments=[{text:'One claim. Another claim.',raw_path:'$.test'}];
 assert.deepEqual(uniqueQuoteAnchor(run,'Another claim.'),{segmentIndex:0,start:11,end:25,text:'Another claim.'});
 run.normalized.segments.push({text:'Another claim.',raw_path:'$.test2'});assert.equal(uniqueQuoteAnchor(run,'Another claim.'),null);assert.equal(uniqueQuoteAnchor(run,'Invented'),null);
});
