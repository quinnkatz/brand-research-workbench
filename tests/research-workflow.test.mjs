// Isolated local Worker. Mock transport and synthetic identities never enter production code.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
const require=createRequire(import.meta.url);
const {Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
test('Brand setup, durable collection, analysis, record history and revocable reports stay isolated', async()=>{
  let calls=0, analysisInput;
  const mf=new Miniflare({modules:['index.js',...readdirSync('dist/server',{recursive:true}).filter(p=>/\.m?js$/.test(p)&&p!=='index.js')].map(p=>({type:'ESModule',path:resolve('dist/server',p)})), modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],outboundService:async request=>{
    calls++; assert.equal(new URL(request.url).hostname,'api.openai.com'); const body=await request.json();
    if(body.model==='synthetic-redirect') return new Response('Moved', {status:302,headers:{location:'https://unrelated.example/credential-trap'}});
    if(body.model==='synthetic-invalid') return new Response('<html>Provider error</html>', {status:502});
    let text='Aster is a compact coffee maker. Fern offers another option.';
    if(body.input.includes('INPUT:\n')) { analysisInput=JSON.parse(body.input.split('INPUT:\n')[1]); const runId=analysisInput.observations[0].id; text=JSON.stringify({summary:'Draft',themes:[{title:'Compactness',description:'A portrayal worth reviewing.',tone:'neutral',evidence:[{runId,quote:'Aster is a compact coffee maker.'}]}],findings:[{title:'Fabricated quote',explanation:'Discard me',evidence:[{runId,quote:'Aster is free forever.'}],factIds:[]}]}); }
    return new Response(JSON.stringify({id:'synthetic',status:'completed',model:'synthetic-model',output:[{type:'message',role:'assistant',content:[{type:'output_text',text,annotations:[]}]}]}),{headers:{'content-type':'application/json'}});
  }});
  try{
    const db=await mf.getD1Database('DB');
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) for(const statement of readFileSync(`drizzle/${file}`,'utf8').split('--> statement-breakpoint').filter(s=>s.trim())) await db.prepare(statement).run();
    const headers=(uid='owner-a')=>({'oai-authenticated-user-id':uid,'oai-authenticated-user-email':`${uid}@example.test`,origin:'http://workbench.test','content-type':'application/json'});
    const post=(path,body,uid)=>mf.dispatchFetch(`http://workbench.test/api/${path}`,{method:'POST',headers:headers(uid),body:JSON.stringify(body)});
    const get=(path,params,uid)=>mf.dispatchFetch(`http://workbench.test/api/${path}?${new URLSearchParams(params)}`,{headers:headers(uid)});
    const research=(action,values={},uid)=>post('research',{action,...values},uid);
    const setup=await research('onboard',{brand:'Aster',website:'https://example.com',objective:'Synthetic QA',profile:{category:'coffee makers',audience:'small kitchens',positioning:'Everyday coffee',aliases:['Aster One'],competitors:[{name:'Fern',aliases:[]}],market:'US',language:'English'},questions:[{prompt:'Which compact coffee makers should I consider?',intent:'discovery',origin:'researcher',notes:'',tags:[]}]});
    assert.equal(setup.status,201,await setup.clone().text()); const {id:studyId}=await setup.json();
    const state=await (await get('workbench',{action:'state',studyId})).json(); const questionId=state.records[0].id; assert.equal(state.studies[0].profile.competitors[0].name,'Fern');
    const requestId=crypto.randomUUID(); const plan={studyId,name:'First study',questionIds:[questionId],providers:[{provider:'openai',model:'synthetic-model'}],repeats:2,search:'off',maxTokens:1024,requestId};
    assert.equal((await research('plan',plan)).status,201); assert.equal((await research('plan',plan)).status,200); assert.equal(calls,0);
    let jobs=(await (await get('research',{action:'resources',studyId})).json()).jobs; assert.equal(jobs.length,2); assert.equal(jobs[0].owner_id,undefined);
    assert.equal((await research('execute',{studyId,jobId:jobs[0].id,key:'synthetic-key-only'},'owner-b')).status,404);
    const runResponse=await research('execute',{studyId,jobId:jobs[0].id,key:'synthetic-key-only'}); assert.equal(runResponse.status,200,await runResponse.clone().text()); const {id:runId,status}=await runResponse.json(); assert.equal(status,'complete', JSON.stringify({calls,run:await db.prepare('SELECT status,error,evidence_key FROM runs WHERE id = ?').bind(runId).first()})); assert.equal(calls,1);
    const second=await (await research('execute',{studyId,jobId:jobs[0].id,key:'synthetic-key-only'})).json(); assert.equal(second.alreadyStarted,true); assert.equal(calls,1);
    const evidence=await (await get('workbench',{action:'evidence',id:runId})).text(); assert.equal(evidence.includes('synthetic-key-only'),false); assert.ok(evidence.includes('Which compact coffee makers should I consider?'));
    assert.equal((await research('cancel_plan',{studyId,batchId:requestId})).status,200);
    jobs=(await (await get('research',{action:'resources',studyId})).json()).jobs; assert.equal(jobs.filter(j=>j.status==='cancelled').length,1);
    const analysis=await research('analyze',{studyId,runIds:[runId],provider:'openai',model:'synthetic-model',key:'synthetic-key-only'}); assert.equal(analysis.status,201,await analysis.clone().text()); const {id:analysisId}=await analysis.json();
    const after=await (await get('workbench',{action:'state',studyId})).json(); const a=after.records.find(r=>r.kind==='analysis'); assert.equal(a.payload.themes.length,1); assert.equal(a.payload.findings.length,0); assert.equal(a.payload.rejectedEvidence,1); assert.equal(a.payload.status,'needs_review');
    assert.equal((await get('research',{action:'analysis_original',studyId,id:analysisId},'owner-b')).status,404);
    const reviewPayload={runId,claim:'Aster is a compact coffee maker.',anchor:{segmentIndex:0,start:0,end:32},verdict:'uncertain',evidenceLevel:'observed',materiality:'medium',factIds:[],explanation:'Check the product dimensions.',recommendation:'Verify the dimensions.'};
    const review=await post('workbench',{action:'record',studyId,kind:'review',payload:reviewPayload}); assert.equal(review.status,201,await review.clone().text()); const {id:reviewId}=await review.json();
    const actionPayload={studyId,title:'Verify dimensions',description:'Check published specifications',status:'proposed',priority:'medium',reviewIds:[reviewId],dueDate:'',implementedAt:'',verification:'Compare a new observation',verificationRunIds:[]};
    const action=await research('action_item',actionPayload); assert.equal(action.status,201); const {id:actionId}=await action.json();
    assert.equal((await research('action_item',{...actionPayload,status:'verified'})).status,400);
    const record=(await (await get('workbench',{action:'state',studyId})).json()).records.find(r=>r.id===actionId);
    assert.equal((await research('action_item',{...actionPayload,id:actionId,expectedUpdatedAt:'stale'})).status,409);
    assert.equal((await research('action_item',{...actionPayload,id:actionId,expectedUpdatedAt:record.updated_at,status:'agreed'})).status,200);
    const history=await (await get('research',{action:'history',studyId,id:actionId})).json(); assert.equal(history.versions[0].payload.status,'proposed');
    const snapshot=await research('snapshot',{studyId,title:'Synthetic client report',runIds:[runId],expiresInDays:1}); assert.equal(snapshot.status,201,await snapshot.clone().text()); const {id:reportId,path}=await snapshot.json();
    const token=path.split('/').pop(); const row=await db.prepare('SELECT * FROM report_snapshots WHERE id = ?').bind(reportId).first(); assert.notEqual(row.token_hash,token);
    const reportObject=await (await mf.getR2Bucket('BUCKET')).get(row.object_key); const captured=await reportObject.json(); assert.equal(captured.runs.length,1); assert.equal(captured.records.filter(r=>r.kind==='review').length,1);
    const render=await mf.dispatchFetch(`http://workbench.test${path}`); assert.equal(render.status,200); assert.ok((await render.text()).includes('Synthetic client report'));
    const comment={token,author:'Test client',message:'Can you verify these dimensions?',reviewId};
    assert.equal((await post('report-review',comment)).status,201);
    assert.equal((await post('report-review',{...comment,reviewId:crypto.randomUUID()})).status,400);
    assert.equal((await get('research',{action:'report_comments',studyId,id:reportId},'owner-b')).status,404);
    assert.equal((await (await get('research',{action:'report_comments',studyId,id:reportId})).json()).comments.length,1);
    assert.equal((await research('revoke_report',{studyId,id:reportId},'owner-b')).status,404);
    assert.equal((await research('revoke_report',{studyId,id:reportId})).status,200);
    assert.equal((await post('report-review',comment)).status,404);
    assert.equal(calls,2); assert.equal(analysisInput.intendedPositioning,'Everyday coffee');
    for (const model of ['synthetic-redirect','synthetic-invalid']) {
      const batchId=crypto.randomUUID(); assert.equal((await research('plan',{...plan,requestId:batchId,repeats:1,providers:[{provider:'openai',model}]})).status,201);
      const badJob=(await (await get('research',{action:'resources',studyId})).json()).jobs.find(j=>j.batch_id===batchId);
      const failed=await (await research('execute',{studyId,jobId:badJob.id,key:'synthetic-key-only'})).json(); assert.equal(failed.status,'failed');
      const original=await (await get('workbench',{action:'evidence',id:failed.id})).json(); assert.ok(original.responseText); assert.equal(original.raw,null);
      assert.equal((await (await research('execute',{studyId,jobId:badJob.id,key:'synthetic-key-only'})).json()).alreadyStarted,true);
    }
    assert.equal(calls,4); // No redirects followed and no repeat charges.

  } finally {await mf.dispose();}
});
