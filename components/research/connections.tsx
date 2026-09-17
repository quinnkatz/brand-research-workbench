"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, ExternalLink, KeyRound, Loader2, Unplug } from "lucide-react";
import { api } from "@/lib/client";
import { providerNames, type Provider } from "@/lib/research";
import { Field, Note } from "./ui";
import type { Connections } from "./collect";
export function ConnectionsPage({ value, onChange, enabled }: { value: Connections; onChange: (c: Connections) => void; enabled: boolean }) {
  const [busy, setBusy] = useState<Provider | null>(null); const [errors, setErrors] = useState<Record<string, string>>({});
  const update = (p: Provider, updates: Partial<Connections[Provider]>) => onChange({ ...value, [p]: { ...value[p], ...updates } });
  async function check(p: Provider) {
    setBusy(p); setErrors(old => ({ ...old, [p]: "" }));
    try { const data = await api("models", { provider: p, key: value[p].key }); update(p, { models: data.models, checked: true }); }
    catch (e) { setErrors(old => ({ ...old, [p]: (e as Error).message })); update(p, { checked: false }); } finally { setBusy(null); }
  }
  const urls: Record<Provider, string> = { openai: "https://platform.openai.com/api-keys", anthropic: "https://platform.claude.com/settings/keys", gemini: "https://aistudio.google.com/apikey" };
  return <div className="max-w-4xl space-y-6"><Note>API keys stay in this browser tab’s memory and are sent to the server only to contact the selected provider. They are not saved in your research records. Refreshing or closing this tab clears them. Your saved studies and evidence remain available.</Note>
    <div className="space-y-4">{(["openai", "anthropic", "gemini"] as Provider[]).map(p => <section key={p} className="rounded-xl border bg-white p-5 sm:p-6"><div className="mb-5 flex items-center gap-3"><span className="flex size-10 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold">{p === "openai" ? "O" : p === "anthropic" ? "A" : "G"}</span><div className="flex-1"><h2 className="text-base font-semibold">{providerNames[p]}</h2><p className="mt-0.5 text-xs text-muted-foreground">{p === "openai" ? "Responses API + web search" : p === "anthropic" ? "Messages API + web search" : "Interactions API + Google Search"}</p></div><Badge variant="outline" className={`font-normal ${value[p].checked ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}`}>{value[p].checked ? "Key checked" : value[p].key ? "Key entered" : "Not connected"}</Badge></div>
      <div className="grid gap-4 sm:grid-cols-2"><Field label={`${providerNames[p]} API key`}><Input autoComplete="off" type="password" spellCheck={false} disabled={!enabled || busy !== null} value={value[p].key} maxLength={512} onChange={e => update(p, { key: e.target.value, checked: false, models: [] })} placeholder="Paste your API key"/></Field><Field label="Preferred model ID" hint="Select after checking the key, or enter an exact model ID."><Input list={`models-${p}`} value={value[p].model} onChange={e => update(p, { model: e.target.value })} disabled={!enabled || busy !== null} placeholder="Choose or enter a model ID"/></Field></div><datalist id={`models-${p}`}>{value[p].models.map(m => <option value={m.id} key={m.id}>{m.name}</option>)}</datalist>
      {errors[p] && <p role="alert" className="mt-3 text-sm text-destructive">{errors[p]}</p>}{value[p].checked && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-emerald-800"><Check size={14} className="mt-0.5 shrink-0"/>{value[p].models.length} models returned. A model listing confirms key access, not compatibility with every search tool.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><Button variant="outline" size="sm" disabled={!enabled || !value[p].key || busy !== null} onClick={() => check(p)}>{busy === p ? <Loader2 size={14} className="animate-spin"/> : <KeyRound size={14}/>}Check key & load models</Button>{value[p].key && <Button variant="ghost" size="sm" disabled={busy !== null} onClick={() => update(p, { key: "", checked: false, models: [] })}><Unplug size={14}/>Clear key</Button>}<a href={urls[p]} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline">Get an API key<ExternalLink size={12}/></a></div>
    </section>)}</div><p className="text-xs leading-5 text-muted-foreground">API access and billing are separate from a consumer ChatGPT, Claude, or Gemini subscription. Provider availability depends on your account. Keys are never included in exports.</p></div>;
}
