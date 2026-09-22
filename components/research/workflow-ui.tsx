"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { DraftController } from "@/lib/draft-controller";
import { readWorkspace, workspaceApi } from "@/lib/client";
export function Card({title,description,children,action}:{title:string;description?:string;children:ReactNode;action?:ReactNode}){return <section className="rounded-xl border bg-white p-5 sm:p-6"><div className="mb-5 flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-lg font-semibold tracking-tight">{title}</h2>{description&&<p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}</div>{action}</div>{children}</section>;}
export function EmptyState({title,children}:{title:string;children?:ReactNode}){return <div className="rounded-xl border border-dashed bg-white/50 px-6 py-12 text-center"><h3 className="font-semibold">{title}</h3>{children&&<div className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted-foreground">{children}</div>}</div>;}
export function ErrorMessage({message}:{message:string}){return message?<p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-destructive">{message}</p>:null;}
export function BusyButton({busy,children,...props}:React.ComponentProps<typeof Button>&{busy?:boolean}){return <Button {...props} disabled={busy||props.disabled}>{busy&&<Loader2 className="animate-spin" size={15}/>} {children}</Button>;}
export function useSavedDraft<T extends Record<string,any>>(studyId:string,name:string,initial:T,enabled=true){
  const controller=useMemo(()=>new DraftController(initial,()=>readWorkspace("draft",{studyId,name}),(payload,version)=>workspaceApi("draft",{studyId,name,payload,version}),enabled),[studyId,name,enabled]);
  const [,render]=useState(0);
  useEffect(()=>{const unsubscribe=controller.subscribe(()=>render(n=>n+1));void controller.load();return()=>{unsubscribe();void controller.flush();};},[controller]);
  const {value,status,loaded,conflict}=controller.snapshot;
  useEffect(()=>{if(!enabled||!loaded)return;const timer=setTimeout(()=>void controller.flush(),600);return()=>clearTimeout(timer);},[controller,value,loaded,enabled]);
  useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(controller.snapshot.dirty){e.preventDefault();e.returnValue="";}};window.addEventListener("beforeunload",warn);return()=>window.removeEventListener("beforeunload",warn);},[controller]);
  return {value,setValue:(next:T|((v:T)=>T))=>controller.update(next),status,reload:controller.reload,clear:controller.clear,conflict};
}
