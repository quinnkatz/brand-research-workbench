import type { Json, Normalized, Provider } from "./research";
export const endpoints: Record<Provider, string> = {
  openai: "https://api.openai.com/v1/responses",
  xai: "https://api.x.ai/v1/responses",
  // Sonar chat completions (/v1/sonar) is supported only until 2026-09-27; the Agent API replaces it.
  perplexity_api: "https://api.perplexity.ai/v1/agent",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/interactions",
};
export function providerHeaders(provider: Provider, key: string) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (["openai","xai","perplexity_api"].includes(provider)) headers.Authorization = `Bearer ${key}`;
  if (provider === "anthropic") { headers["x-api-key"] = key; headers["anthropic-version"] = "2023-06-01"; }
  if (provider === "gemini") headers["x-goog-api-key"] = key;
  return headers;
}
/** Perplexity Agent API model ids are "perplexity/<model>". Other vendors routed through Perplexity are refused: they would not be Perplexity answers. */
export function perplexityModel(model: string) {
  const id = model.trim();
  if (!id.includes("/")) return `perplexity/${id}`;
  if (id.startsWith("perplexity/")) return id;
  throw new Error("Use a Perplexity model such as sonar or sonar-pro. Other vendors' models routed through Perplexity are not Perplexity answers.");
}
export function makeRequest(provider: Provider, model: string, prompt: string, search: string, maxTokens: number) {
  const active = search === "auto";
  if (provider === "openai") return { model, input: prompt, store: false, max_output_tokens: maxTokens,
    ...(active ? { tools: [{ type: "web_search" }], tool_choice: "auto", include: ["web_search_call.action.sources"] } : {}) };
  if (provider === "xai") return {model,input:[{role:"user",content:prompt}],store:false,max_output_tokens:maxTokens,...(active?{tools:[{type:"web_search"}]}:{})};
  if (provider === "perplexity_api") return { model: perplexityModel(model), input: prompt, max_output_tokens: maxTokens, stream: false,
    ...(active ? { tools: [{ type: "web_search" }] } : {}) };
  if (provider === "anthropic") return { model, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }],
    ...(active ? { tools: [{ type: "web_search_20260318", name: "web_search", max_uses: 3, response_inclusion: "full",
      // Direct calls work on every Claude model (dynamic filtering needs 4.6+) and keep each result block in the answer record.
      allowed_callers: ["direct"] }] } : {}) };
  return { model, input: prompt, store: false, generation_config: { max_output_tokens: maxTokens },
    ...(active ? { tools: [{ type: "google_search" }] } : {}) };
}
const array = (x: Json): Json[] => Array.isArray(x) ? x : [];
const object = (x: Json) => x !== null && typeof x === "object" && !Array.isArray(x);
export function normalize(provider: Provider, raw: Json): Normalized {
  if (!object(raw)) throw new Error("Expected a provider JSON object.");
  const native = provider === "anthropic" ? raw.stop_reason : provider === "perplexity_api" ? raw.status ?? raw.choices?.[0]?.finish_reason : raw.status;
  let completion = ["completed", "end_turn", "stop_sequence", "stop"].includes(native) ? "complete" : ["length", "incomplete", "max_tokens", "pause_turn", "tool_use", "requires_action", "in_progress", "queued", "budget_exceeded"].includes(native) ? "partial" : ["failed", "cancelled", "refusal"].includes(native) ? "failed_or_refused" : "unknown";
  if (raw.error) completion = "failed";
  const out: Normalized = { parser_version: "1.1.0", provider, completion, native_status: native || null,
    model_reported: raw.model || null, provider_response_id: raw.id || null, usage: raw.usage || null,
    segments: [], tool_events: [], sources: [], citations: [], warnings: [], unparsed_top_level_events: [],
    search_observation: "not_disclosed", rejected_sources: null, private_ranking_reasons: null };
  const source = (item: Json, role: string, path: string) => {
    if (object(item) && typeof item.url === "string") out.sources.push({ url: item.url, title: typeof item.title === "string" ? item.title : undefined, role, raw_path: path });
  };
  const segment = (block: Json, path: string) => {
    if (typeof block?.text !== "string") return;
    const idx = out.segments.length;
    out.segments.push({ text: block.text, raw_path: path });
    for (const field of ["annotations", "citations"]) array(block[field]).forEach((citation, n) => {
      if (!object(citation)) { out.warnings.push(`Unexpected citation at ${path}.${field}[${n}]`); return; }
      const location = `${path}.${field}[${n}]`;
      out.citations.push({ segment_index: idx, raw_path: location, native: citation });
      source(citation, "cited", location);
    });
  };
  if (provider === "openai" || provider === "xai") {
    if (!Array.isArray(raw.output)) out.warnings.push("Expected output array missing. Inspect the original response.");
    array(raw.output).forEach((item, i) => {
      if (!object(item)) return;
      const path = `$.output[${i}]`;
      if (item.type === "message") array(item.content).forEach((block, j) => {
        if (block?.type === "output_text") segment(block, `${path}.content[${j}]`);
        if (block?.type === "refusal") { out.completion = "refused"; out.warnings.push("The response contains a refusal."); }
      });
      else if (item.type === "web_search_call") {
        out.search_observation = "tool_activity_disclosed";
        out.tool_events.push({ raw_path: path, native: item });
        array(item.action?.sources).forEach((s, j) => source(s, "provider_disclosed_consulted", `${path}.action.sources[${j}]`));
        if (item.action?.type === "open_page") source(item.action, "open_page_target", `${path}.action`);
        if (["failed", "incomplete"].includes(item.status)) out.warnings.push(`Search tool status ${item.status} at ${path}`);
      } else if (item.type !== "reasoning") out.unparsed_top_level_events.push({ raw_path: path, type: String(item.type) });
    });
  } else if (provider === "perplexity_api" && Array.isArray(raw.output)) {
    // Agent API: Responses-style output items plus Perplexity's own search_results item.
    array(raw.output).forEach((item, i) => {
      if (!object(item)) return;
      const path = `$.output[${i}]`;
      if (item.type === "message") array(item.content).forEach((block, j) => { if (block?.type === "output_text") segment(block, `${path}.content[${j}]`); });
      else if (item.type === "search_results") {
        out.search_observation = "search_results_disclosed";
        out.tool_events.push({ raw_path: path, native: item });
        array(item.results).forEach((r, j) => source(r, "provider_disclosed_search_result", `${path}.results[${j}]`));
      } else if (item.type !== "reasoning") out.unparsed_top_level_events.push({ raw_path: path, type: String(item.type) });
    });
  } else if (provider === "perplexity_api") {
    // Legacy Sonar chat completions: still parsed for imports and earlier runs.
    const choice=raw.choices?.[0];
    if(typeof choice?.message?.content==="string")segment({text:choice.message.content},"$.choices[0].message.content");
    array(raw.citations).forEach((url,i)=>{if(typeof url!=="string")return;source({url},"cited",`$.citations[${i}]`);if(out.segments.length)out.citations.push({segment_index:0,raw_path:`$.citations[${i}]`,native:{url,type:"numbered_citation",citation_number:i+1,scope:"answer_block"}});});
    array(raw.search_results).forEach((s,i)=>source(s,"provider_disclosed_search_result",`$.search_results[${i}]`));
    if(array(raw.search_results).length){out.tool_events.push({raw_path:"$.search_results",native:{type:"disclosed_search_results",results:raw.search_results}});out.search_observation="search_results_disclosed";}
    if(raw.usage?.num_search_queries)out.tool_events.push({raw_path:"$.usage",native:{type:"search_usage",num_search_queries:raw.usage.num_search_queries}});
    out.warnings.push("Numbered citations are retained at answer-block scope. Their placement and support for individual claims require inspection.");
  } else if (provider === "anthropic") {
    if (!Array.isArray(raw.content)) out.warnings.push("Expected content array missing. Inspect the original response.");
    array(raw.content).forEach((block, i) => {
      if (block?.type === "text") segment(block, `$.content[${i}]`);
      else if (!["server_tool_use", "web_search_tool_result", "thinking", "redacted_thinking"].includes(block?.type)) out.unparsed_top_level_events.push({ raw_path: `$.content[${i}]`, type: String(block?.type) });
    });
    const walk = (value: Json, path: string, depth: number) => {
      if (depth > 32) { out.warnings.push("Nested evidence exceeded parser depth. Original response retained."); return; }
      if (Array.isArray(value)) { value.forEach((v, i) => walk(v, `${path}[${i}]`, depth + 1)); return; }
      if (!object(value)) return;
      const kind = typeof value.type === "string" ? value.type : "";
      if (kind === "server_tool_use" || kind.endsWith("tool_result")) out.tool_events.push({ raw_path: path, native: value });
      if ((kind === "server_tool_use" && value.name === "web_search") || kind === "web_search_tool_result") out.search_observation = "tool_activity_disclosed";
      if (kind === "web_search_result") source(value, "provider_disclosed_search_result", path);
      if (kind.endsWith("tool_result_error")) out.warnings.push(`Tool error at ${path}: ${value.error_code || "unknown"}`);
      Object.entries(value).forEach(([k, v]) => walk(v, `${path}.${k}`, depth + 1));
    };
    walk(raw.content, "$.content", 0);
  } else {
    if (!Array.isArray(raw.steps)) out.warnings.push("Expected Interactions steps missing. generateContent uses a different schema.");
    array(raw.steps).forEach((item, i) => {
      if (!object(item)) return;
      const path = `$.steps[${i}]`;
      if (item.type === "model_output") array(item.content).forEach((block, j) => { if (block?.type === "text") segment(block, `${path}.content[${j}]`); });
      else if (["google_search_call", "google_search_result"].includes(item.type)) {
        out.search_observation = "tool_activity_disclosed";
        out.tool_events.push({ raw_path: path, native: item });
      } else if (item.type !== "thought") out.unparsed_top_level_events.push({ raw_path: path, type: String(item.type) });
    });
  }
  if (out.unparsed_top_level_events.length) out.warnings.push("Some event types were not parsed. They remain in the original response.");
  if (!out.segments.length) out.warnings.push("No answer text extracted. Do not count this as a brand omission.");
  if (out.completion !== "complete") out.warnings.push("This is not known to be a completed answer. Exclude it from completed-answer metrics.");
  // Keep index rows bounded. Large native events remain intact in object storage.
  if (new TextEncoder().encode(JSON.stringify(out)).byteLength > 650000) {
    out.tool_events = out.tool_events.map(event => ({ raw_path: event.raw_path, native: { type: event.native.type, name: event.native.name, notice: "Large event: inspect this path in Original record for the full native data." } }));
    out.warnings.push("Large tool events are summarized in this view. Full events remain in the original record.");
  }
  if (new TextEncoder().encode(JSON.stringify(out)).byteLength > 850000) {
    out.segments = []; out.citations = []; out.sources = [];
    out.warnings.push("This response exceeds the inspection index size limit. Read its full answer and sources in Original record; do not score the empty index as an omission.");
  }
  return out;
}
