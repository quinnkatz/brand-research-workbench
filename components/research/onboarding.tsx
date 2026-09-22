"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { profileOf, starterQuestions } from "@/lib/analytics";
import { researchApi } from "@/lib/client";
import { emptyProfile, type BrandProfile, type Study } from "@/lib/research";
import { Field, Note } from "./ui";
export function Onboarding({ study, onClose, onSaved }: { study?: Study; onClose: () => void; onSaved: (id: string) => Promise<void> }) {
  const [step, setStep] = useState(0), [brand, setBrand] = useState(study?.brand || ""), [website, setWebsite] = useState(study?.website || ""), [objective, setObjective] = useState(study?.objective || "");
  const [profile, setProfile] = useState<BrandProfile>(study ? profileOf(study) : emptyProfile()), [competitors, setCompetitors] = useState(study?.profile?.competitors.map(c => c.name).join("\n") || ""), [aliases, setAliases] = useState(study?.profile?.aliases.join(", ") || "");
  const [questions, setQuestions] = useState<ReturnType<typeof starterQuestions>>([]), [selected, setSelected] = useState<number[]>([]), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const update = (key: keyof BrandProfile, value: string) => setProfile(p => ({ ...p, [key]: value }));
  function assembled(): BrandProfile { return { ...profile, aliases: aliases.split(",").map(s => s.trim()).filter(Boolean), competitors: competitors.split("\n").map(s => s.trim()).filter(Boolean).map(name => ({ name, aliases: profile.competitors.find(c => c.name === name)?.aliases || [] })) }; }
  function next(e: React.FormEvent) {
    e.preventDefault(); setError("");
    if (step === 0) { setStep(1); return; }
    const p = assembled();
    if (p.competitors.length > 12) { setError("Choose up to 12 competitors."); return; }
    if (study) { void save(); return; }
    const suggested = starterQuestions(brand, p); setQuestions(suggested); setSelected(suggested.map((_, i) => i)); setStep(2);
  }
  async function save() {
    setBusy(true); setError("");
    try { const result = study ? await researchApi("profile", { studyId: study.id, profile: assembled() }) : await researchApi("onboard", { brand, website, objective, profile: assembled(), questions: questions.filter((_, i) => selected.includes(i)) }); await onSaved(study?.id || result.id); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return <Dialog open onOpenChange={v => { if (!v && !busy) onClose(); }}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl"><DialogHeader><p className="mb-2 text-sm font-medium text-primary">{study ? "Brand context" : "A clear starting point"}</p><DialogTitle className="text-2xl">{step === 0 ? "Tell us about your brand." : step === 1 ? "Define your place in the market." : "Start with the right questions."}</DialogTitle><DialogDescription>{step === 0 ? "Your brand context keeps research focused. You can refine it as you learn." : step === 1 ? "These details guide your research and comparisons; they are not injected into collected answers." : "Review these suggested scenarios. They are a starting point, not measured customer demand."}</DialogDescription></DialogHeader>
    <div className="flex gap-2 py-2" aria-label={`Step ${step + 1} of ${study ? 2 : 3}`}>{[0, 1, ...(study ? [] : [2])].map(i => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-secondary"}`}/>)}</div>
    <form onSubmit={step === 2 ? e => { e.preventDefault(); void save(); } : next} className="space-y-5"><fieldset disabled={busy} className="space-y-5">
      {step === 0 && <><div className="grid gap-4 sm:grid-cols-2"><Field label="Brand name"><Input required minLength={2} maxLength={120} disabled={!!study} placeholder="Your brand" value={brand} onChange={e => setBrand(e.target.value)}/></Field><Field label="Website"><Input type="url" disabled={!!study} placeholder="https://yourbrand.com" value={website} onChange={e => setWebsite(e.target.value)}/></Field></div><Field label="Product category"><Input required maxLength={300} placeholder="e.g. travel coffee makers" value={profile.category} onChange={e => update("category", e.target.value)}/></Field><Field label="Who buys from you?"><Textarea rows={2} maxLength={1200} placeholder="Their situation, needs, and what matters when they choose" value={profile.audience} onChange={e => update("audience", e.target.value)}/></Field><Field label="What do you want to learn?"><Textarea rows={2} disabled={!!study} maxLength={4000} placeholder="e.g. Are we recommended for the right reasons?" value={objective} onChange={e => setObjective(e.target.value)}/></Field></>}
      {step === 1 && <><Field label="How do you want the brand to be understood?" hint="Intended positioning is a research reference, not a verified fact."><Textarea rows={3} maxLength={3000} value={profile.positioning} onChange={e => update("positioning", e.target.value)} placeholder="The promise, strengths, and differences you want customers to understand"/></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Competitors · one per line"><Textarea rows={4} maxLength={1600} value={competitors} onChange={e => setCompetitors(e.target.value)} placeholder={"Competitor one\nCompetitor two"}/></Field><div className="space-y-4"><Field label="Other names for your brand" hint="Comma-separated. Avoid generic words that could produce false matches."><Input maxLength={1500} value={aliases} onChange={e => setAliases(e.target.value)}/></Field><div className="grid gap-3 sm:grid-cols-2"><Field label="Target market"><Input maxLength={120} value={profile.market} onChange={e => update("market", e.target.value)} placeholder="United States"/></Field><Field label="Language"><Input maxLength={120} value={profile.language} onChange={e => update("language", e.target.value)} placeholder="English"/></Field></div></div></div><Note>Market and language describe your research brief. Actual collection conditions are recorded separately; these fields do not impersonate a customer or change a provider's location.</Note></>}
      {step === 2 && <div className="max-h-[44dvh] space-y-3 overflow-y-auto pr-2">{questions.map((q, i) => <div key={i} className="flex items-start gap-3 rounded-lg border p-4"><Checkbox aria-label={`Include question ${i + 1}`} className="mt-2" checked={selected.includes(i)} onCheckedChange={yes => setSelected(s => yes ? [...s, i] : s.filter(x => x !== i))}/><div className="flex-1"><Textarea aria-label={`Question ${i + 1}`} rows={2} value={q.prompt} onChange={e => setQuestions(qs => qs.map((item, n) => n === i ? { ...item, prompt: e.target.value } : item))}/><p className="mt-2 text-xs capitalize text-muted-foreground">{q.intent} · Suggested scenario</p></div></div>)}</div>}
    </fieldset>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter className="items-center sm:justify-between"><Button type="button" variant="ghost" disabled={busy} onClick={() => step ? setStep(step - 1) : onClose()}><ArrowLeft size={15}/>{step ? "Back" : "Cancel"}</Button><Button disabled={busy}>{busy ? <Loader2 className="animate-spin"/> : step === 2 ? <Check size={16}/> : null}{step === 2 ? `Create study · ${selected.length} questions` : study && step === 1 ? "Save brand context" : "Continue"}{step < 2 && <ArrowRight size={15}/>}</Button></DialogFooter></form>
  </DialogContent></Dialog>;
}
