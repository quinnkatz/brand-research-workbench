export type TrafficRow={date:string;source:string;page:string;query:string;count:number;impressions:number|null;country:string;userAgent:string};
export function parseCsv(text:string):string[][] {
  const rows:string[][]=[];let row:string[]=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted)quoted=false;else if(!cell)quoted=true;else throw new Error("A CSV quote appears inside an unquoted field.");}
    else if(c===","&&!quoted){row.push(cell);cell="";}
    else if((c==="\n"||c==="\r")&&!quoted){if(c==="\r"&&text[i+1]==="\n")i++;row.push(cell);if(row.some(s=>s.trim()))rows.push(row);row=[];cell="";}
    else cell+=c;
    if(rows.length>20000)throw new Error("Limit each import to 20,000 rows.");
  }
  if(quoted)throw new Error("A quoted CSV field was not closed.");
  row.push(cell);if(row.some(s=>s.trim()))rows.push(row);
  return rows;
}
export function importTraffic(text:string,kind:string,mapping:Record<string,string>) {
  const csv=parseCsv(text.replace(/^\uFEFF/,""));if(csv.length<2)throw new Error("Include a header and at least one data row.");
  const headers=csv[0].map(s=>s.trim()),indices:Record<string,number>={};
  for(const [key,value] of Object.entries(mapping))if(value){const i=headers.indexOf(value);if(i<0)throw new Error(`Column not found: ${value}`);indices[key]=i;}
  for(const key of ["date","count",kind==="search_console"?"query":"source"])if(indices[key]===undefined)throw new Error(`Map the ${key} column.`);
  const rows:TrafficRow[]=[];const errors:{row:number;reason:string}[]=[];
  for(let i=1;i<csv.length;i++){
    const raw=csv[i],get=(key:string)=>indices[key]===undefined?"":(raw[indices[key]]||"").trim();
    let date=get("date");if(/^\d{8}$/.test(date))date=`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}`;
    const count=Number(get("count").replaceAll(",","")),imp=get("impressions"),impressions=imp?Number(imp.replaceAll(",","")):null;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date){errors.push({row:i+1,reason:"Use a valid YYYY-MM-DD date."});continue;}
    if(!get("count")||!Number.isFinite(count)||count<0||!Number.isInteger(count)||impressions!==null&&(!Number.isFinite(impressions)||impressions<0||!Number.isInteger(impressions))){errors.push({row:i+1,reason:"Counts must be non-negative whole numbers."});continue;}
    if(!get(kind==="search_console"?"query":"source")){errors.push({row:i+1,reason:"The source or query is empty."});continue;}
    rows.push({date,source:get("source"),query:get("query"),page:get("page"),count,impressions,country:get("country"),userAgent:get("userAgent")});
  }
  const dates=rows.map(r=>r.date).sort(),totals=new Map<string,number>();for(const r of rows){const key=kind==="search_console"?r.query:r.source;totals.set(key,(totals.get(key)||0)+r.count);}
  return {rows,errors,headers,summary:{rows:rows.length,rejected:errors.length,from:dates[0]||null,to:dates.at(-1)||null,total:rows.reduce((s,r)=>s+r.count,0),top:[...totals].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([label,count])=>({label,count}))}};
}
