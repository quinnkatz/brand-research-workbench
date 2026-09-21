import { z } from "zod";
import { AppError, db, failure, hash, idSchema, jsonBody, reply } from "@/lib/server";
import { executeJob } from "@/lib/research-server";
import { savedKey } from "@/lib/vault";
import { afterCollection, monitorTick } from "@/lib/monitoring";
export const dynamic="force-dynamic";
export async function GET(){return reply({service:"brand-research-dispatch-v1"});}
export async function POST(req:Request){
  try{
    const token=req.headers.get("authorization")?.replace(/^Bearer /,"");if(!token||!/^[a-f0-9]{64}$/.test(token))throw new AppError("Invalid delivery credential.",401);
    const digest=await hash(token),body=await jsonBody(req),now=new Date().toISOString();
    if(body.type==="monitor"){
      const id=idSchema.parse(body.monitorId),monitor=await db().prepare("SELECT * FROM monitors WHERE id=? AND token_hash=?").bind(id,digest).first<any>();
      if(!monitor)throw new AppError("Invalid delivery credential.",401);
      return reply(await monitorTick(monitor,new URL(req.url).origin));
    }
    const id=idSchema.parse(body.ticketId),ticket=await db().prepare("SELECT * FROM execution_tickets WHERE id=? AND token_hash=? AND expires_at>?").bind(id,digest,now).first<any>();
    if(!ticket)throw new AppError("Invalid or expired delivery credential.",401);
    const job=await db().prepare("SELECT * FROM collection_jobs WHERE id=? AND owner_id=?").bind(ticket.job_id,ticket.owner_id).first<any>();
    if(!job)throw new AppError("Collection item unavailable.",404);
    if(job.status!=="queued"){
      if(job.run_id&&job.status!=="running")await afterCollection(ticket.owner_id,job.run_id);
      return reply({status:job.status,alreadyStarted:true});
    }
    const key=await savedKey(ticket.owner_id,job.study_id,job.provider,ticket.connection_id,job.id);
    const result=await executeJob(ticket.owner_id,job.id,key);
    await db().prepare("UPDATE execution_tickets SET status=? WHERE id=?").bind(result.status==="complete"?"complete":"needs_attention",id).run();
    if(result.id)await afterCollection(ticket.owner_id,result.id);
    return reply(result);
  }catch(e){return failure(e);}
}
