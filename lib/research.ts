export type Provider = "openai" | "anthropic" | "gemini";
export type Surface = Provider | "chatgpt" | "claude" | "google_ai_mode" | "google_ai_overview" | "perplexity" | "copilot" | "grok" | "other";
export const providerNames: Record<string, string> = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini", chatgpt: "ChatGPT", claude: "Claude", google_ai_mode: "Google AI Mode", google_ai_overview: "Google AI Overview", perplexity: "Perplexity", copilot: "Microsoft Copilot", grok: "Grok", other: "Other" };
export const environments: Record<string, string> = { api: "Provider API", consumer: "Consumer app · manual", imported: "API response · imported" };
export type Json = any;
export type Source = { url: string; title?: string; role: string; raw_path: string };
export type Normalized = {
  parser_version: string; provider: string; completion: string; native_status: string | null;
  model_reported: string | null; provider_response_id: string | null; usage: Json;
  segments: { text: string; raw_path: string }[];
  tool_events: { raw_path: string; native: Json }[];
  sources: Source[]; citations: { segment_index: number; raw_path: string; native: Json }[];
  warnings: string[]; unparsed_top_level_events: { raw_path: string; type: string }[];
  search_observation: string; rejected_sources: null; private_ranking_reasons: null;
};
export type BrandProfile = { category: string; audience: string; positioning: string; aliases: string[]; competitors: { name: string; aliases: string[] }[]; market: string; language: string };
export const emptyProfile = (): BrandProfile => ({ category: "", audience: "", positioning: "", aliases: [], competitors: [], market: "", language: "" });
export type Study = { id: string; name: string; brand: string; website: string; objective: string; created_at: string; profile?: BrandProfile };
export type ResearchRecord = { id: string; study_id: string; kind: "fact" | "question" | "review" | "source" | "action" | "analysis"; payload: Json; created_at: string; updated_at: string };
export type CollectionJob = { id: string; study_id: string; batch_id: string; batch_name: string; provider: Provider; model: string; prompt: string; question_id: string | null; repeat_index: number; status: string; run_id: string | null; settings: Json; error: string | null; created_at: string; updated_at: string };
export type Run = { id: string; study_id: string; provider: Surface; environment: string; model: string; prompt: string; status: string; search: string; settings: Json; normalized: Normalized | null; error: string | null; created_at: string; finished_at: string | null; evidence_hash: string | null; attachments?: Attachment[] };
export type Attachment = { id: string; name: string; mime: string; sha256: string; created_at: string };
export function safeUrl(value: string) { try { const u = new URL(value); return ["https:", "http:"].includes(u.protocol) ? u.href : undefined; } catch { return undefined; } }
export function answerOf(run: Run) { return run.normalized?.segments.map(x => x.text).join("\n\n") || ""; }
export function domainOf(value: string) { try { return new URL(value).hostname.replace(/^www\./, ""); } catch { return value; } }
export function uniqueSources(run: Run) { return Array.from(new Set(run.normalized?.sources.map(s => s.url) || [])); }
