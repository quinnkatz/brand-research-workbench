import { z } from "zod";
import { AppError, boundedText, db, hash } from "./server";
import { connectionFor,openSecret } from "./vault";

export type DeliveryPreferences={enabled:boolean;connectionId:string;from:string;recipients:string[];ownerEmail:string;origin:string};
export type DeliveryRow={id:string;owner_id:string;study_id:string;monitor_id:string;connection_id:string;payload:string;status:string;last_attempt:string|null;first_attempt:string|null;created_at:string;response:string|null;error:string|null};
type Message={from:string;to:[string];subject:string;text:string};
type MonitorRow={id:string;owner_id:string;config:string;name:string};
export async function queueDigest(monitor:MonitorRow,batchId:string,study:{id:string;brand:string},reportReady:boolean){
 const config=JSON.parse(monitor.config) as {delivery?:DeliveryPreferences},delivery=config.delivery;if(!delivery?.enabled)return null;
 const count=await db().prepare("SELECT count(*) n FROM records WHERE study_id=? AND owner_id=? AND kind='alert' AND json_extract(payload,'$.runId') IN (SELECT run_id FROM collection_jobs WHERE batch_id=? AND owner_id=?)").bind(study.id,monitor.owner_id,batchId,monitor.owner_id).first<{n:number}>();
 if(!reportReady&&!count?.n)return null;
 const id=await hash(`digest:${monitor.id}:${batchId}`),now=new Date().toISOString();
 const subject=`${study.brand}: ${reportReady?"your research report is ready":"brand changes to review"}`;
 const text=`${monitor.name}\n\n${count?.n||0} changes between comparable answers need review.${reportReady?" A dated report is saved in your workspace.":""}\n\nOpen your private brand workspace:\n${delivery.origin}/?study=${study.id}&section=${reportReady?"report":"monitoring"}\n\nSign in with your invited account. These observations do not establish a cause or a lasting trend.\n\nThis notification was enabled by the brand workspace owner. Contact them to change delivery preferences.`;
 const payload={ownerEmail:delivery.ownerEmail,messages:delivery.recipients.map((to:string)=>({from:delivery.from,to:[to],subject,text}))};
 await db().prepare("INSERT OR IGNORE INTO notification_outbox (id,owner_id,study_id,monitor_id,connection_id,kind,target_id,payload,status,created_at) VALUES (?,?,?,?,?,'batch_digest',?,?,'queued',?)").bind(id,monitor.owner_id,study.id,monitor.id,delivery.connectionId,batchId,JSON.stringify(payload),now).run();return id;
}

export async function deliverNotification(id:string,ownerId:string){
 const row=await db().prepare("SELECT * FROM notification_outbox WHERE id=? AND owner_id=?").bind(id,ownerId).first<DeliveryRow>();if(!row)throw new AppError("Notification not found.",404);
 if(["accepted","cancelled"].includes(row.status))return {id,status:row.status};
 const now=new Date().toISOString();
 if(row.status==="sending"&&Date.parse(row.last_attempt||"")>Date.now()-60_000)return {id,status:"sending"};
 // Resend retains idempotency keys for 24 hours. Never guess after that window.
 if(row.first_attempt&&Date.parse(row.first_attempt)<Date.now()-23*3600000)throw new AppError("The safe retry window has ended. Check the email provider’s delivery log; this message will not be resent automatically.",409);
 const monitor=await db().prepare("SELECT config FROM monitors WHERE id=? AND owner_id=?").bind(row.monitor_id,ownerId).first<{config:string}>(),config=(monitor?JSON.parse(monitor.config):{}) as {delivery?:DeliveryPreferences},payload=JSON.parse(row.payload) as {ownerEmail:string;messages:Message[]};
 const members=await db().prepare("SELECT email FROM study_members WHERE study_id=?").bind(row.study_id).all<{email:string}>(),allowed=new Set([payload.ownerEmail,...members.results.map(m=>m.email.toLowerCase())]);
 if(!config.delivery?.enabled||config.delivery.connectionId!==row.connection_id||payload.messages.some(m=>!allowed.has(m.to[0])||!config.delivery!.recipients.includes(m.to[0])||m.from!==config.delivery!.from)){
  await db().prepare("UPDATE notification_outbox SET status='cancelled',error='Delivery settings or recipient access changed.' WHERE id=? AND status!='accepted'").bind(id).run();return {id,status:"cancelled"};
 }
 const connection=await connectionFor(ownerId,row.connection_id,"resend"),key=await openSecret(connection);
 const claim=await db().prepare("UPDATE notification_outbox SET status='sending',first_attempt=coalesce(first_attempt,?),last_attempt=?,error=NULL WHERE id=? AND status=? AND coalesce(last_attempt,'')=?").bind(now,now,id,row.status,row.last_attempt||"").run();if(!claim.meta.changes)return {id,status:"sending"};
 let status="uncertain",message="Delivery outcome is uncertain. Inspect the provider log or retry within 23 hours using the same delivery key.",response:{emailIds:string[];acceptedAt:string}|null=null;
 try{
  const result=await fetch("https://api.resend.com/emails/batch",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json","Idempotency-Key":`brand-notification/${id}`},body:JSON.stringify(payload.messages),signal:AbortSignal.timeout(8000),redirect:"manual"});
  const raw=await boundedText(result.body,100000);const data=z.object({data:z.array(z.object({id:z.string()}))}).safeParse((()=>{try{return JSON.parse(raw);}catch{return null;}})());
  if(result.ok&&data.success&&data.data.data.length===payload.messages.length){status="accepted";message="";response={emailIds:data.data.data.map(m=>m.id),acceptedAt:now};}
  else if(result.status>=400&&result.status<500){status="failed";message=`Email provider rejected the request (HTTP ${result.status}). Check the verified sender, credential, and provider limits.`;}
 }catch{}
 await db().prepare("UPDATE notification_outbox SET status=?,response=?,error=? WHERE id=? AND last_attempt=?").bind(status,response?JSON.stringify(response):null,message||null,id,now).run();
 return {id,status,note:message||"Accepted by email provider. Inbox delivery has not been verified."};
}
