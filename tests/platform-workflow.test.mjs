import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');

test('Client roles, encrypted connections, quotas, callback replay, challenges and evidence tools form one isolated workflow',async()=>{
  const messages=[],schedules=[],emails=[];let emailFailure=false;let providerCalls=0,reachable=true,providerFailure=false,query='Aster is compact.',queueCalls=0;
  const mf=new Miniflare({modules:['index.js',...readdirSync('dist/server',{recursive:true}).filter(p=>/\.m?js$/.test(p)&&p!=='index.js')].map(p=>({type:'ESModule',path:resolve('dist/server',p)})),modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{AUTH_MODE:'sites',VAULT_MASTER_KEY:Buffer.alloc(32,7).toString('base64')},outboundService:async req=>{
    const url=new URL(req.url);
    if(url.hostname==='workbench.test'&&url.pathname==='/api/dispatch')return reachable?Response.json({service:'brand-research-dispatch-v1'}):new Response('Sign in',{status:302,headers:{location:'/signin'}});
    if(url.hostname==='qstash-eu-central-1.upstash.io'){
      queueCalls++;assert.equal(req.headers.get('authorization'),'Bearer test-queue-credential');
      const item={url:req.url,headers:Object.fromEntries(req.headers),body:await req.json()};
      assert.equal(JSON.stringify(item).includes('test-provider-credential'),false);assert.equal(JSON.stringify(item).includes('Which coffee'),false);
      if(url.pathname.startsWith('/v2/publish/')){messages.push(item);return Response.json({messageId:`message-${messages.length}`});}
      schedules.push(item);return Response.json({scheduleId:req.headers.get('upstash-schedule-id')||'existing-schedule'});
    }
    if(url.hostname==='api.resend.com'){
      assert.equal(url.pathname,'/emails/batch');assert.equal(req.headers.get('authorization'),'Bearer synthetic-email-credential');
      const body=await req.json();emails.push({body,key:req.headers.get('idempotency-key')});if(emailFailure)return new Response('Synthetic unavailable',{status:503});return Response.json({data:body.map((_,i)=>({id:`email-${emails.length}-${i}`}))});
    }
    if(url.hostname==='api.openai.com'){
      providerCalls++;assert.equal(req.headers.get('authorization'),'Bearer test-provider-credential');if(providerFailure)return Response.json({error:'Synthetic rate limit'},{status:429});const body=await req.json();let answer=query;
      if(body.input.includes('INPUT:\n')){const input=JSON.parse(body.input.split('INPUT:\n')[1]);const r=input.references[0];answer=JSON.stringify({title:'Scoped response',sections:[{heading:'Observed',text:'The provided answer calls Aster compact.',evidence:[{id:r.id,quote:'Aster is compact.'}]},{heading:'Invented',text:'Not supported',evidence:[{id:r.id,quote:'Aster is free forever.'}]}],proposals:[],unanswered:['No sales impact was supplied.']});}
      return Response.json({id:'synthetic-provider-response',status:'completed',model:'test-model',output:[{type:'message',content:[{type:'output_text',text:answer,annotations:[]}]}]});
    }
    if(url.hostname==='cloudflare-dns.com')return Response.json({Answer:[{type:1,data:'93.184.216.34'}]});
    if(url.hostname==='brand-public.com'){
      if(url.pathname==='/robots.txt')return new Response('User-agent: *\nAllow: /\nDisallow: /private',{headers:{'content-type':'text/plain'}});
      return new Response('<!doctype html><html lang="en"><head><title>Aster One</title><meta name="description" content="A compact coffee maker"><link rel="canonical" href="https://brand-public.com/product"><script type="application/ld+json">{"@type":"Product","name":"Aster One"}</script></head><body><h1>Aster One</h1><p>Compact, removable filter. A product reference for a dated inspection.</p><a href="/care">Care guide</a><script>SECRET_SCRIPT_TEXT</script></body></html>',{headers:{'content-type':'text/html'}});
    }
    throw new Error(`Unexpected outbound request: ${url.origin}`);
  }});
  try{
    const db=await mf.getD1Database('DB');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(`drizzle/${file}`,'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(s).run();
    const headers=(user='owner')=>({'oai-authenticated-user-id':user,'oai-authenticated-user-email':`${user}@example.test`,origin:'https://workbench.test','content-type':'application/json'});
    const post=(path,body,user='owner')=>mf.dispatchFetch(`https://workbench.test/api/${path}`,{method:'POST',headers:headers(user),body:JSON.stringify(body)});
    const get=(path,query,user='owner')=>mf.dispatchFetch(`https://workbench.test/api/${path}?${new URLSearchParams(query)}`,{headers:headers(user)});
    async function json(response,status=200){assert.equal(response.status,status,await response.clone().text());return response.json();}
    const {id:studyId}=await json(await post('research',{action:'onboard',brand:'Aster',website:'https://brand-public.com',profile:{},questions:[{prompt:'Which coffee maker is compact?',intent:'discovery'}]}),201);
    const state=await json(await get('workbench',{action:'state',studyId})),questionId=state.records[0].id;
    assert.equal(state.studies[0].access_role,'owner');
    for(const role of ['viewer','editor']){
      const invite=await json(await post('workspace',{action:'invite',studyId,email:`${role}@example.test`,role}),201);const token=invite.path.split('/').pop();
      assert.equal((await post('workspace',{action:'accept_invite',token},'stranger')).status,403);
      await json(await post('workspace',{action:'accept_invite',token},role));
      assert.equal((await post('workspace',{action:'accept_invite',token},role)).status,404);
      const ownState=await json(await get('workbench',{action:'state'},role));assert.equal(ownState.studies[0].id,studyId);assert.equal(ownState.studies[0].access_role,role);assert.equal(ownState.studies[0].owner_id,undefined);
    }
    assert.equal((await post('research',{action:'profile',studyId,profile:{}},'viewer')).status,403);
    assert.equal((await post('workspace',{action:'invite',studyId,email:'x@example.test',role:'editor'},'editor')).status,403);
    await json(await post('research',{action:'questions',studyId,questions:[{prompt:'What is Aster?',intent:'verification'}]},'editor'),201);
    assert.equal((await get('workbench',{action:'state',studyId},'stranger')).status,404);
    const {id:connectionId}=await json(await post('workspace',{action:'connection',provider:'openai',label:'Research account',model:'test-model',key:'test-provider-credential'}),201);
    const secret=await db.prepare('SELECT * FROM connections WHERE id=?').bind(connectionId).first();assert.notEqual(secret.ciphertext,'test-provider-credential');assert.ok(secret.iv);
    const visible=await json(await get('workspace',{action:'connections',studyId}));assert.equal(JSON.stringify(visible).includes('test-provider-credential'),false);assert.equal(JSON.stringify(visible).includes('ciphertext'),false);
    assert.equal((await post('workspace',{action:'disconnect',id:connectionId},'editor')).status,404);
    await json(await post('workspace',{action:'grant_connection',studyId,connectionId,requestLimit:1}));
    const clientConnection=await json(await get('workspace',{action:'connections',studyId},'editor'));assert.equal(clientConnection.connections.length,0);assert.equal(clientConnection.grants[0].id,connectionId);
    const {id:queueId}=await json(await post('workspace',{action:'connection',provider:'qstash',label:'Queue',model:'',key:'test-queue-credential'}),201);
    const batchId=crypto.randomUUID();await json(await post('research',{action:'plan',studyId,name:'Durable test',questionIds:[questionId],providers:[{provider:'openai',model:'test-model'}],repeats:2,search:'off',maxTokens:1024,requestId:batchId}),201);
    const jobs=(await json(await get('research',{action:'resources',studyId}))).jobs;
    reachable=false;assert.equal((await post('monitoring',{action:'dispatch',studyId,batchId,queueConnectionId:queueId,connections:{openai:connectionId}})).status,409);assert.equal(queueCalls,0);reachable=true;
    const dispatched=await json(await post('monitoring',{action:'dispatch',studyId,batchId,queueConnectionId:queueId,connections:{openai:connectionId}}));assert.equal(messages.length,1);assert.equal(dispatched.results.filter(r=>r.status==='blocked').length,1);
    const message=messages[0];assert.equal(message.headers['upstash-timeout'],'180s');
    const callback=()=>mf.dispatchFetch('https://workbench.test/api/dispatch',{method:'POST',headers:{'content-type':'application/json',authorization:message.headers['upstash-forward-authorization']},body:JSON.stringify(message.body)});
    assert.equal((await mf.dispatchFetch('https://workbench.test/api/dispatch',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(message.body)})).status,401);
    const delivered=await Promise.all([callback(),callback()]);const callbackResults=await Promise.all(delivered.map(r=>json(r)));const result=callbackResults.find(r=>r.status==='complete');assert.ok(result);const runId=result.id;assert.equal(providerCalls,1);
    await json(await callback());assert.equal(providerCalls,1);
    assert.equal((await post('research',{action:'execute',studyId,jobId:jobs.find(j=>j.id!==dispatched.results.find(r=>r.status==='submitted').jobId).id,connectionId},'editor')).status,402);
    const run=await json(await get('workbench',{action:'run',id:runId},'viewer'));assert.equal(run.run.normalized.segments[0].text,'Aster is compact.');
    const review=await json(await post('workbench',{action:'record',studyId,kind:'review',payload:{runId,claim:'Aster is compact.',anchor:{segmentIndex:0,start:0,end:17},verdict:'uncertain',evidenceLevel:'observed',materiality:'medium',factIds:[],explanation:'Dimensions need checking.'}},'editor'),201);
    const challenge=await json(await post('intelligence',{action:'challenge',studyId,reviewId:review.id,message:'Which edition was checked?',evidenceUrl:'https://brand-public.com/product',excerpt:'Aster One dimensions'},'viewer'),201);
    assert.equal((await post('intelligence',{action:'resolve_challenge',studyId,id:challenge.id,message:'No',status:'resolved',resolution:'No',evidenceRunIds:[]},'viewer')).status,403);
    let records=(await json(await get('workbench',{action:'state',studyId}))).records;const c=records.find(r=>r.id===challenge.id);
    await json(await post('intelligence',{action:'resolve_challenge',studyId,id:c.id,expectedUpdatedAt:c.updated_at,message:'Checking the edition.',status:'investigating',resolution:'',evidenceRunIds:[runId]},'editor'));
    assert.equal((await post('intelligence',{action:'classification',studyId,runId,brand:'Aster',label:'positive',recommendation:'recommended',rank:1,quote:'Made-up sentence.',explanation:'No',criteria:'No',exceptionQuotes:[]},'editor')).status,400);
    await json(await post('intelligence',{action:'classification',studyId,runId,brand:'Aster',label:'neutral',recommendation:'mentioned',rank:null,quote:'Aster is compact.',explanation:'A dimensional description.',criteria:'Descriptive language without endorsement.',exceptionQuotes:[]},'editor'),201);
    await json(await post('workspace',{action:'draft',studyId,name:'pinned-evidence',payload:{pins:[]},version:0},'viewer'));
    const draft=await json(await post('workspace',{action:'draft',studyId,name:'research-note',payload:{text:'Original'},version:0},'editor'));assert.equal(draft.version,1);
    assert.equal((await post('workspace',{action:'draft',studyId,name:'research-note',payload:{text:'Stale'},version:0},'editor')).status,409);
    assert.equal((await json(await get('workspace',{action:'draft',studyId,name:'research-note'},'owner'))).draft,null);
    const csv='date,source,sessions\n2026-09-19,chatgpt.com,3\n2026-09-20,perplexity.ai,2\n2026-02-31,chatgpt.com,1';
    const imported={studyId,kind:'ga4',csv,mapping:{date:'date',source:'source',count:'sessions'},name:'Referral export',notes:''};
    const preview=await json(await post('intelligence',{action:'traffic_preview',...imported},'editor'));assert.equal(preview.summary.total,5);assert.equal(preview.summary.rejected,1);
    assert.equal((await post('intelligence',{action:'traffic_import',...imported},'editor')).status,400);
    await json(await post('intelligence',{action:'traffic_import',...imported,acceptRejected:true},'editor'),201);
    assert.equal((await post('intelligence',{action:'audit',studyId,url:'https://127.0.0.1/secret'},'editor')).status,400);
    assert.equal((await post('intelligence',{action:'audit',studyId,url:'https://brand-public.com/private'},'editor')).status,400);
    const inspection=await json(await post('intelligence',{action:'audit',studyId,url:'https://brand-public.com/product'},'editor'),201);
    records=(await json(await get('workbench',{action:'state',studyId}))).records;const page=records.find(r=>r.id===inspection.id);assert.equal(page.payload.title,'Aster One');assert.equal(page.payload.schemas[0].valid,true);assert.equal(page.payload.bodyExcerpt.includes('SECRET_SCRIPT_TEXT'),false);
    await json(await post('workspace',{action:'grant_connection',studyId,connectionId,requestLimit:20}));
    const assistant=await json(await post('intelligence',{action:'assistant',studyId,question:'What is described?',runIds:[runId],recordIds:[],provider:'openai',model:'test-model',connectionId},'editor'),201);
    records=(await json(await get('workbench',{action:'state',studyId}))).records;const answer=records.find(r=>r.id===assistant.id);assert.equal(answer.payload.sections.length,1);assert.equal(answer.payload.rejected,1);assert.equal(answer.payload.status,'needs_review');
    const {id:monitorId}=await json(await post('monitoring',{action:'save',studyId,name:'Weekly test',config:{questionIds:[questionId],connectionId,queueConnectionId:queueId,repeats:1,search:'off',maxTokens:1024,cadence:'weekly',hourUTC:13,weekday:1,report:true}}),201);
    const {id:emailId}=await json(await post('workspace',{action:'connection',provider:'resend',label:'Synthetic delivery',model:'',key:'synthetic-email-credential'}),201);
    assert.equal((await post('monitoring',{action:'configure_delivery',studyId,id:monitorId,enabled:true,connectionId:emailId,from:'research@brand-public.com',recipients:['stranger@example.test'],acknowledge:true})).status,400);
    await json(await post('monitoring',{action:'configure_delivery',studyId,id:monitorId,enabled:true,connectionId:emailId,from:'research@brand-public.com',recipients:['owner@example.test','viewer@example.test'],acknowledge:true}));
    await json(await post('monitoring',{action:'activate',studyId,id:monitorId}));const schedule=schedules.at(-1);assert.equal(schedule.headers['upstash-cron'],'0 13 * * 1');
    const tick=()=>mf.dispatchFetch('https://workbench.test/api/dispatch',{method:'POST',headers:{'content-type':'application/json',authorization:schedule.headers['upstash-forward-authorization']},body:JSON.stringify(schedule.body)});
    const tick1=await json(await tick()),tick2=await json(await tick());assert.equal(tick1.batchId,tick2.batchId);assert.equal((await db.prepare('SELECT count(*) n FROM monitor_ticks').first()).n,1);
    const monitorMessage=messages.at(-1);query='Fern is compact.';await json(await mf.dispatchFetch('https://workbench.test/api/dispatch',{method:'POST',headers:{'content-type':'application/json',authorization:monitorMessage.headers['upstash-forward-authorization']},body:JSON.stringify(monitorMessage.body)}));
    const deliveryState=await json(await get('monitoring',{studyId}));assert.equal(deliveryState.notifications.length,1);assert.equal(deliveryState.notifications[0].status,'accepted');assert.equal(emails.length,1);assert.equal(emails[0].body.length,2);assert.equal(emails[0].body[0].text.includes('Bearer'),false);
    await json(await post('monitoring',{action:'deliver_notification',studyId,id:deliveryState.notifications[0].id}));assert.equal(emails.length,1);
    assert.equal((await post('monitoring',{action:'deliver_notification',studyId,id:deliveryState.notifications[0].id},'viewer')).status,403);
    const retryId='a'.repeat(64),expiredId='b'.repeat(64);
    await db.prepare("INSERT INTO notification_outbox (id,owner_id,study_id,monitor_id,connection_id,kind,target_id,payload,status,created_at) SELECT ?,owner_id,study_id,monitor_id,connection_id,kind,target_id,payload,'queued',created_at FROM notification_outbox WHERE id=?").bind(retryId,deliveryState.notifications[0].id).run();
    emailFailure=true;const uncertain=await json(await post('monitoring',{action:'deliver_notification',studyId,id:retryId}));assert.equal(uncertain.status,'uncertain');emailFailure=false;
    await json(await post('monitoring',{action:'deliver_notification',studyId,id:retryId}));assert.equal(emails.at(-1).key,emails.at(-2).key);assert.deepEqual(emails.at(-1).body,emails.at(-2).body);
    await db.prepare("INSERT INTO notification_outbox (id,owner_id,study_id,monitor_id,connection_id,kind,target_id,payload,status,first_attempt,created_at) SELECT ?,owner_id,study_id,monitor_id,connection_id,kind,target_id,payload,'uncertain','2020-01-01T00:00:00.000Z',created_at FROM notification_outbox WHERE id=?").bind(expiredId,deliveryState.notifications[0].id).run();
    const sentCount=emails.length;assert.equal((await post('monitoring',{action:'deliver_notification',studyId,id:expiredId})).status,409);assert.equal(emails.length,sentCount);
    const alert=(await json(await get('workbench',{action:'state',studyId}))).records.find(r=>r.kind==='alert');assert.ok(alert,'Comparable mention change should create a reviewable alert');
    await json(await post('intelligence',{action:'alert_status',studyId,id:alert.id,expectedUpdatedAt:alert.updated_at,status:'acknowledged',note:'Reviewed the pair.'}));
    const reports=(await json(await get('research',{action:'resources',studyId}))).reports;assert.ok(reports.some(r=>r.id===tick1.batchId));
    assert.equal((await get('research',{action:'report_document',studyId,id:tick1.batchId},'viewer')).status,200);
    await json(await post('monitoring',{action:'pause',studyId,id:monitorId}));const paused=await json(await tick());assert.equal(paused.status,'paused');
    // A scheduled batch that ends in a provider failure must still publish its evidence inventory.
    const failingConfig={questionIds:[questionId],connectionId,queueConnectionId:queueId,repeats:1,search:'off',maxTokens:1024,cadence:'daily',hourUTC:13,weekday:1,report:true};
    const failingMonitor=await json(await post('monitoring',{action:'save',studyId,name:'Failure inventory',config:failingConfig}),201);
    await json(await post('monitoring',{action:'activate',studyId,id:failingMonitor.id}));const failedSchedule=schedules.at(-1);
    const failedTick=await json(await mf.dispatchFetch('https://workbench.test/api/dispatch',{method:'POST',headers:{'content-type':'application/json',authorization:failedSchedule.headers['upstash-forward-authorization']},body:JSON.stringify(failedSchedule.body)}));
    providerFailure=true;const failedMessage=messages.at(-1);const failure=await json(await mf.dispatchFetch('https://workbench.test/api/dispatch',{method:'POST',headers:{'content-type':'application/json',authorization:failedMessage.headers['upstash-forward-authorization']},body:JSON.stringify(failedMessage.body)}));assert.equal(failure.status,'failed');
    assert.ok((await json(await get('research',{action:'resources',studyId}))).reports.some(r=>r.id===failedTick.batchId));providerFailure=false;
    assert.equal((await post('intelligence',{action:'classification',studyId,runId:failure.id,brand:'Aster',label:'unknown',recommendation:'absent',rank:null,quote:'',explanation:'No answer',criteria:'No answer',exceptionQuotes:[]})).status,400);
    await db.prepare("UPDATE connections SET ciphertext='unreadable' WHERE id=?").bind(queueId).run();
    const stopped=await json(await post('monitoring',{action:'pause',studyId,id:failingMonitor.id}));assert.equal(stopped.status,'paused');assert.equal(stopped.externalStopped,false);
    const team=await json(await get('workspace',{action:'team',studyId}));await json(await post('workspace',{action:'member',studyId,id:team.members.find(m=>m.email==='viewer@example.test').id,role:'remove'}));
    assert.equal((await get('workbench',{action:'run',id:runId},'viewer')).status,404);
    const revokedId='c'.repeat(64);await db.prepare("INSERT INTO notification_outbox (id,owner_id,study_id,monitor_id,connection_id,kind,target_id,payload,status,created_at) SELECT ?,owner_id,study_id,monitor_id,connection_id,kind,target_id,payload,'queued',created_at FROM notification_outbox WHERE id=?").bind(revokedId,deliveryState.notifications[0].id).run();
    const beforeCancel=emails.length;assert.equal((await json(await post('monitoring',{action:'deliver_notification',studyId,id:revokedId}))).status,'cancelled');assert.equal(emails.length,beforeCancel);
  }finally{await mf.dispose();}
});
