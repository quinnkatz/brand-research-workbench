"use client";
import { useEffect,useState } from "react";
import { Button } from "@/components/ui/button";
import { Pin,X } from "lucide-react";
import { readWorkspace,workspaceApi } from "@/lib/client";
import { toast } from "sonner";
export function EvidencePins({studyId,enabled}:{studyId:string;enabled:boolean}){
  const [pins,setPins]=useState<any[]>([]),[version,setVersion]=useState(0),[expanded,setExpanded]=useState(false);
  async function reload(){if(!enabled)return;try{const data=await readWorkspace("draft",{studyId,name:"pinned-evidence"});setPins(data.draft?.payload?.pins||[]);setVersion(data.draft?.version||0);}catch{}}
  useEffect(()=>{void reload();window.addEventListener("evidence-pinned",reload);return()=>window.removeEventListener("evidence-pinned",reload);},[studyId,enabled]);
  async function remove(i:number){try{const next=pins.filter((_,index)=>index!==i);const data=await workspaceApi("draft",{studyId,name:"pinned-evidence",version,payload:{pins:next}});setPins(next);setVersion(data.version);}catch(e){toast.error((e as Error).message);await reload();}}
  if(!pins.length)return null;
  return <aside aria-label="Pinned evidence" className="mb-6 overflow-hidden rounded-xl border border-blue-200 bg-white"><button className="flex w-full items-center gap-2 p-4 text-left text-sm font-medium text-primary" onClick={()=>setExpanded(!expanded)} aria-expanded={expanded}><Pin size={15}/>{pins.length} pinned passages<span className="ml-auto text-xs">{expanded?"Collapse":"Open evidence tray"}</span></button>{expanded&&<div className="grid gap-3 border-t bg-blue-50/40 p-4 md:grid-cols-2">{pins.map((p,i)=><div key={`${p.runId}:${p.segmentIndex}:${p.start}`} className="rounded-lg border bg-white p-4"><div className="flex items-start gap-2"><p className="flex-1 text-xs leading-5 text-muted-foreground">{p.provider} · {p.prompt}</p><Button size="icon" variant="ghost" className="size-7" aria-label={`Unpin passage ${i+1}`} onClick={()=>remove(i)}><X size={13}/></Button></div><blockquote className="mt-3 line-clamp-4 text-sm leading-7">{p.text}</blockquote><a className="mt-3 inline-block text-sm font-medium text-primary" href={`/?study=${studyId}&section=observations&environment=all&run=${p.runId}&claim=${p.segmentIndex}:${p.start}:${p.end}`}>Return to exact passage</a></div>)}</div>}</aside>;
}
