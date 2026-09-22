import { answerOf, domainOf, emptyProfile, type BrandProfile, type ResearchRecord, type Run, type Study } from "./research";

export type Scope = { environment: string; provider: string; intent: string; from: string; to: string; query: string; topic:string; audience:string; market:string; language:string; purpose:string; productId:string };
export const emptyScope = (): Scope => ({ environment: "consumer", provider: "all", intent: "all", from: "", to: "", query: "", topic:"all",audience:"all",market:"all",language:"all",purpose:"all",productId:"all" });
export function observedAt(run: Run) { return run.environment === "consumer" && run.settings?.observedAt ? run.settings.observedAt : run.created_at; }
export function eligible(run: Run) { return ["complete", "manually_recorded"].includes(run.status) && !!answerOf(run).trim(); }
export function profileOf(study?: Study): BrandProfile { return { ...emptyProfile(), ...study?.profile }; }
export function scopeRuns(runs: Run[], records: ResearchRecord[], scope: Scope) {
  const questions = records.filter(r => r.kind === "question");
  return runs.filter(r => {
    if (scope.environment !== "all" && r.environment !== scope.environment) return false;
    if (scope.provider !== "all" && r.provider !== scope.provider) return false;
    const day = observedAt(r).slice(0, 10);
    if (scope.from && day < scope.from || scope.to && day > scope.to) return false;
    const intent = r.settings?.intent;
    if (scope.intent !== "all" && intent !== scope.intent) return false;
    for(const key of ["topic","audience","market","language","purpose","productId"] as const){const wanted=scope[key];if(wanted&&wanted!=="all"&&(r.settings?.questionContext?.[key]||(key==="purpose"?"unclassified":""))!==wanted)return false;}
    return !scope.query || `${r.prompt}\n${answerOf(r)}`.toLocaleLowerCase().includes(scope.query.toLocaleLowerCase());
  });
}
export function mentioned(text: string, aliases: string[]) {
  const normalized = text.normalize("NFKC");
  return aliases.filter(a => a.trim().length > 1).some(alias => {
    const escaped = alias.trim().normalize("NFKC").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "iu").test(normalized);
  });
}
export function citationUrls(run: Run) {
  return new Set((run.normalized?.sources || []).filter(s => s.role === "cited").map(s => s.url));
}
export function measure(study: Study, runs: Run[], records: ResearchRecord[]) {
  const good = runs.filter(eligible), profile = profileOf(study);
  const entities = [{ name: study.brand, aliases: profile.aliases }, ...profile.competitors];
  const brands = entities.map(entity => {
    const matches = good.filter(r => mentioned(answerOf(r), [entity.name, ...entity.aliases]));
    return { name: entity.name, own: entity.name === study.brand, runIds: matches.map(r => r.id), mentions: matches.length, denominator: good.length,
      rate: good.length ? matches.length / good.length * 100 : null, prompts: new Set(matches.map(r => r.prompt)).size };
  });
  const totalMentions = brands.reduce((n, b) => n + b.mentions, 0);
  const domainMap = new Map<string, { domain: string; urls: Set<string>; runIds: Set<string>; citedIds: Set<string>; manualIds: Set<string>; roles: Set<string> }>();
  for (const r of good) for (const s of r.normalized?.sources || []) {
    const domain = domainOf(s.url); const entry = domainMap.get(domain) || { domain, urls: new Set(), runIds: new Set(), citedIds: new Set(), manualIds: new Set(), roles: new Set() };
    entry.urls.add(s.url); entry.runIds.add(r.id); entry.roles.add(s.role);
    if (s.role === "cited") entry.citedIds.add(r.id);
    if (s.role === "manually_recorded_link") entry.manualIds.add(r.id);
    domainMap.set(domain, entry);
  }
  const days = Array.from(new Set(good.map(r => observedAt(r).slice(0, 10)))).sort().map(date => {
    const observations = good.filter(r => observedAt(r).startsWith(date));
    const count = observations.filter(r => mentioned(answerOf(r), [study.brand, ...profile.aliases])).length;
    return { date, mentions: count, denominator: observations.length, rate: count / observations.length * 100, runIds: observations.map(r => r.id) };
  });
  const ids = new Set(good.map(r => r.id));
  const reviews = records.filter(r => r.kind === "review" && ids.has(r.payload.runId));
  return { eligible: good, excluded: runs.filter(r => !eligible(r)), brands: brands.map(b => ({ ...b, share: totalMentions ? b.mentions / totalMentions * 100 : null })),
    domains: [...domainMap.values()].map(d => ({ ...d, urls: [...d.urls], runIds: [...d.runIds], citedIds: [...d.citedIds], manualIds: [...d.manualIds], roles: [...d.roles] })).sort((a, b) => b.runIds.length - a.runIds.length),
    days, reviews, promptCount: new Set(good.map(r => r.prompt)).size, methods: [...new Set(good.map(r => r.environment))],
    searchDisclosed: good.filter(r => r.normalized?.search_observation === "tool_activity_disclosed" || r.normalized?.search_observation === "search_ui_visible" || r.normalized?.search_observation === "search_results_disclosed").length };
}
export function starterQuestions(brand: string, profile: BrandProfile) {
  const category = profile.category.trim() || "products in this category";
  // The audience field is free text ("Their situation, needs…"). Short phrases read naturally inline;
  // longer descriptions go after the question as buyer context, the way people actually type into assistants.
  const audience = (profile.audience.trim() || "someone buying for the first time").replace(/[\s.!?;:,]+$/, "");
  const inline = audience.split(/\s+/).length <= 8;
  const forAudience = (question: string) => inline ? `${question} for ${audience}` : question;
  const context = inline ? "" : ` I'm buying for: ${audience}.`;
  const competitors = profile.competitors.map(c => c.name);
  return [
    { prompt: `${forAudience(`What are the best ${category}`)}?${context}`, intent: "discovery" },
    { prompt: `What should I look for when choosing ${category}?`, intent: "discovery" },
    { prompt: `Which ${category} offer good value, and what are the tradeoffs?`, intent: "purchase" },
    { prompt: `${forAudience(`Which ${category} would you recommend`)}, and why?${context}`, intent: "purchase" },
    { prompt: `What is ${brand} known for?`, intent: "verification" },
    { prompt: `Who is ${brand} best suited for, and who might prefer something else?`, intent: "comparison" },
    { prompt: `What are the most common criticisms of ${brand}?`, intent: "verification" },
    { prompt: `What should I verify before buying from ${brand}?`, intent: "purchase" },
    ...(competitors[0] ? [{ prompt: `${forAudience(`How does ${brand} compare with ${competitors[0]}`)}?${context}`, intent: "comparison" }] : []),
    { prompt: `What alternatives to ${brand} should I consider?`, intent: "comparison" },
    { prompt: `What are ${brand}'s return and warranty policies?`, intent: "support" },
  ].map(q => ({ ...q, origin: "template", notes: "Suggested research scenario. Review the wording; this is not observed search demand.", tags: [] }));
}

export type AnalysisEvidence = { runId: string; quote: string };
export type AnalysisTheme = { title: string; description: string; tone: "positive" | "negative" | "mixed" | "neutral"; evidence: AnalysisEvidence[] };
export function validateAnalysis(raw: any, runs: Run[], facts: ResearchRecord[]) {
  if (!raw || !Array.isArray(raw.themes) || !Array.isArray(raw.findings)) throw new Error("The analysis was not in the expected format. Original response retained.");
  let rejected = 0;
  const evidence = (values: any): AnalysisEvidence[] => (Array.isArray(values) ? values : []).slice(0, 30).flatMap((v: any) => {
    const run = runs.find(r => r.id === v?.runId);
    if (!run || typeof v.quote !== "string" || v.quote.trim().length < 8 || v.quote.length > 3000 || !answerOf(run).includes(v.quote)) { rejected++; return []; }
    return [{ runId: run.id, quote: v.quote }];
  });
  const themes = raw.themes.slice(0, 12).flatMap((t: any) => {
    const supporting = evidence(t.evidence);
    if (!supporting.length || typeof t.title !== "string" || typeof t.description !== "string") return [];
    return [{ title: t.title.slice(0, 180), description: t.description.slice(0, 2500), tone: ["positive", "negative", "mixed", "neutral"].includes(t.tone) ? t.tone : "neutral", evidence: supporting }];
  });
  const findings = raw.findings.slice(0, 15).flatMap((f: any) => {
    const supporting = evidence(f.evidence);
    if (!supporting.length || typeof f.title !== "string" || typeof f.explanation !== "string") return [];
    const factIds = (Array.isArray(f.factIds) ? f.factIds : []).filter((id: unknown) => typeof id === "string" && facts.some(fact => fact.id === id));
    return [{ title: f.title.slice(0, 180), explanation: f.explanation.slice(0, 4000), type: ["potential_conflict", "positioning", "buyer_fit", "needs_evidence"].includes(f.type) ? f.type : "needs_evidence", evidence: supporting, factIds,
      recommendation: typeof f.recommendation === "string" ? f.recommendation.slice(0, 3000) : "", status: "needs_review" }];
  });
  return { themes, findings, rejectedEvidence: rejected, summary: typeof raw.summary === "string" ? raw.summary.slice(0, 3000) : "", methodVersion: "narrative-review-v1", status: "needs_review" };
}

export function reviewedThemes(analysis:ResearchRecord|undefined,records:ResearchRecord[]){
 if(!analysis)return [];return (analysis.payload.themes||[]).map((item:any,index:number)=>{const review=records.filter(r=>r.kind==="classification"&&r.payload.method==="human_analysis_review"&&r.payload.analysisId===analysis.id&&r.payload.section==="themes"&&r.payload.index===index).sort((a,b)=>b.updated_at.localeCompare(a.updated_at))[0];return {...item,index,review,status:review?.payload.verdict||"needs_review",title:review?.payload.title||item.title,description:review?.payload.interpretation||item.description};}).filter((item:any)=>item.status!=="rejected");
}
