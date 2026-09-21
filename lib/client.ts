export async function api(action: string, values: Record<string, unknown> = {}) {
  const response = await fetch("/api/workbench", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
  const data: any = await response.json(); if (!response.ok) throw new Error(data.error || "The operation failed."); return data;
}
export async function readApi(action: string, values: Record<string, string> = {}) {
  const response = await fetch(`/api/workbench?${new URLSearchParams({ action, ...values })}`, { cache: "no-store" });
  const data: any = await response.json(); if (!response.ok) throw new Error(data.error || "The record could not be loaded."); return data;
}
export function download(value: unknown, name: string, pretty = true) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, pretty ? 2 : undefined)], { type: "application/json" }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function displayDate(value: string) { return new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
export async function researchApi(action: string, values: Record<string, unknown> = {}) {
  const response = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...values }) });
  const data: any = await response.json(); if (!response.ok) throw new Error(data.error || "The research operation failed."); return data;
}
export async function readResearch(action: string, values: Record<string, string>) {
  const response = await fetch(`/api/research?${new URLSearchParams({ action, ...values })}`, { cache: "no-store" });
  const data: any = await response.json(); if (!response.ok) throw new Error(data.error || "The research record could not be loaded."); return data;
}
export async function workspaceApi(action: string, values: Record<string, unknown> = {}) { return postTo("workspace",action,values); }
export async function intelligenceApi(action: string, values: Record<string, unknown> = {}) { return postTo("intelligence",action,values); }
export async function monitorApi(action: string, values: Record<string, unknown> = {}) { return postTo("monitoring",action,values); }
async function postTo(path:string,action:string,values:Record<string,unknown>) {
  const response=await fetch(`/api/${path}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,...values})});
  const data:any=await response.json();if(!response.ok)throw new Error(data.error||"The operation failed.");return data;
}
export async function readWorkspace(action:string,values:Record<string,string>={}) { return readFrom("workspace",action,values); }
export async function readMonitoring(action:string,values:Record<string,string>={}) { return readFrom("monitoring",action,values); }
export async function readFrom(path:string,action:string,values:Record<string,string>={}) {
  const response=await fetch(`/api/${path}?${new URLSearchParams({action,...values})}`,{cache:"no-store"});const data:any=await response.json();if(!response.ok)throw new Error(data.error||"The record could not be loaded.");return data;
}

export function requestUuid(){if(typeof crypto.randomUUID==="function")return crypto.randomUUID();const bytes=crypto.getRandomValues(new Uint8Array(16));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const h=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
