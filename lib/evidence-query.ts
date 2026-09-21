import { AppError, db, publicRecord, publicRun } from "./server";
import type { ResearchRecord, Run } from "./research";
export async function studyRecords(ownerId:string,studyId:string):Promise<ResearchRecord[]> {
  return (await db().prepare("SELECT * FROM records WHERE owner_id=? AND study_id=? ORDER BY created_at DESC").bind(ownerId,studyId).all()).results.map(publicRecord);
}
export async function selectedEvidence(ownerId:string,studyId:string,ids:string[]):Promise<Run[]> {
  const unique=[...new Set(ids)],runs:Run[]=[];
  for(let start=0;start<unique.length;start+=80){const part=unique.slice(start,start+80);runs.push(...(await db().prepare(`SELECT * FROM runs WHERE owner_id=? AND study_id=? AND id IN (${part.map(()=>"?").join(",")})`).bind(ownerId,studyId,...part).all()).results.map(publicRun));}
  if(runs.length!==unique.length)throw new AppError("One or more selected observations are unavailable.",404);return runs;
}
