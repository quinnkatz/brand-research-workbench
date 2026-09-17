// Isolated Worker integration test. Identities are synthetic dispatch headers in
// this local harness only; no authentication bypass is added to the application.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve('wrangler/package.json'))('miniflare');

test('Client research workflow persists exact evidence, rejects false anchors, and isolates accounts', async () => {
  const mf = new Miniflare({ modules: ['index.js', ...readdirSync('dist/server', {recursive:true}).filter(p => /\.m?js$/.test(p) && p !== 'index.js')].map(p => ({type:'ESModule',path:resolve('dist/server',p)})), modulesRoot: resolve('dist/server'), compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['BUCKET'] });
  try {
    const db = await mf.getD1Database('DB');
    for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
      for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').filter(s => s.trim())) await db.prepare(statement).run();
    }
    const headers = (uid = 'researcher-a') => ({ 'oai-authenticated-user-id': uid, 'oai-authenticated-user-email': `${uid}@example.test`, origin: 'http://workbench.test' });
    async function post(body, uid = 'researcher-a') { return mf.dispatchFetch('http://workbench.test/api/workbench', { method: 'POST', headers: { ...headers(uid), 'content-type': 'application/json' }, body: JSON.stringify(body) }); }
    async function get(query, uid = 'researcher-a') { return mf.dispatchFetch(`http://workbench.test/api/workbench?${new URLSearchParams(query)}`, { headers: headers(uid) }); }
    assert.equal((await mf.dispatchFetch('http://workbench.test/api/workbench')).status, 401);
    const create = await post({ action: 'study', name: 'Workflow test', brand: 'Test brand', website: '', objective: 'Synthetic integration test' });
    assert.equal(create.status, 201, await create.clone().text()); const { id: studyId } = await create.json();
    const prompt = '  What is the product?\n'; const answer = '  A compact coffee maker.\nIt has a removable filter.\n';
    const observation = await post({ action: 'observe', studyId, prompt, model: 'Unknown', notes: '', surface: 'perplexity', answer, observedAt: new Date().toISOString(), location: 'Unknown', locale: 'en-US', memory: 'Unknown', conversation: 'New', mode: 'Default', searchObservation: 'unknown', sources: [{url:'https://example.com/product',title:'Reference'}] });
    assert.equal(observation.status, 201, await observation.clone().text()); const { id: runId } = await observation.json();
    const run = (await (await get({ action: 'run', id: runId })).json()).run;
    assert.equal(run.prompt, prompt); assert.equal(run.normalized.segments[0].text, answer);
    const evidence = await get({ action: 'evidence', id: runId }); const original = await evidence.text();
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(original)))).map(x => x.toString(16).padStart(2,'0')).join('');
    assert.equal(run.evidence_hash, digest);
    const factResponse = await post({ action: 'record', studyId, kind: 'fact', payload: {claim:'Removable filter',product:'Test version',source:'https://example.com/product',excerpt:'The filter is removable.',checkedAt:'2026-09-17',status:'verified',notes:''} });
    assert.equal(factResponse.status, 201); const {id: factId} = await factResponse.json();
    const payload = { runId, claim: answer, anchor: {segmentIndex:0,start:0,end:answer.length}, verdict:'supported',evidenceLevel:'observed',materiality:'medium',factIds:[factId],explanation:'Compared with the dated reference excerpt.',impact:'Affects cleaning decisions.',recommendation:'Keep product instructions current.',hypothesis:'',nextTest:'Repeat after an update.' };
    assert.equal((await post({action:'record',studyId,kind:'review',payload:{...payload,claim:'Fabricated quote'}})).status,400);
    assert.equal((await post({action:'record',studyId,kind:'review',payload})).status,201);
    assert.equal((await post({action:'record',id:factId,studyId,kind:'fact',payload:{claim:'Changed reference',product:'Test version',source:'https://example.com/product',excerpt:'New edition.',checkedAt:'2026-09-18',status:'needs_review',notes:''}})).status,200);
    for (const action of ['run','evidence']) assert.equal((await get({ action, id:runId },'researcher-b')).status,404);
    assert.equal((await get({action:'export',studyId},'researcher-b')).status,404);
    assert.equal((await post({action:'record',studyId,kind:'review',payload},'researcher-b')).status,404);
    const form = new FormData(); form.append('runId',runId); form.append('file',new File(['Observed screenshot notes'], 'notes.txt', {type:'text/plain'}));
    const multipart = new Request('http://workbench.test/api/evidence',{method:'POST',headers:headers(),body:form});
    const upload = await mf.dispatchFetch(multipart.url,{method:'POST',headers:Object.fromEntries(multipart.headers),body:new Uint8Array(await multipart.arrayBuffer())});
    assert.equal(upload.status,201,await upload.clone().text()); const {id:fileId} = await upload.json();
    assert.equal((await mf.dispatchFetch(`http://workbench.test/api/evidence?id=${fileId}`,{headers:headers('researcher-b')})).status,404);
    const savedRun = (await (await get({action:'run',id:runId})).json()).run; assert.equal(savedRun.attachments.length,1);
    const saved = await (await get({action:'export',studyId})).json();
    assert.equal(saved.records.find(r=>r.kind==='review').payload.recommendation,payload.recommendation);
    assert.equal(saved.records.find(r=>r.kind==='review').payload.factSnapshots[0].payload.excerpt,'The filter is removable.');
    assert.equal(saved.study.owner_id,undefined); assert.equal(saved.runs[0].evidence_key,undefined);
    const cross = await mf.dispatchFetch('http://workbench.test/api/workbench',{method:'POST',headers:{...headers(),origin:'https://unrelated.example','content-type':'application/json'},body:JSON.stringify({action:'study',name:'Denied',brand:'Denied'})});
    assert.equal(cross.status,403);
  } finally { await mf.dispose(); }
});
