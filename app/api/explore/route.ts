import { z } from "zod";
import { AppError, db, failure, idSchema, ownStudy, owner, publicRecord, publicRun, reply } from "@/lib/server";
import { metricsAccumulator } from "@/lib/study-metrics";
import { answerOf,type Run } from "@/lib/research";
import { createComparison } from "@/lib/comparisons";
import { publicStudy } from "@/lib/research-server";
type RunRow=Omit<Run,"settings"|"normalized">&{owner_id:string;settings:string;normalized:string|null};
type SearchRow=Pick<Run,"id"|"prompt"|"provider"|"environment"|"model"|"status"|"created_at">&{observed_at:string;answer:string;settings:string};
export const dynamic="force-dynamic";
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s=>Number.isFinite(Date.parse(s))&&new Date(s).toISOString().startsWith(s));
const filterFields={provider:"r.provider",environment:"r.environment",intent:"json_extract(r.settings,'$.intent')",topic:"json_extract(r.settings,'$.questionContext.topic')",audience:"json_extract(r.settings,'$.questionContext.audience')",market:"json_extract(r.settings,'$.questionContext.market')",language:"json_extract(r.settings,'$.questionContext.language')",purpose:"coalesce(json_extract(r.settings,'$.questionContext.purpose'),'unclassified')",productId:"json_extract(r.settings,'$.questionContext.productId')"} as const;
const answerSql="coalesce((SELECT group_concat(json_extract(value,'$.text'),char(10)) FROM json_each(r.normalized,'$.segments')),'')";
export async function GET(req:Request){try{
  const actor=await owner(req),p=new URL(req.url).searchParams,studyId=idSchema.parse(p.get("studyId")),study=await ownStudy(studyId,actor),action=p.get("action")||"search";
  const clauses=["r.study_id=?","r.owner_id=?"],values:string[]=[studyId,study.owner_id];
  for(const [key,column] of Object.entries(filterFields)){const value=p.get(key);if(value&&value!=="all"){clauses.push(`${column}=?`);values.push(z.string().max(300).parse(value));}}
  const asOf=p.has("asOf")?z.string().datetime().parse(p.get("asOf")):new Date().toISOString();clauses.push("r.created_at<=?");values.push(asOf);
  const observed="CASE WHEN r.environment='consumer' THEN coalesce(json_extract(r.settings,'$.observedAt'),r.created_at) ELSE r.created_at END";
  if(action==="export"){
    const encoder=new TextEncoder();let cancelled=false;
    const stream=new ReadableStream<Uint8Array>({async start(controller){
      const send=(value:unknown)=>{if(!cancelled)controller.enqueue(encoder.encode(JSON.stringify(value)+"\n"));};
      try{send({type:"manifest",format:"brand-research-archive",version:2,asOf,study:publicStudy(study),note:"Complete structured archive recorded by this time. Evidence URLs require study access. Original bytes remain available at those URLs. A complete download ends with a completion record; later edits can occur during export."});
        const counts:Record<string,number>={};
        for(const table of ["records","runs","record_history","attachments"]){let last="";counts[table]=0;
          while(!cancelled){
            const timestamp=table==="record_history"?"recorded_at":"created_at",studyClause=table==="attachments"?"run_id IN (SELECT id FROM runs WHERE study_id=? AND owner_id=?)":"study_id=? AND owner_id=?";
            const rows=await db().prepare(`SELECT * FROM ${table} WHERE ${studyClause} AND ${timestamp}<=? AND id>? ORDER BY id LIMIT 100`).bind(studyId,study.owner_id,asOf,last).all<Record<string,string>>();
            for(const row of rows.results){const safe={...row};delete safe.owner_id;delete safe.object_key;send({type:table,value:table==="runs"?{...publicRun(row),originalUrl:`/api/workbench?action=evidence&id=${row.id}`}:table==="records"?publicRecord(row):table==="record_history"?{...safe,payload:JSON.parse(row.payload)}:{...safe,downloadUrl:`/api/evidence?id=${row.id}`}});counts[table]++;}
            if(rows.results.length<100)break;last=rows.results.at(-1)!.id;
          }
        }
        send({type:"completion",complete:true,counts,completedAt:new Date().toISOString()});if(!cancelled)controller.close();
      }catch(e){if(!cancelled)controller.error(e);}
    },cancel(){cancelled=true;}});
    return new Response(stream,{headers:{"Content-Type":"application/x-ndjson","Content-Disposition":`attachment; filename="brand-study-${studyId}.ndjson"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
  }
  if(action==="facets"){
    const facets:Record<string,string[]>={};
    for(const [key,column] of Object.entries(filterFields)){const result=await db().prepare(`SELECT DISTINCT ${column} AS value FROM runs r WHERE r.study_id=? AND r.owner_id=? AND coalesce(${column},'')!='' ORDER BY value LIMIT 200`).bind(studyId,study.owner_id).all<{value:string}>();facets[key]=result.results.map(r=>r.value);}
    return reply({facets});
  }
  if(action==="metrics"){
    for(const key of ["from","to"]){if(p.get(key)){clauses.push(`substr(${observed},1,10) ${key==="from"?">=":"<="} ?`);values.push(date.parse(p.get(key)));}}
    const query=z.string().max(300).parse(p.get("query")||"").toLocaleLowerCase();
    const records=(await db().prepare("SELECT * FROM records WHERE study_id=? AND owner_id=?").bind(studyId,study.owner_id).all()).results.map(publicRecord),accumulator=metricsAccumulator(publicStudy(study),records);let lastId="",lastAt="";
    while(true){const cursor=lastId?" AND (r.created_at<? OR (r.created_at=? AND r.id<?))":"";
      const rows=await db().prepare(`SELECT r.* FROM runs r WHERE ${clauses.join(" AND ")}${cursor} ORDER BY r.created_at DESC,r.id DESC LIMIT 100`).bind(...values,...(lastId?[lastAt,lastAt,lastId]:[])).all<RunRow>();
      const runs=rows.results.map(publicRun).filter(r=>!query||`${r.prompt}\n${answerOf(r)}`.toLocaleLowerCase().includes(query));accumulator.add(runs);
      if(rows.results.length<100)break;const last=rows.results.at(-1)!;lastId=last.id;lastAt=last.created_at;
    }
    return reply({metrics:accumulator.result(),asOf,coverage:"complete_study"});
  }
  if(action==="compare"){
    const before={from:date.parse(p.get("beforeFrom")),to:date.parse(p.get("beforeTo"))},after={from:date.parse(p.get("afterFrom")),to:date.parse(p.get("afterTo"))};
    if(before.from>before.to||after.from>after.to||before.to>=after.from)throw new AppError("Choose two non-overlapping periods, with the earlier period first.");
    clauses.push(`(substr(${observed},1,10) BETWEEN ? AND ? OR substr(${observed},1,10) BETWEEN ? AND ?)`);values.push(before.from,before.to,after.from,after.to);
    const profile=publicStudy(study).profile,comparison=createComparison([study.brand,...profile.aliases],before,after);let lastId="",lastAt="",scanned=0;
    // Stream bounded pages on the server; the browser only receives matched evidence.
    while(true){const cursor=lastId?" AND (r.created_at<? OR (r.created_at=? AND r.id<?))":"";
      const rows=await db().prepare(`SELECT r.* FROM runs r WHERE ${clauses.join(" AND ")}${cursor} ORDER BY r.created_at DESC,r.id DESC LIMIT 100`).bind(...values,...(lastId?[lastAt,lastAt,lastId]:[])).all<RunRow>();
      for(const row of rows.results){comparison.add(publicRun(row));scanned++;}if(rows.results.length<100)break;const last=rows.results.at(-1)!;lastId=last.id;lastAt=last.created_at;
    }
    const result=comparison.result();return reply({...result,before,after,scanned,asOf});
  }
  if(action!=="search")throw new AppError("Unknown evidence operation.",404);
  for(const key of ["from","to"]){if(p.get(key)){clauses.push(`substr(${observed},1,10) ${key==="from"?">=":"<="} ?`);values.push(date.parse(p.get(key)));}}
  const q=z.string().trim().max(300).parse(p.get("q")||"");
  // Plain words only: callers cannot inject FTS operators or cross-column queries.
  const words=q.match(/[\p{L}\p{N}]+/gu)||[];if(q&&!words.length)throw new AppError("Enter at least one word or number to search.");
  const join=words.length?"JOIN run_search ON run_search.rowid=r.rowid":"";
  if(words.length){clauses.push("run_search MATCH ?");values.push(words.map(w=>`"${w}"*`).join(" AND "));}
  const where=clauses.join(" AND ");
  const count=await db().prepare(`SELECT count(*) AS n FROM runs r ${join} WHERE ${where}`).bind(...values).first<{n:number}>();
  const cursor=p.get("cursor");let tail="",tailValues:string[]=[];
  if(cursor){const id=idSchema.parse(cursor),row=await db().prepare("SELECT created_at FROM runs WHERE id=? AND study_id=? AND owner_id=?").bind(id,studyId,study.owner_id).first<{created_at:string}>();if(!row)throw new AppError("Search cursor unavailable. Restart the search.");tail=" AND (r.created_at<? OR (r.created_at=? AND r.id<?))";tailValues=[row.created_at,row.created_at,id];}
  const rows=await db().prepare(`SELECT r.id,r.prompt,r.provider,r.environment,r.model,r.status,r.created_at,${observed} AS observed_at,${answerSql} AS answer,r.settings FROM runs r ${join} WHERE ${where}${tail} ORDER BY r.created_at DESC,r.id DESC LIMIT 31`).bind(...values,...tailValues).all<SearchRow>();
  const results=rows.results.slice(0,30).map(({answer,settings,...r})=>{const at=words.length?String(answer).toLocaleLowerCase().indexOf(words[0]!.toLocaleLowerCase()):0,start=Math.max(0,at-90),quote=String(answer).slice(start,start+350);return {...r,excerpt:quote,quote,context:JSON.parse(settings).questionContext||{},matchedInAnswer:words.some(w=>String(answer).toLocaleLowerCase().includes(w.toLocaleLowerCase()))};});
  return reply({results,total:Number(count?.n||0),nextCursor:rows.results.length>30?results.at(-1)?.id:null,asOf,method:"Word-prefix search across original answer text, question text, and disclosed source URLs. All terms must occur in a record. Filters use conditions saved with each observation."});
}catch(e){return failure(e);}}
