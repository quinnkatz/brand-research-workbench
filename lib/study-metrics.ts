import { measure } from "./analytics";
import { answerOf,type Study,type ResearchRecord,type Run } from "./research";

// Measure complete original text, then retain only short display summaries.
// The full response is fetched separately when an investigator opens a record.
export function metricsAccumulator(study:Study,records:ResearchRecord[]){
 const result=measure(study,[],[]),prompts=new Set<string>(),brandPrompts=new Map<string,Set<string>>(),methods=new Set<string>(),days=new Map<string,{date:string;mentions:number;denominator:number;runIds:string[]}>(),domains=new Map<string,{domain:string;urls:Set<string>;runIds:Set<string>;citedIds:Set<string>;manualIds:Set<string>;roles:Set<string>}>();
 const summary=(r:Run)=>({...r,settings:{},normalized:r.normalized?{...r.normalized,segments:[{text:answerOf(r).slice(0,260),raw_path:"display-summary-only"}],sources:[],citations:[],tool_events:[],usage:null}:null});
 return {add(runs:Run[]){const page=measure(study,runs,[]);result.eligible.push(...page.eligible.map(summary));result.excluded.push(...page.excluded.map(summary));result.searchDisclosed+=page.searchDisclosed;
   page.eligible.forEach(r=>prompts.add(r.prompt));page.methods.forEach(m=>methods.add(m));
   for(const [i,b] of page.brands.entries()){const target=result.brands[i];target.mentions+=b.mentions;target.runIds.push(...b.runIds);const set=brandPrompts.get(b.name)||new Set<string>();page.eligible.filter(r=>b.runIds.includes(r.id)).forEach(r=>set.add(r.prompt));brandPrompts.set(b.name,set);}
   for(const d of page.days){const old=days.get(d.date)||{date:d.date,mentions:0,denominator:0,runIds:[] as string[]};old.mentions+=d.mentions;old.denominator+=d.denominator;old.runIds.push(...d.runIds);days.set(d.date,old);}
   for(const d of page.domains){const old=domains.get(d.domain)||{domain:d.domain,urls:new Set<string>(),runIds:new Set<string>(),citedIds:new Set<string>(),manualIds:new Set<string>(),roles:new Set<string>()};for(const key of ["urls","runIds","citedIds","manualIds","roles"] as const)d[key].forEach(v=>old[key].add(v));domains.set(d.domain,old);}
 },result(){const totalMentions=result.brands.reduce((n,b)=>n+b.mentions,0),n=result.eligible.length,ids=new Set(result.eligible.map(r=>r.id));
   result.brands=result.brands.map(b=>({...b,denominator:n,rate:n?b.mentions/n*100:null,share:totalMentions?b.mentions/totalMentions*100:null,prompts:brandPrompts.get(b.name)?.size||0}));
   result.promptCount=prompts.size;result.methods=[...methods];result.reviews=records.filter(r=>r.kind==="review"&&ids.has(r.payload.runId));
   result.days=[...days.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(d=>({...d,rate:d.mentions/d.denominator*100}));
   result.domains=[...domains.values()].map(d=>({...d,urls:[...d.urls],runIds:[...d.runIds],citedIds:[...d.citedIds],manualIds:[...d.manualIds],roles:[...d.roles]})).sort((a,b)=>b.runIds.length-a.runIds.length);
   return result;
 }};
}
