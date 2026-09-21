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
