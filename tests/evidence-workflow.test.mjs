import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import test from 'node:test';
const require=createRequire(import.meta.url),{Miniflare}=createRequire(require.resolve('wrangler/package.json'))('miniflare');
test('Complete-study search, pagination, context, comparisons and export include evidence older than the loaded 500',async()=>{
 const mf=new Miniflare({modules:['index.js',...readdirSync('dist/server',{recursive:true}).filter(p=>/\.m?js$/.test(p)&&p!=='index.js')].map(p=>({type:'ESModule',path:resolve('dist/server',p)})),modulesRoot:resolve('dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'], bindings: { AUTH_MODE: 'sites' },d1Databases:['DB'],r2Buckets:['BUCKET']});
 try{
  const db=await mf.getD1Database('DB');for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())for(const s of readFileSync(`drizzle/${file}`,'utf8').split('--> statement-breakpoint').filter(s=>s.trim()))await db.prepare(s).run();
  const headers={'oai-authenticated-user-id':'owner','oai-authenticated-user-email':'owner@example.test',origin:'https://workbench.test','content-type':'application/json'};
  const get=(p,user='owner')=>mf.dispatchFetch(`https://workbench.test/api/explore?${new URLSearchParams(p)}`,{headers:{...headers,'oai-authenticated-user-id':user}});
  const response=await mf.dispatchFetch('https://workbench.test/api/research',{method:'POST',headers,body:JSON.stringify({action:'onboard',brand:'Aster',website:'https://aster.example',profile:{},questions:[]})});assert.equal(response.status,201,await response.clone().text());const {id:studyId}=await response.json();
  const oldId=crypto.randomUUID(),afterId=crypto.randomUUID(),privateStudy=crypto.randomUUID();await db.prepare("INSERT INTO studies(id,owner_id,name,brand,website,objective,created_at) VALUES(?,'other','Private','Private','','','2026-01-01')").bind(privateStudy).run();
  const normalized=(answer)=>JSON.stringify({parser_version:'test',completion:'complete',segments:[{text:answer,raw_path:'$.synthetic'}],sources:[{url:'https://source.example/care',role:'cited',raw_path:'$.synthetic'}],tool_events:[],citations:[],warnings:[],model_reported:'test-model'});
  const insert=(id,owner,study,prompt,answer,date,settings={})=>db.prepare("INSERT INTO runs(id,owner_id,study_id,provider,environment,model,prompt,status,search,settings,normalized,created_at) VALUES(?,?,?,'openai','api','test-model',?,'complete','off',?,?,?)").bind(id,owner,study,prompt,JSON.stringify(settings),normalized(answer),date);
  const settings={questionVersion:'frozen',questionContext:{topic:'Care',market:'US',purpose:'baseline'}};
  await db.batch([insert(oldId,'owner',studyId,'What is durable?','Aster uses porcelain filters.','2026-08-01T12:00:00.000Z',settings),insert(afterId,'owner',studyId,'What is durable?','Fern uses steel.','2026-09-02T12:00:00.000Z',settings),insert(crypto.randomUUID(),'other',privateStudy,'What is porcelain?','Private porcelain answer.','2026-09-02T12:00:00.000Z')]);
  for(let offset=0;offset<520;offset+=65)await db.batch(Array.from({length:65},(_,i)=>insert(crypto.randomUUID(),'owner',studyId,`Routine question ${offset+i}`,'Aster care instructions.','2026-09-10T12:00:00.000Z')));
  const search=await get({studyId,q:'porcelain'});assert.equal(search.status,200,await search.clone().text());const found=await search.json();assert.equal(found.total,1);assert.equal(found.results[0].id,oldId);assert.equal(found.results[0].quote,'Aster uses porcelain filters.');
  const filtered=await (await get({studyId,topic:'Care',market:'US'})).json();assert.equal(filtered.total,2);
  const first=await (await get({studyId,q:'care'})).json();assert.equal(first.results.length,30);assert.equal(first.total,522);const second=await (await get({studyId,q:'care',cursor:first.nextCursor,asOf:first.asOf})).json();assert.equal(new Set([...first.results,...second.results].map(r=>r.id)).size,60);
  const urls=await (await get({studyId,q:'source.example'})).json();assert.equal(urls.total,522);
  assert.equal((await get({studyId},'stranger')).status,404);
  const comparison=await (await get({studyId,action:'compare',beforeFrom:'2026-08-01',beforeTo:'2026-08-31',afterFrom:'2026-09-01',afterTo:'2026-09-30',environment:'api'})).json();assert.equal(comparison.denominator,1);assert.equal(comparison.change,-100);assert.equal(comparison.pairs[0].before.id,oldId);
  const allMetrics=await (await get({studyId,action:'metrics',environment:'api'})).json();assert.equal(allMetrics.coverage,'complete_study');assert.equal(allMetrics.metrics.eligible.length,522);assert.equal(allMetrics.metrics.brands[0].mentions,521);assert.equal(allMetrics.metrics.domains[0].runIds.length,522);
  const archive=await get({studyId,action:'export'});assert.equal(archive.status,200);const rows=(await archive.text()).trim().split('\n').map(JSON.parse);assert.equal(rows.at(-1).complete,true);assert.equal(rows.at(-1).counts.runs,522);assert.equal(rows.filter(r=>r.type==='runs').some(r=>r.value.id===oldId),true);assert.equal(JSON.stringify(rows).includes('owner_id'),false);assert.equal(JSON.stringify(rows).includes('Private porcelain'),false);
 }finally{await mf.dispose();}
});
