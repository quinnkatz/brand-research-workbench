import { AppError, boundedText, db, hash } from "./server";
import { connectionFor, openSecret, reserveRequest } from "./vault";

export const queueOrigin = "https://qstash-eu-central-1.upstash.io";
export const randomToken = () => crypto.randomUUID().replaceAll("-","") + crypto.randomUUID().replaceAll("-","");
export async function queueRequest(key:string,path:string,body:unknown,headers:Record<string,string>={},method="POST") {
  const response = await fetch(`${queueOrigin}${path}`,{method,headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json",...headers},...(method!=="GET"?{body:JSON.stringify(body)}:{}),redirect:"manual",signal:AbortSignal.timeout(20000)});
  const text=await boundedText(response.body,100000);
  if(!response.ok) throw new AppError(`The background queue returned HTTP ${response.status}. Check the queue account and its delivery limits.`,502);
  if(!text.trim())return {};
  try{return JSON.parse(text);}catch{throw new AppError("The queue returned an unreadable result. Check its delivery log before retrying.",502);}
}
export async function callbackReachable(origin:string) {
  try{
    if(new URL(origin).protocol!=="https:")return false;
    const response=await fetch(`${origin}/api/dispatch`,{redirect:"manual",signal:AbortSignal.timeout(10000)});
    if(response.status!==200){await response.body?.cancel();return false;}
    const data:any=JSON.parse(await boundedText(response.body,1000));return data.service==="brand-research-dispatch-v1";
  }catch{return false;}
}
export async function dispatchJob(ownerId:string,job:any,connectionId:string,queueConnectionId:string,origin:string) {
  if(job.owner_id!==ownerId)throw new AppError("Collection item not found.",404);
  if(job.status!=="queued")return {jobId:job.id,status:job.status};
  const provider=await connectionFor(ownerId,connectionId,job.provider);await openSecret(provider);
  const queue=await connectionFor(ownerId,queueConnectionId,"qstash"), key=await openSecret(queue);
  const existing=await db().prepare("SELECT status,message_id FROM execution_tickets WHERE job_id=?").bind(job.id).first<any>();
  if(existing)return {jobId:job.id,status:existing.status,messageId:existing.message_id,alreadyDispatched:true};
  await reserveRequest(job.study_id,connectionId,job.id);
  const id=crypto.randomUUID(),token=randomToken(),now=new Date().toISOString();
  const inserted=await db().prepare("INSERT OR IGNORE INTO execution_tickets (id,job_id,owner_id,connection_id,token_hash,status,created_at,expires_at) VALUES (?,?,?,?,?,'dispatching',?,?)").bind(id,job.id,ownerId,connectionId,await hash(token),now,new Date(Date.now()+7*86400000).toISOString()).run();
  if(!inserted.meta.changes)return {jobId:job.id,status:"dispatching",alreadyDispatched:true};
  try{
    const data=await queueRequest(key,`/v2/publish/${origin}/api/dispatch`,{type:"job",ticketId:id},{"Upstash-Forward-Authorization":`Bearer ${token}`,"Upstash-Retries":"3","Upstash-Timeout":"180s","Upstash-Deduplication-Id":`${job.id}-${id}`,"Upstash-Flow-Control-Key":`brand-${job.study_id}`,"Upstash-Flow-Control-Value":"parallelism=2, rate=20, period=1m","Upstash-Redact-Fields":"body,headers"});
    await db().prepare("UPDATE execution_tickets SET status='submitted',message_id=? WHERE id=? AND status='dispatching'").bind(String(data.messageId||""),id).run();
    return {jobId:job.id,status:"submitted",messageId:data.messageId};
  }catch{
    await db().prepare("UPDATE execution_tickets SET status='delivery_unknown',error=? WHERE id=? AND status='dispatching'").bind("The queue submission was not confirmed. Inspect delivery before replacing it; it may already be processing.",id).run();
    return {jobId:job.id,status:"delivery_unknown"};
  }
}
