"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { readWorkspace, workspaceApi } from "@/lib/client";
export function Card({title,description,children,action}:{title:string;description?:string;children:ReactNode;action?:ReactNode}){return <section className="rounded-xl border bg-white p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-tight">{title}</h2>{description&&<p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>{action}</div>{children}</section>;}
export function EmptyState({title,children}:{title:string;children?:ReactNode}){return <div className="rounded-xl border border-dashed bg-white/50 px-6 py-12 text-center"><h3 className="font-semibold">{title}</h3>{children&&<div className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">{children}</div>}</div>;}
export function ErrorMessage({message}:{message:string}){return message?<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-destructive">{message}</p>:null;}
export function BusyButton({busy,children,...props}:React.ComponentProps<typeof Button>&{busy?:boolean}){return <Button {...props} disabled={busy||props.disabled}>{busy&&<Loader2 className="animate-spin" size={15}/>} {children}</Button>;}
export function useSavedDraft<T extends Record<string,any>>(studyId:string,name:string,initial:T,enabled=true){
  const [value,setValue]=useState<T>(initial),[status,setStatus]=useState("Loading draft…"),[loaded,setLoaded]=useState(false);
  const version=useRef(0),dirty=useRef(false),revision=useRef(0),blocked=useRef(false),latest=useRef(initial),ready=useRef(false),pending=useRef<Promise<void>|null>(null),mounted=useRef(true);
  function message(text:string){if(mounted.current)setStatus(text);}
  async function flush(){
    if(!enabled||!ready.current||blocked.current)return;
    if(pending.current)return pending.current;
    const work=async()=>{while(dirty.current&&!blocked.current){const seq=revision.current;message("Saving draft…");try{const data=await workspaceApi("draft",{studyId,name,payload:latest.current,version:version.current});version.current=data.version;if(seq===revision.current){dirty.current=false;message("Draft saved");}}catch(e){blocked.current=true;message((e as Error).message);}}};
    pending.current=work();try{await pending.current;}finally{pending.current=null;}
  }
  const flushRef=useRef(flush);flushRef.current=flush;
  useEffect(()=>{mounted.current=true;if(!enabled){setLoaded(true);setStatus("");return;}
    readWorkspace("draft",{studyId,name}).then(data=>{version.current=data.draft?.version||0;ready.current=true;if(data.draft&&!dirty.current){latest.current=data.draft.payload;if(mounted.current)setValue(data.draft.payload);message("Saved draft restored");}else message(dirty.current?"Unsaved changes":"Draft ready");if(mounted.current)setLoaded(true);if(dirty.current)void flushRef.current();}).catch(e=>{blocked.current=true;message(e.message);if(mounted.current)setLoaded(true);});
    return()=>{mounted.current=false;void flushRef.current();};
  },[studyId,name,enabled]);
  useEffect(()=>{if(!enabled||!loaded||!dirty.current)return;const timer=setTimeout(()=>void flushRef.current(),600);return()=>clearTimeout(timer);},[value,loaded,enabled]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(dirty.current){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[]);
  function update(next:T|((v:T)=>T)){const nextValue=typeof next==="function"?next(latest.current):next;latest.current=nextValue;dirty.current=true;revision.current++;message("Unsaved changes");setValue(nextValue);}
  async function reload(){const data=await readWorkspace("draft",{studyId,name});version.current=data.draft?.version||0;dirty.current=false;blocked.current=false;latest.current=data.draft?.payload||initial;setValue(latest.current);setStatus("Latest saved draft loaded");}
  async function clear(){if(!enabled)return;await pending.current;blocked.current=true;dirty.current=false;const data=await workspaceApi("draft",{studyId,name,payload:initial,version:version.current});version.current=data.version;message("Draft cleared");}
  return {value,setValue:update,status,reload,clear,conflict:blocked.current};
}
