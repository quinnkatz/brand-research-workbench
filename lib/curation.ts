import type { ResearchRecord } from './research';
export type ReportSelection={reviewIds:string[];actionIds:string[];summary:string};
export function curateRecords(all:ResearchRecord[],selection:ReportSelection){
 const reviews=selection.reviewIds.map(id=>{const r=all.find(r=>r.id===id&&r.kind==='review');if(!r)throw new Error('A selected finding is unavailable. Reload the selection.');return r;});
 const actions=selection.actionIds.map(id=>{const r=all.find(r=>r.id===id&&r.kind==='action');if(!r)throw new Error('A selected action is unavailable.');if(!r.payload.reviewIds?.length||r.payload.reviewIds.some((id:string)=>!selection.reviewIds.includes(id)))throw new Error('Select every supporting finding before including its action.');return r;});
 const runIds=[...new Set<string>([...reviews.map(r=>r.payload.runId),...actions.flatMap(r=>r.payload.verificationRunIds||[])])];
 // Frozen references live within reviews. Legacy reviews receive only their named facts.
 const factIds=new Set<string>(reviews.filter(r=>!r.payload.factSnapshots).flatMap(r=>r.payload.factIds||[]));const facts=all.filter(r=>r.kind==='fact'&&factIds.has(r.id));
 return {records:[...reviews,...actions,...facts],runIds};
}
