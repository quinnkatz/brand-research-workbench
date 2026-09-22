import { getChatGPTUser } from "@/app/chatgpt-auth";
import { deliverNotification } from "@/lib/notifications";
import { z } from "zod";
import { AppError, audit, db, failure, hash, idSchema, jsonBody, ownStudy, owner, reply } from "@/lib/server";
import { connectionFor, openSecret } from "@/lib/vault";
import { callbackReachable, dispatchJob, queueRequest, randomToken } from "@/lib/queue";
export const dynamic="force-dynamic";
const configSchema=z.object({questionIds:z.array(idSchema).min(1).max(20),connectionId:idSchema,queueConnectionId:idSchema,repeats:z.number().int().min(1).max(3),search:z.enum(["auto","off"]),maxTokens:z.number().int().min(256).max(8192),cadence:z.enum(["daily","weekly"]),hourUTC:z.number().int().min(0).max(23),weekday:z.number().int().min(0).max(6),report:z.boolean()});
export async function GET(req:Request){try{
  const actor=await owner(req),p=new URL(req.url).searchParams,studyId=idSchema.parse(p.get("studyId")),study=await ownStudy(studyId,actor);
  const rows=await db().prepare("SELECT id,name,config,status,schedule_id,last_tick,created_at,updated_at FROM monitors WHERE study_id=? AND owner_id=? ORDER BY created_at DESC").bind(studyId,study.owner_id).all<any>();
  const tickets=await db().prepare("SELECT t.job_id,t.status,t.message_id,t.error,t.created_at,t.expires_at FROM execution_tickets t JOIN collection_jobs j ON j.id=t.job_id WHERE j.study_id=? AND t.owner_id=? ORDER BY t.created_at DESC LIMIT 200").bind(studyId,study.owner_id).all();
  const notifications=await db().prepare("SELECT id,kind,target_id,status,response,error,first_attempt,last_attempt,created_at FROM notification_outbox WHERE study_id=? AND owner_id=? ORDER BY created_at DESC LIMIT 100").bind(studyId,study.owner_id).all();
  const recipients=study.access_role==="owner"?[...new Set([(await getChatGPTUser())!.email.toLowerCase(),...(await db().prepare("SELECT email FROM study_members WHERE study_id=?").bind(studyId).all<any>()).results.map(m=>m.email.toLowerCase())])]:[];
  return reply({notifications:notifications.results,recipients,monitors:rows.results.map(r=>({...r,config:JSON.parse(r.config)})),tickets:tickets.results,canManage:study.access_role==="owner"});
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
  const actor=await owner(req,true),body=await jsonBody(req),studyId=idSchema.parse(body.studyId),study=await ownStudy(studyId,actor,"owner"),now=new Date().toISOString(),origin=new URL(req.url).origin;
  if(body.action==="deliver_notification"){
    const id=z.string().regex(/^[a-f0-9]{64}$/).parse(body.id),row=await db().prepare("SELECT id FROM notification_outbox WHERE id=? AND study_id=? AND owner_id=?").bind(id,studyId,actor).first();if(!row)throw new AppError("Notification not found.",404);
    const result=await deliverNotification(id,actor);await audit(studyId,actor,"notification_delivery_requested",id,{status:result.status});return reply(result);
  }
  if(body.action==="configure_delivery"){
    const v=z.object({id:idSchema,enabled:z.boolean(),connectionId:idSchema.optional(),from:z.string().email().optional(),recipients:z.array(z.string().email()).max(10).default([]),acknowledge:z.literal(true)}).parse(body);
    const monitor=await db().prepare("SELECT id FROM monitors WHERE id=? AND study_id=? AND owner_id=?").bind(v.id,studyId,actor).first();if(!monitor)throw new AppError("Monitor not found.",404);
    const ownerEmail=(await getChatGPTUser())!.email.toLowerCase(),members=await db().prepare("SELECT email FROM study_members WHERE study_id=?").bind(studyId).all<any>(),allowed=new Set([ownerEmail,...members.results.map(m=>m.email.toLowerCase())]),recipients=[...new Set(v.recipients.map(s=>s.toLowerCase()))];
    if(v.enabled){if(!v.connectionId||!v.from||!recipients.length)throw new AppError("Choose a delivery connection, verified sender, and at least one recipient.");await connectionFor(actor,v.connectionId,"resend");if(recipients.some(email=>!allowed.has(email)))throw new AppError("Recipients must be the owner or accepted members of this brand workspace.");}
    const delivery={enabled:v.enabled,connectionId:v.connectionId,from:v.from,recipients,ownerEmail,origin};
    await db().batch([db().prepare("UPDATE monitors SET config=json_set(config,'$.delivery',json(?)),updated_at=? WHERE id=?").bind(JSON.stringify(delivery),now,v.id),db().prepare("UPDATE notification_outbox SET status='cancelled',error='Delivery settings changed.' WHERE monitor_id=? AND status IN ('queued','failed','uncertain')").bind(v.id)]);
    await audit(studyId,actor,"notification_preferences_changed",v.id,{enabled:v.enabled,recipients:recipients.length});return reply({id:v.id,delivery});
  }
  if(body.action==="probe")return reply({reachable:await callbackReachable(origin),origin});
  if(body.action==="dispatch"){
    const v=z.object({batchId:idSchema,queueConnectionId:idSchema,connections:z.record(idSchema)}).parse(body);
    if(!await callbackReachable(origin))throw new AppError("Background delivery cannot reach this application. The operator must make the application’s callback route reachable before starting unattended work. Your saved plan is unchanged.",409);
    const jobs=(await db().prepare("SELECT * FROM collection_jobs WHERE study_id=? AND owner_id=? AND batch_id=? AND status='queued' LIMIT 100").bind(studyId,actor,v.batchId).all<any>()).results;
    if(!jobs.length)throw new AppError("No queued requests remain in this plan.");
    for(const job of jobs){if(!v.connections[job.provider])throw new AppError(`Choose a saved connection for ${job.provider}.`);await connectionFor(actor,v.connections[job.provider],job.provider);}
    const results=[];for(const job of jobs){try{results.push(await dispatchJob(actor,job,v.connections[job.provider],v.queueConnectionId,origin));}catch(e){results.push({jobId:job.id,status:"blocked",error:e instanceof AppError?e.message:"Dispatch could not be completed."});}}
    await audit(studyId,actor,"batch_dispatched",v.batchId,{requests:results.length});return reply({results});
  }
  if(body.action==="recover_delivery"){
    const v=z.object({jobId:z.string().regex(/^[a-f0-9]{64}$/),queueConnectionId:idSchema,acknowledge:z.literal(true)}).parse(body);
    if(!await callbackReachable(origin))throw new AppError("Background callbacks remain unreachable.",409);
    const job=await db().prepare("SELECT * FROM collection_jobs WHERE id=? AND study_id=? AND owner_id=?").bind(v.jobId,studyId,actor).first<any>();
    if(!job||job.status!=="queued")throw new AppError("Only a provider request that has never started can have its delivery replaced.",409);
    const ticket=await db().prepare("SELECT * FROM execution_tickets WHERE job_id=? AND owner_id=?").bind(job.id,actor).first<any>();
    if(!ticket||Date.parse(ticket.created_at)>Date.now()-15*60_000)throw new AppError("Wait at least 15 minutes and inspect queue delivery before replacing the ticket.",409);
    await connectionFor(actor,v.queueConnectionId,"qstash");
    const removed=await db().prepare("DELETE FROM execution_tickets WHERE id=? AND EXISTS (SELECT 1 FROM collection_jobs WHERE id=? AND status='queued')").bind(ticket.id,job.id).run();
    if(!removed.meta.changes)throw new AppError("This request has started or changed. Refresh its status.",409);
    const result=await dispatchJob(actor,job,ticket.connection_id,v.queueConnectionId,origin);await audit(studyId,actor,"delivery_replaced",job.id,{previousTicket:ticket.id});return reply(result);
  }
  if(body.action==="save"){
    const v=z.object({id:idSchema.optional(),name:z.string().trim().min(1).max(120),config:configSchema}).parse(body);
    if(v.id){const previous=await db().prepare("SELECT status FROM monitors WHERE id=? AND study_id=? AND owner_id=?").bind(v.id,studyId,actor).first<any>();if(!previous)throw new AppError("Monitor not found.",404);if(["active","activating","activation_unknown"].includes(previous.status))throw new AppError("Pause the monitor before changing its protocol.",409);}
    const connection=await connectionFor(actor,v.config.connectionId);if(!["openai","anthropic","gemini","perplexity_api","xai"].includes(connection.provider)||!connection.model)throw new AppError("Choose a saved provider connection with a model ID.");
    await connectionFor(actor,v.config.queueConnectionId,"qstash");
    const grant=await db().prepare("SELECT request_limit,used_requests FROM study_connections WHERE study_id=? AND connection_id=?").bind(studyId,connection.id).first<any>();
    if(!grant||grant.request_limit<=grant.used_requests)throw new AppError("Authorize a remaining request allowance for this brand before scheduling it.");
    const all=(await db().prepare("SELECT id,payload,updated_at FROM records WHERE study_id=? AND owner_id=? AND kind='question'").bind(studyId,actor).all<any>()).results;
    const questions=[...new Set(v.config.questionIds)].map(id=>{const row=all.find(r=>r.id===id);if(!row)throw new AppError("A selected question is unavailable.");return {id,version:row.updated_at,...JSON.parse(row.payload)};});
    const config={...v.config,provider:connection.provider,model:connection.model,questions,profile:JSON.parse(study.profile)};
    const id=v.id||crypto.randomUUID();
    if(v.id)await db().prepare("UPDATE monitors SET name=?,config=?,status='paused',updated_at=? WHERE id=? AND owner_id=?").bind(v.name,JSON.stringify(config),now,id,actor).run();
    else await db().prepare("INSERT INTO monitors (id,owner_id,study_id,name,config,status,token_hash,created_at,updated_at) VALUES (?,?,?,?,?,'paused',?,?,?)").bind(id,actor,studyId,v.name,JSON.stringify(config),await hash(randomToken()),now,now).run();
    await audit(studyId,actor,"monitor_saved",id,{questions:questions.length,requestsPerRun:questions.length*v.config.repeats});return reply({id},201);
  }
  const id=idSchema.parse(body.id),monitor=await db().prepare("SELECT * FROM monitors WHERE id=? AND study_id=? AND owner_id=?").bind(id,studyId,actor).first<any>();if(!monitor)throw new AppError("Monitor not found.",404);
  const config=JSON.parse(monitor.config);
  if(body.action==="activate"){
    if(["active","activating"].includes(monitor.status))throw new AppError("This schedule is already active or activating. Pause it before replacing it.",409);
    const queue=await connectionFor(actor,config.queueConnectionId,"qstash"),key=await openSecret(queue);
    if(!await callbackReachable(origin))throw new AppError("Background delivery cannot reach this application. Resolve callback access in Connections before activating this schedule.",409);
    const token=randomToken(),scheduleId=`brand-${id}`,cron=`0 ${config.hourUTC} * * ${config.cadence==="weekly"?config.weekday:"*"}`;
    // Activate the database credential first. A failed external operation is visible as activation_unknown.
    await db().prepare("UPDATE monitors SET status='activating',token_hash=?,schedule_id=?,updated_at=? WHERE id=?").bind(await hash(token),scheduleId,now,id).run();
    try{
      const result=await queueRequest(key,`/v2/schedules/${origin}/api/dispatch`,{type:"monitor",monitorId:id},{"Upstash-Cron":cron,"Upstash-Schedule-Id":scheduleId,"Upstash-Forward-Authorization":`Bearer ${token}`,"Upstash-Retries":"3","Upstash-Timeout":"180s","Upstash-Redact-Fields":"body,headers"});
      await db().prepare("UPDATE monitors SET status='active',schedule_id=?,updated_at=? WHERE id=?").bind(String(result.scheduleId||scheduleId),now,id).run();
    }catch(e){await db().prepare("UPDATE monitors SET status='activation_unknown' WHERE id=?").bind(id).run();throw e;}
    await audit(studyId,actor,"monitor_activated",id,{cron,timezone:"UTC"});return reply({id,status:"active"});
  }
  if(body.action==="pause"){
    // Local pause blocks future callbacks immediately, even if queue deletion fails.
    await db().prepare("UPDATE monitors SET status='paused',updated_at=? WHERE id=?").bind(now,id).run();
    let externalStopped=true;
    if(monitor.schedule_id)try{const queue=await connectionFor(actor,config.queueConnectionId,"qstash"),key=await openSecret(queue);await queueRequest(key,`/v2/schedules/${encodeURIComponent(monitor.schedule_id)}`,{}, {},"DELETE");}catch{externalStopped=false;}
    await audit(studyId,actor,"monitor_paused",id,{externalStopped});return reply({id,status:"paused",externalStopped,note:externalStopped?null:"Collection is paused locally. Remove the schedule in your queue account to stop delivery charges."});
  }
  throw new AppError("Unknown monitoring operation.",404);
}catch(e){return failure(e);}}
