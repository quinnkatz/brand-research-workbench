import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
import test from 'node:test';
registerHooks({resolve(specifier,context,next){try{return next(specifier,context);}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier))return next(`${specifier}.ts`,context);throw e;}}});
const {coverageBoard,summarizeRun,queueRows}=await import('../lib/investigation.ts');
const {curateRecords}=await import('../lib/curation.ts');
const {buildClientReport}=await import('../lib/report.ts');
const {exampleRecords,exampleRuns,exampleStudy}=await import('../lib/example.ts');
test('Coverage keeps consumer and API evidence distinct, counts failures and preserves unknown conditions',()=>{
 const board=coverageBoard(exampleRecords,exampleRuns.map(summarizeRun));assert.equal(board.cells.find(c=>c.surface==='api:openai').counts.complete,1);assert.equal(board.cells.find(c=>c.surface==='api:openai').counts.failed,1);assert.equal(board.cells.find(c=>c.surface==='consumer:chatgpt').counts.complete,1);assert.equal(board.cells.find(c=>c.surface==='consumer:claude').counts.missing,2);assert.equal(board.cells.find(c=>c.surface==='consumer:chatgpt').observations[0].settings.memory,'Unknown');
 const missing=coverageBoard(exampleRecords.filter(r=>r.kind!=='assignment'),exampleRuns.map(summarizeRun));assert.equal(missing.cells.find(c=>c.surface==='consumer:chatgpt').counts.complete,0);
 const target=exampleRecords.find(r=>r.kind==='coverage'&&r.payload.surface==='api:openai');const queued=coverageBoard(exampleRecords,exampleRuns.map(summarizeRun),[{question_id:target.payload.questionId,provider:'openai',status:'queued',run_id:null,settings:{questionVersion:target.payload.questionVersion}}]);assert.equal(queued.cells.find(c=>c.id===target.id).counts.queued,1);assert.equal(queued.cells.find(c=>c.id===target.id).counts.missing,0);
});
test('Queue marks changed references for recheck without changing the recorded verdict',()=>{
 const records=structuredClone(exampleRecords),review=records.find(r=>r.kind==='review'),fact=records.find(r=>r.kind==='fact');review.payload.factSnapshots=[structuredClone(fact)];fact.updated_at='2026-10-01';const row=queueRows(records).find(r=>r.review?.id===review.id);assert.equal(row.state,'recheck');assert.equal(row.review.payload.verdict,'supported');assert.equal(queueRows(records).some(r=>r.state==='unreviewed'),true);
 fact.updated_at=review.payload.factSnapshots[0].updated_at;review.payload.sourceSnapshots=[{sourceId:'old-source',url:'https://example.com/care',capturedAt:'2026-09-01',contentHash:'old'}];records.push({id:'new-source',kind:'source',payload:{url:'https://example.com/care',capturedAt:'2026-10-01',status:'captured',contentHash:'new'}});assert.equal(queueRows(records).find(r=>r.review?.id===review.id).state,'recheck');assert.equal(review.payload.sourceSnapshots[0].contentHash,'old');
});
test('Curated reports preserve chosen order, escape summary and exclude unrelated records',()=>{
 const all=structuredClone(exampleRecords),review=all.find(r=>r.kind==='review');const second={...structuredClone(review),id:'second-review',payload:{...review.payload,claim:'SECOND FINDING',materiality:'high'}};all.push(second,{...structuredClone(all[0]),id:'internal',payload:{claim:'INTERNAL ONLY',excerpt:'Do not export',source:'https://example.com'}});
 const selection={reviewIds:[review.id,second.id],actionIds:['example-action'],summary:'<script>attack()</script>'};const selected=curateRecords(all,selection);const html=buildClientReport(exampleStudy,exampleRuns.filter(r=>selected.runIds.includes(r.id)),selected.records,true,undefined,selection);assert.equal(html.includes('INTERNAL ONLY'),false);assert.equal(html.includes('<script>attack()'),false);assert.match(html,/&lt;script&gt;attack/);assert.ok(html.indexOf(review.payload.claim)<html.indexOf('SECOND FINDING'));assert.throws(()=>curateRecords(all,{...selection,reviewIds:[second.id]}),/supporting finding/);
});
