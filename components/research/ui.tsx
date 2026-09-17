"use client";
import { cloneElement, useId, type ReactElement, type ReactNode } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { safeUrl } from "@/lib/research";
import { ExternalLink, Info } from "lucide-react";
export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactElement<{ id?: string }> }) {
  const id = useId(); return <div className="min-w-0"><label htmlFor={id} className="field-label">{label}</label>{cloneElement(children, { id })}{hint && <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{hint}</p>}</div>;
}
export function Choice({ value, onChange, options, id, label, disabled }: { value: string; onChange: (v: string) => void; options: [string, string][]; id?: string; label?: string; disabled?: boolean }) {
  return <Select value={value} onValueChange={onChange} disabled={disabled}><SelectTrigger id={id} aria-label={label} className="w-full bg-white"><SelectValue /></SelectTrigger><SelectContent>{options.map(([v, title]) => <SelectItem key={v} value={v}>{title}</SelectItem>)}</SelectContent></Select>;
}
export function Status({ value }: { value: string }) {
  const good = ["complete", "supported", "verified"].includes(value); const bad = ["failed", "refused", "contradicted", "disputed", "failed_or_refused"].includes(value);
  const label: Record<string, string> = { manually_recorded: "Recorded", needs_review: "Needs review", failed_or_refused: "Failed / refused", partial: "Partial", running: "Pending" };
  return <Badge variant="outline" className={`shrink-0 rounded-md font-medium capitalize ${good ? "border-emerald-200 bg-emerald-50 text-emerald-800" : bad ? "border-red-200 bg-red-50 text-red-800" : "border-slate-200 bg-slate-50 text-slate-600"}`}>{label[value] || value.replaceAll("_", " ")}</Badge>;
}
export function Note({ children, warning = false }: { children: ReactNode; warning?: boolean }) { return <div className={`flex gap-2.5 rounded-lg border px-3.5 py-3 text-xs leading-5 ${warning ? "border-amber-200 bg-amber-50 text-amber-900" : "border-blue-100 bg-blue-50/60 text-slate-600"}`}><Info size={15} className="mt-0.5 shrink-0"/><div>{children}</div></div>; }
export function SourceLink({ url, title }: { url: string; title?: string }) { const safe = safeUrl(url); return safe ? <a className="inline-flex max-w-full items-center gap-1.5 break-all text-primary underline-offset-4 hover:underline" href={safe} target="_blank" rel="noopener noreferrer">{title || url}<ExternalLink size={12} className="shrink-0"/></a> : <span className="break-all">{title || url} (link unavailable)</span>; }
