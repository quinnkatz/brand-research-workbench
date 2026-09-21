import { AppError, bucket, db, hash, publicRecord, publicRun } from "./server";
import { appendRecord, publicStudy } from "./research-server";
import { dispatchJob } from "./queue";
import { answerOf, type Run } from "./research";
import { eligible, mentioned } from "./analytics";
import { buildClientReport, reportRecords } from "./report";

export async function monitorTick(monitor:any,origin:string) {
  if(monitor.status!=="active")return {status:monitor.status};
  const config=JSON.parse(monitor.config),now=new Date().toISOString();
  // Configured schedules run at most once daily; retries on the same UTC day reuse their batch.
  const tickId=await hash(`${monitor.id}:${now.slice(0,10)}`),existing=await db().prepare("SELECT batch_id FROM monitor_ticks WHERE id=?").bind(tickId).first<any>();
  let batchId=existing?.batch_id;
  if(!batchId){
    batchId=crypto.randomUUID();
    const statements=[db().prepare("INSERT OR IGNORE INTO monitor_ticks (id,monitor_id,batch_id,created_at) VALUES (?,?,?,?)").bind(tickId,monitor.id,batchId,now)];
    for(const q of config.questions)for(let i=1;i<=config.repeats;i++){
      const id=await hash(`${tickId}:${q.id}:${i}`);
      statements.push(db().prepare("INSERT OR IGNORE INTO collection_jobs (id,owner_id,study_id,batch_id,batch_name,provider,model,prompt,question_id,repeat_index,status,settings,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,'queued',?,?,? WHERE (SELECT batch_id FROM monitor_ticks WHERE id=?)=?")
        .bind(id,monitor.owner_id,monitor.study_id,batchId,`${monitor.name} · ${now.slice(0,10)}`,config.provider,config.model,q.prompt,q.id,String(i),JSON.stringify({search:config.search,maxTokens:config.maxTokens,intent:q.intent,origin:q.origin,monitorId:monitor.id,brandProfileSnapshot:config.profile,connectionId:config.connectionId,questionVersion:q.version,questionContext:{audience:q.audience||"",market:q.market||"",language:q.language||"",productId:q.productId,productSnapshot:q.productSnapshot}}),now,now,tickId,batchId));
    }
    await db().batch(statements);batchId=(await db().prepare("SELECT batch_id FROM monitor_ticks WHERE id=?").bind(tickId).first<any>()).batch_id;
  }
  const jobs=(await db().prepare("SELECT * FROM collection_jobs WHERE owner_id=? AND batch_id=?").bind(monitor.owner_id,batchId).all<any>()).results;
  const result=[];for(const job of jobs){try{result.push(await dispatchJob(monitor.owner_id,job,config.connectionId,config.queueConnectionId,origin));}catch(e){result.push({jobId:job.id,status:"blocked",error:e instanceof AppError?e.message:"Dispatch could not be completed."});if(e instanceof AppError&&e.status===402){await db().prepare("UPDATE monitors SET status='allowance_exhausted',updated_at=? WHERE id=?").bind(now,monitor.id).run();break;}}}
  await db().prepare("UPDATE monitors SET last_tick=?,updated_at=? WHERE id=?").bind(now,now,monitor.id).run();return {batchId,jobs:result};
}

export async function afterCollection(ownerId:string,runId:string) {
  const row=await db().prepare("SELECT * FROM runs WHERE id=? AND owner_id=?").bind(runId,ownerId).first<any>();if(!row)return;
  const current=publicRun(row);if(!current.settings.batchId)return;
  const studyRow=await db().prepare("SELECT * FROM studies WHERE id=? AND owner_id=?").bind(current.study_id,ownerId).first<any>();if(!studyRow)return;
  const study=publicStudy(studyRow);
  const previousRows=await db().prepare("SELECT * FROM runs WHERE study_id=? AND owner_id=? AND provider=? AND environment=? AND model=? AND prompt=? AND search=? AND created_at < ? ORDER BY created_at DESC LIMIT 10").bind(current.study_id,ownerId,current.provider,current.environment,current.model,current.prompt,current.search,current.created_at).all<any>();
  const previous=previousRows.results.map(publicRun).find(r=>eligible(r)&&r.settings.repeatIndex===current.settings.repeatIndex&&JSON.stringify(r.settings.brandProfileSnapshot)===JSON.stringify(current.settings.brandProfileSnapshot)&&r.settings.maxTokens===current.settings.maxTokens);
  if(eligible(current)&&previous){
    const names=[study.brand,...(study.profile.aliases||[])];
    const before=mentioned(answerOf(previous),names),after=mentioned(answerOf(current),names);
    const oldSources=new Set(previous.normalized?.sources.map(s=>s.url)),newSources=[...new Set(current.normalized?.sources.map(s=>s.url)||[])];
    const added=newSources.filter(s=>!oldSources.has(s)),removed=[...oldSources].filter(s=>!newSources.includes(s));
    if(before!==after||added.length||removed.length){
      const alertId=await hash(`alert:${current.id}`),timestamp=new Date().toISOString();
      await db().prepare("INSERT OR IGNORE INTO records (id,owner_id,study_id,kind,payload,created_at,updated_at) VALUES (?,?,?,'alert',?,?,?)").bind(alertId,ownerId,current.study_id,JSON.stringify({title:before&&!after?"Brand mention absent in the latest comparable answer":!before&&after?"Brand appeared in the latest comparable answer":"The disclosed sources changed",runId:current.id,previousRunId:previous.id,question:current.prompt,provider:current.provider,environment:current.environment,model:current.model,beforeMention:before,afterMention:after,addedSources:added,removedSources:removed,status:"unreviewed",criterion:"Exact brand/alias presence and exact disclosed URL sets; same question, model, method, search setting, repetition, and saved profile.",caution:"A change between observations does not establish a trend or its cause."}),timestamp,timestamp).run();
    }
  }
  const batchId=current.settings.batchId,monitorId=current.settings.monitorId;
  if(!batchId||!monitorId)return;
  const pending=await db().prepare("SELECT count(*) AS n FROM collection_jobs WHERE batch_id=? AND owner_id=? AND status IN ('queued','running')").bind(batchId,ownerId).first<any>();if(pending?.n)return;
  const monitor=await db().prepare("SELECT * FROM monitors WHERE id=? AND owner_id=?").bind(monitorId,ownerId).first<any>();if(!monitor||!JSON.parse(monitor.config).report)return;
  if(await db().prepare("SELECT id FROM report_snapshots WHERE id=?").bind(batchId).first())return;
  const runs=(await db().prepare("SELECT r.* FROM runs r JOIN collection_jobs j ON j.run_id=r.id WHERE j.batch_id=? AND j.owner_id=? ORDER BY r.created_at").bind(batchId,ownerId).all()).results.map(publicRun);
  const records=reportRecords(runs,(await db().prepare("SELECT * FROM records WHERE study_id=? AND owner_id=?").bind(current.study_id,ownerId).all()).results.map(publicRecord));
  const createdAt=new Date().toISOString(),title=`${monitor.name} · ${createdAt.slice(0,10)}`,key=`${ownerId}/reports/${batchId}.json`;
  await bucket().put(key,JSON.stringify({title,study,runs,records,createdAt,html:buildClientReport(study,runs,records,false,createdAt)}),{httpMetadata:{contentType:"application/json"}});
  await db().prepare("INSERT OR IGNORE INTO report_snapshots (id,owner_id,study_id,title,token_hash,object_key,created_at,expires_at) VALUES (?,?,?,?,?,?,?,?)").bind(batchId,ownerId,current.study_id,title,await hash(crypto.randomUUID()),key,createdAt,new Date(Date.now()+30*86400000).toISOString()).run();
}
