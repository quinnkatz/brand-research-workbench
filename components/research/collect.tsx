"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { KeyRound, Loader2, Play, Upload, Eye } from "lucide-react";
import { api } from "@/lib/client";
import { providerNames, type Provider } from "@/lib/research";
import { Choice, Field, Note } from "./ui";
export type Connections = Record<Provider, { key: string; model: string; models: { id: string; name: string }[]; checked: boolean }>;
export const emptyConnections = (): Connections => ({ openai: { key: "", model: "", models: [], checked: false }, anthropic: { key: "", model: "", models: [], checked: false }, gemini: { key: "", model: "", models: [], checked: false } });
export function CollectForm({ studyId, initialPrompt, initialMode = "collect", connections, onClose, onSaved, onConnect }: { studyId: string; initialPrompt: string; initialMode?: string; connections: Connections; onClose: () => void; onSaved: (id: string) => Promise<void>; onConnect: () => void }) {
  const [mode, setMode] = useState(initialMode); const [provider, setProvider] = useState<Provider>("openai");
  const [prompt, setPrompt] = useState(initialPrompt); const [model, setModel] = useState(connections.openai.model);
  const [search, setSearch] = useState("auto"); const [maxTokens, setMaxTokens] = useState(4096); const [notes, setNotes] = useState("");
  const [raw, setRaw] = useState(""); const [filename, setFilename] = useState("");
  const [observation, setObservation] = useState({ surface: "chatgpt", model: "Unknown / not shown", answer: "", observedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), location: "Unknown", locale: "Unknown", memory: "Unknown", conversation: "New conversation", mode: "Default", searchObservation: "unknown", sources: "" });
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const update = (k: string, v: string) => setObservation(old => ({ ...old, [k]: v }));
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      let payload: Record<string, unknown> = { studyId, prompt, model, provider, search, maxTokens, notes };
      if (mode === "collect") payload.key = connections[provider].key;
      if (mode === "import") { try { payload.raw = JSON.parse(raw); } catch { throw new Error("The import must be a valid provider response JSON object."); } }
      if (mode === "observe") payload = { studyId, prompt, notes, ...observation, observedAt: new Date(observation.observedAt).toISOString(), sources: observation.sources.split("\n").map(x => x.trim()).filter(Boolean).map(url => ({ url, title: "" })) };
      const data = await api(mode, payload); await onSaved(data.id); onClose();
    } catch (e) { setError((e as Error).message || "The response could not be saved."); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Collect a response</DialogTitle><DialogDescription>Keep the question, environment, and original evidence together.</DialogDescription></DialogHeader>
    <Tabs value={mode} onValueChange={setMode}><TabsList className="w-full"><TabsTrigger disabled={busy} value="collect"><Play size={14}/>API experiment</TabsTrigger><TabsTrigger disabled={busy} value="observe"><Eye size={14}/>Consumer observation</TabsTrigger><TabsTrigger disabled={busy} value="import"><Upload size={14}/>Import JSON</TabsTrigger></TabsList></Tabs>
    <form onSubmit={submit} className="space-y-5"><fieldset disabled={busy} className="space-y-5">
      <Field label="Exact customer question" hint="This text is sent as written. Product facts and review notes are not added to the prompt."><Textarea required rows={3} maxLength={12000} value={prompt} onChange={e => setPrompt(e.target.value)} placeholder="e.g. Which travel coffee maker is easiest to clean?"/></Field>
      {mode !== "observe" ? <>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Provider"><Choice value={provider} onChange={value => { const p = value as Provider; setProvider(p); setModel(connections[p].model); }} options={[["openai", "OpenAI · Responses API"], ["anthropic", "Anthropic · Messages API"], ["gemini", "Google · Interactions API"]]}/></Field><Field label="Model ID" hint="Use a model available to your account that supports this API and search tool."><Input required maxLength={200} value={model} onChange={e => setModel(e.target.value)} list="collection-models" placeholder="Choose or enter a model ID"/></Field></div>
        <datalist id="collection-models">{connections[provider].models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</datalist>
        <div className="grid gap-4 sm:grid-cols-2"><Field label={mode === "import" ? "Reported search setting" : "Web search"}><Choice value={search} onChange={setSearch} options={[["auto", "Available · model decides"], ["off", "Off · no web search tool"]]}/></Field>{mode === "collect" && <Field label="Maximum output tokens" hint="An output limit, not a total spending limit."><Input required type="number" min={256} max={16384} value={maxTokens} onChange={e => setMaxTokens(Number(e.target.value))}/></Field>}</div>
        {mode === "import" ? <><Field label="Provider response file (.json)" hint="Up to 2 MB. Export the full response object, not just its answer text."><Input type="file" accept=".json,application/json" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1_900_000) { setError("Choose a JSON file smaller than 1.9 MB."); return; } setRaw(await file.text()); setFilename(file.name); setError(""); }}/></Field><Field label={filename ? `Response JSON · ${filename}` : "Or paste response JSON"}><Textarea required rows={5} className="font-mono text-xs" value={raw} onChange={e => { setRaw(e.target.value); setFilename(""); }} placeholder={'{"id": "…", "output": […]}'}/></Field><Note>The imported response is preserved, but its origin and the prompt and settings you enter cannot be independently verified.</Note></> : <>
          {!connections[provider].key && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm"><span>Add your {providerNames[provider]} API key first.</span><Button type="button" size="sm" variant="outline" onClick={onConnect}><KeyRound size={14}/>Open connections</Button></div>}
          <Note>A provider API experiment is a separate environment from the consumer app. Search is optional for the model. Each click makes one request; tokens and tool calls may be billed by your provider. No automatic retries.</Note>
        </>}
      </> : <>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Consumer app"><Choice value={observation.surface} onChange={v => update("surface", v)} options={[["chatgpt", "ChatGPT"], ["claude", "Claude"], ["google_ai_mode", "Google AI Mode"], ["google_ai_overview", "Google AI Overview"], ["gemini", "Gemini"], ["perplexity", "Perplexity"], ["copilot", "Microsoft Copilot"], ["grok", "Grok"], ["other", "Other"]]}/></Field><Field label="Model shown"><Input required value={observation.model} onChange={e => update("model", e.target.value)}/></Field></div>
        <Field label="Answer as displayed"><Textarea required rows={7} maxLength={100000} value={observation.answer} onChange={e => update("answer", e.target.value)} placeholder="Paste the complete visible answer. You can attach screenshots after saving."/></Field>
        <div className="grid gap-4 sm:grid-cols-2"><Field label="Observed at (your local time)"><Input required type="datetime-local" value={observation.observedAt} onChange={e => update("observedAt", e.target.value)}/></Field><Field label="Visible search activity"><Choice value={observation.searchObservation} onChange={v => update("searchObservation", v)} options={[["unknown", "Unknown"], ["search_ui_visible", "Search activity visible"], ["no_search_ui_visible", "No search activity visible"]]}/></Field><Field label="Location"><Input required value={observation.location} onChange={e => update("location", e.target.value)}/></Field><Field label="Language / locale"><Input required value={observation.locale} onChange={e => update("locale", e.target.value)}/></Field><Field label="Mode / plan"><Input required value={observation.mode} onChange={e => update("mode", e.target.value)}/></Field><Field label="Memory / personalization"><Input required value={observation.memory} onChange={e => update("memory", e.target.value)}/></Field></div>
        <Field label="Conversation context"><Input required value={observation.conversation} onChange={e => update("conversation", e.target.value)} placeholder="New conversation, or describe preceding messages"/></Field><Field label="Visible source links" hint="One http or https URL per line. Include only links you actually observed."><Textarea rows={3} value={observation.sources} onChange={e => update("sources", e.target.value)} placeholder="https://…"/></Field><Note>This records your direct observation. It does not automatically log into or query the consumer app.</Note>
      </>}
      <Field label="Research notes (optional)"><Textarea rows={2} maxLength={8000} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Purpose, conditions, or deviations from your research plan"/></Field>
    </fieldset>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}{busy && <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 size={15} className="animate-spin"/>{mode === "collect" ? "Waiting for the provider. Keep this window open; a search can take a few minutes." : "Saving original evidence and record…"}</p>}
    <DialogFooter><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button disabled={busy || (mode === "collect" && !connections[provider].key)}>{busy ? <Loader2 className="animate-spin"/> : mode === "collect" ? <Play/> : <Upload/>}{mode === "collect" ? "Run API experiment" : mode === "observe" ? "Save observation" : "Import response"}</Button></DialogFooter></form>
  </DialogContent></Dialog>;
}
