import { z } from 'zod';
import { AppError, audit, bucket, db, failure, idSchema, jsonBody, ownStudy, owner, reply, publicRecord } from '@/lib/server';
import { surfaces } from '@/lib/investigation';
import { coverageData, getStudyRun, putRecord, studyRecords } from '@/lib/investigation-server';
import { captureSource, captureText } from '@/lib/source-capture';
import { validAnchor } from '@/lib/claims';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{const actor=await owner(req),p=new URL(req.url).searchParams,studyId=idSchema.parse(p.get('studyId')),study=await ownStudy(studyId,actor),uid=study.owner_id;
  if(p.get('action')==='coverage')return reply(await coverageData(uid,studyId));
  if(p.get('action')==='source'||p.get('action')==='source_original'){
    const id=idSchema.parse(p.get('id')),row=await db().prepare("SELECT * FROM records WHERE id=? AND study_id=? AND owner_id=? AND kind='source'").bind(id,studyId,uid).first();if(!row)throw new AppError('Source not found.',404);const source=publicRecord(row);const text=await captureText(uid,source);
    if(p.get('action')==='source')return reply({source,text});const file=await bucket().get(`${uid}/captures/${source.payload.captureId}/original`);if(!file)throw new AppError('Original source unavailable.',404);return new Response(file.body,{headers:{'Content-Type':'application/octet-stream','Content-Disposition':`attachment; filename="source-${id}.bin"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }throw new AppError('Unknown investigation operation.',404);
}catch(e){return failure(e);}}
export async function POST(req:Request){try{
  const actor=await owner(req,true),body=await jsonBody(req),studyId=idSchema.parse(body.studyId),study=await ownStudy(studyId,actor,'write'),uid=study.owner_id,all=await studyRecords(uid,studyId);
  let id:string;let captureResult:Record<string,unknown>={};
  if(body.action==='coverage'){
    const v=z.object({questionId:idSchema,surface:z.string().refine(s=>surfaces.some(([v])=>v===s)),expected:z.number().int().min(1).max(20),id:idSchema.optional(),expectedUpdatedAt:z.string().optional()}).parse(body);const q=all.find(r=>r.id===v.questionId&&r.kind==='question');if(!q)throw new AppError('Choose a saved question.');const existing=all.find(r=>r.kind==='coverage'&&r.payload.questionId===q.id&&r.payload.questionVersion===q.updated_at&&r.payload.surface===v.surface);if(existing&&!v.id)throw new AppError('This question and surface already have a target. Edit its repetitions.',409);if(v.id&&!existing)throw new AppError('Create a new target for this updated question version.');if(v.id!==existing?.id&&v.id)throw new AppError('Choose the matching coverage target.');
    id=await putRecord(uid,studyId,'coverage',{questionId:q.id,questionVersion:q.updated_at,prompt:q.payload.prompt,context:q.payload,surface:v.surface,expected:v.expected,actorId:actor},v.id,v.expectedUpdatedAt);
  }else if(body.action==='assign'){
    const v=z.object({runId:idSchema,targetId:idSchema,expectedUpdatedAt:z.string().optional()}).parse(body),run=await getStudyRun(uid,studyId,v.runId),target=all.find(r=>r.kind==='coverage'&&r.id===v.targetId);if(!target||target.payload.surface!==`${run.environment}:${run.provider}`)throw new AppError('Assign an observation to its exact platform and collection method.');const old=all.find(r=>r.kind==='assignment'&&r.payload.runId===run.id);id=await putRecord(uid,studyId,'assignment',{runId:run.id,targetId:target.id,actorId:actor,assignedAt:new Date().toISOString(),questionSnapshot:target.payload},old?.id,v.expectedUpdatedAt);
  }else if(body.action==='capture'){
    const v=z.object({runId:idSchema,url:z.string().url().max(2000)}).parse(body),run=await getStudyRun(uid,studyId,v.runId);if(!run.normalized?.sources.some(s=>s.url===v.url)&&!run.normalized?.citations.some(c=>c.native?.url===v.url))throw new AppError('Choose a URL disclosed in this observation.');id=await captureSource(uid,studyId,run.id,v.url,actor);const result=await db().prepare("SELECT payload FROM records WHERE id=? AND study_id=? AND owner_id=?").bind(id,studyId,uid).first<{payload:string}>();const saved=JSON.parse(result!.payload);captureResult={status:saved.status,error:saved.error};
  }else if(body.action==='queue'){
    const v=z.object({runId:idSchema,claim:z.string().min(1).max(6000),anchor:z.object({segmentIndex:z.number().int().min(0),start:z.number().int().min(0),end:z.number().int().min(1)}),priority:z.enum(['high','medium','low']),productId:z.union([idSchema,z.literal('')]).default(''),id:idSchema.optional(),expectedUpdatedAt:z.string().optional()}).parse(body),run=await getStudyRun(uid,studyId,v.runId);if(!validAnchor(run,v.anchor,v.claim))throw new AppError('The passage does not match the original answer.');if(v.productId&&!all.some(r=>r.kind==='product'&&r.id===v.productId))throw new AppError('Choose a product from this study.');const old=all.find(r=>r.kind==='review_task'&&r.payload.runId===v.runId&&JSON.stringify(r.payload.anchor)===JSON.stringify(v.anchor));if(old&&!v.id)return reply({id:old.id,alreadyQueued:true});const {id:recordId,expectedUpdatedAt,...payload}=v;id=await putRecord(uid,studyId,'review_task',{...payload,provider:run.provider,environment:run.environment,actorId:actor},recordId,expectedUpdatedAt);
  }else throw new AppError('Unknown investigation operation.',404);
  await audit(studyId,actor,`investigation_${body.action}`,id);return reply({id,...captureResult},201);
}catch(e){return failure(e);}}
