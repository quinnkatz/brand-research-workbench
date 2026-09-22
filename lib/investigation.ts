import { answerOf, type Run, type ResearchRecord } from './research';
export const surfaces = [
  ['api:openai','OpenAI API'],['api:anthropic','Anthropic API'],['api:gemini','Gemini API'],['api:perplexity_api','Perplexity API'],['api:xai','xAI API'],
  ['consumer:chatgpt','ChatGPT'],['consumer:claude','Claude'],['consumer:gemini','Gemini app'],['consumer:google_ai_mode','Google AI Mode'],['consumer:google_ai_overview','Google AI Overviews'],['consumer:perplexity','Perplexity app'],['consumer:copilot','Copilot'],['consumer:grok','Grok'],['consumer:other','Other consumer app'],
  ['imported:openai','OpenAI import'],['imported:anthropic','Anthropic import'],['imported:gemini','Gemini import'],['imported:perplexity_api','Perplexity import'],['imported:xai','xAI import'],
] as const;
export type ObservationSummary = Pick<Run,'id'|'provider'|'environment'|'status'|'model'|'prompt'|'created_at'|'settings'> & {hasAnswer:boolean};
export type CoverageCell = {id:string;questionId:string;questionVersion:string;prompt:string;surface:string;expected:number;context:Record<string,unknown>; counts:Record<string,number>;observations:ObservationSummary[];updatedAt:string};
export function observationState(run:ObservationSummary){if(run.status==='cancelled')return 'cancelled';if(run.status==='running')return 'running';if(run.hasAnswer&&['complete','recorded','manually_recorded'].includes(run.status))return 'complete';if(run.status==='partial'||run.hasAnswer&&!['failed','cancelled'].includes(run.status))return 'partial';return 'failed';}
export function coverageBoard(records:ResearchRecord[],runs:ObservationSummary[],jobs:{question_id:string|null;provider:string;status:string;run_id:string|null;settings:Record<string,unknown>}[]=[]){
  const assignments=records.filter(r=>r.kind==='assignment');const assigned=new Map(assignments.map(a=>[a.payload.runId,a.payload.targetId]));const linked=new Set<string>();
  const cells:CoverageCell[]=records.filter(r=>r.kind==='coverage').map(target=>{
    const p=target.payload;const observations=runs.filter(run=>{if(`${run.environment}:${run.provider}`!==p.surface)return false;if(assigned.has(run.id))return assigned.get(run.id)===target.id;return run.settings?.questionId===p.questionId&&run.settings?.questionVersion===p.questionVersion;});observations.forEach(r=>linked.add(r.id));
    const counts:Record<string,number>={complete:0,partial:0,failed:0,running:0,queued:0,cancelled:0,missing:0};observations.forEach(r=>counts[observationState(r)]++);
    for(const job of jobs){if(job.run_id||job.question_id!==p.questionId||job.settings?.questionVersion!==p.questionVersion||`api:${job.provider}`!==p.surface)continue;if(['queued','running','cancelled'].includes(job.status))counts[job.status]++;else counts.failed++;}
    counts.missing=Math.max(0,p.expected-counts.complete-counts.running-counts.queued);return {id:target.id,questionId:p.questionId,questionVersion:p.questionVersion,prompt:p.prompt,surface:p.surface,expected:p.expected,context:p.context||{},counts,observations,updatedAt:target.updated_at};
  });return {cells,unassigned:runs.filter(r=>!linked.has(r.id)),total:runs.length};
}
export const summarizeRun=(r:Run):ObservationSummary=>({id:r.id,provider:r.provider,environment:r.environment,status:r.status,model:r.model,prompt:r.prompt,created_at:r.created_at,settings:r.settings,hasAnswer:!!answerOf(r).trim()});
export function referenceChanges(review:ResearchRecord,records:ResearchRecord[]){
 const changed=(review.payload.factSnapshots||[]).filter((old:ResearchRecord)=>{const current=records.find(r=>r.id===old.id);return !current||current.updated_at!==old.updated_at;}).map((f:ResearchRecord)=>f.id);
 for(const old of review.payload.sourceSnapshots||[]){const newer=records.filter(r=>r.kind==='source'&&r.payload.url===old.url&&r.payload.status!=='unavailable'&&r.payload.contentHash&&r.payload.capturedAt>old.capturedAt).sort((a,b)=>b.payload.capturedAt.localeCompare(a.payload.capturedAt))[0];if(newer&&newer.payload.contentHash!==old.contentHash)changed.push(old.sourceId);}
 return [...new Set(changed)] as string[];
}
export function queueRows(records:ResearchRecord[]){const tasks=records.filter(r=>r.kind==='review_task'),reviews=records.filter(r=>r.kind==='review');const rows=tasks.map(task=>{const review=reviews.find(r=>r.payload.runId===task.payload.runId&&JSON.stringify(r.payload.anchor)===JSON.stringify(task.payload.anchor)&&r.payload.claim===task.payload.claim);return {task,review,changed:review?referenceChanges(review,records):[],state:review?'reviewed':'unreviewed'};});for(const review of reviews)if(!rows.some(r=>r.review?.id===review.id))rows.push({task:{...review,payload:{...review.payload,priority:review.payload.materiality}},review,changed:referenceChanges(review,records),state:'reviewed'});return rows.map(r=>({...r,state:r.changed.length?'recheck':r.state}));}
