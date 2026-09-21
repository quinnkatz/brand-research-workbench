"use client";
import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Choice} from "./ui";
import {intelligenceApi} from "@/lib/client";
import {toast} from "sonner";
import type {ResearchRecord} from "@/lib/research";
import type {Scope} from "@/lib/analytics";
export function SavedViews({studyId,records,scope,onChange,enabled,onRefresh}:{studyId:string;records:ResearchRecord[];scope:Scope;onChange:(scope:Scope)=>void;enabled:boolean;onRefresh:()=>Promise<void>}){
 const [name,setName]=useState(""),[open,setOpen]=useState(false),[busy,setBusy]=useState(false);const views=records.filter(r=>r.kind==="view");
 async function save(){setBusy(true);try{await intelligenceApi("save_view",{studyId,name,scope});await onRefresh();setOpen(false);setName("");toast.success("Evidence view saved for this brand.");}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}
 return <div className="flex flex-wrap items-center gap-2 border-t pt-3 mt-3">{views.length>0&&<div className="w-56"><Choice label="Saved evidence views" value="choose" onChange={id=>{const view=views.find(v=>v.id===id);if(view)onChange(view.payload.scope);}} options={[["choose","Open a saved view"],...views.map(v=>[v.id,v.payload.name] as [string,string])]}/></div>}<Button size="sm" variant="ghost" disabled={!enabled} onClick={()=>setOpen(x=>!x)}>Save this view</Button>{open&&<><Input className="max-w-xs" aria-label="View name" placeholder="e.g. UK purchase questions" maxLength={120} value={name} onChange={e=>setName(e.target.value)}/><Button size="sm" disabled={busy||!name.trim()} onClick={save}>Save filters</Button></>}<span className="text-xs text-muted-foreground">A saved view reruns these filters as observations arrive.</span></div>;
}
