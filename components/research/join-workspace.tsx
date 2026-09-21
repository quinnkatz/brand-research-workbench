"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { workspaceApi } from "@/lib/client";
export function JoinWorkspace({token,email}:{token:string;email:string}) {
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  async function join(){setBusy(true);setError("");try{const data=await workspaceApi("accept_invite",{token});window.location.assign(`/?study=${data.studyId}`);}catch(e){setError((e as Error).message);setBusy(false);}}
  return <main className="mx-auto max-w-lg px-6 py-24"><p className="text-sm font-semibold text-primary">Brand Research</p><h1 className="mt-6 text-3xl font-semibold tracking-tight">Your seat at the research table.</h1><p className="my-6 leading-7 text-muted-foreground">Accept this invitation to investigate the brand’s evidence together. You’re signed in as {email}.</p>{error&&<p role="alert" className="mb-5 text-destructive">{error}</p>}<Button disabled={busy} onClick={join}>{busy?"Joining…":"Accept invitation"}</Button></main>;
}
