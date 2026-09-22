// Perplexity Search API: ranked web results as data, with no model answer.
// https://docs.perplexity.ai/api-reference/search-post
//
// This is the web-ranking baseline, NOT an AI observation. Answers from
// assistants are collected through the provider adapters in ./providers.ts.
import { env } from "cloudflare:workers";
import { AppError, boundedText } from "./server";

export const SEARCH_ENDPOINT = "https://api.perplexity.ai/search";
export const MAX_QUERIES = 5;        // multi-query requests accept up to five queries
export const MAX_RESULTS = 50;       // API maximum; the default is 10
export const MAX_DOMAIN_FILTERS = 20;

export type SearchResult = { title: string; url: string; snippet: string; date: string | null; last_updated: string | null };
export type RankedResult = SearchResult & { rank: number; queries: string[] };
export type SearchOptions = {
  query: string | string[];
  maxResults?: number;
  contextSize?: "low" | "medium" | "high";
  country?: string;
  /** Allowlist ("nature.com") or denylist ("-reddit.com") — one mode per request, max 20. */
  domainFilter?: string[];
  languages?: string[];
  recency?: "hour" | "day" | "week" | "month" | "year";
};

/** Builds the exact request body the Search API documents, rejecting values the API would reject. */
export function searchRequest(options: SearchOptions) {
  const queries = (Array.isArray(options.query) ? options.query : [options.query]).map(q => q.trim()).filter(Boolean);
  if (!queries.length) throw new AppError("Enter a search query.");
  if (queries.length > MAX_QUERIES) throw new AppError(`A search request accepts at most ${MAX_QUERIES} queries.`);
  if (queries.some(q => q.length > 2000)) throw new AppError("A search query is too long.");
  const body: Record<string, unknown> = { query: queries.length === 1 ? queries[0] : queries };

  if (options.maxResults !== undefined) {
    if (!Number.isInteger(options.maxResults) || options.maxResults < 1 || options.maxResults > MAX_RESULTS) throw new AppError(`Choose between 1 and ${MAX_RESULTS} results.`);
    body.max_results = options.maxResults;
  }
  if (options.contextSize) body.search_context_size = options.contextSize;
  if (options.country) {
    if (!/^[A-Za-z]{2}$/.test(options.country)) throw new AppError("Country must be a two-letter ISO 3166-1 alpha-2 code.");
    body.country = options.country.toUpperCase();
  }
  if (options.domainFilter?.length) {
    const domains = options.domainFilter.map(d => d.trim()).filter(Boolean);
    if (domains.length > MAX_DOMAIN_FILTERS) throw new AppError(`A search request accepts at most ${MAX_DOMAIN_FILTERS} domains.`);
    if (domains.some(d => d.startsWith("-")) && domains.some(d => !d.startsWith("-"))) throw new AppError("Use either an allowlist or a denylist of domains, not both.");
    if (domains.some(d => /^https?:\/\//i.test(d))) throw new AppError("Enter domains without a protocol, for example nature.com.");
    body.search_domain_filter = domains;
  }
  if (options.languages?.length) {
    const languages = options.languages.map(l => l.trim().toLowerCase()).filter(Boolean);
    if (languages.length > 20) throw new AppError("A search request accepts at most 20 languages.");
    if (languages.some(l => !/^[a-z]{2}$/.test(l))) throw new AppError("Languages must be two-letter ISO 639-1 codes.");
    body.search_language_filter = languages;
  }
  if (options.recency) body.search_recency_filter = options.recency;
  return { body, queries };
}

/** Merges multi-query responses, de-duplicating by URL and keeping the best (lowest) rank. */
export function rankResults(results: SearchResult[][], queries: string[]): RankedResult[] {
  const merged = new Map<string, RankedResult>();
  results.forEach((list, queryIndex) => {
    list.forEach((item, index) => {
      if (!item || typeof item.url !== "string" || !item.url) return;
      const key = item.url;
      const existing = merged.get(key);
      const query = queries[queryIndex] ?? queries[0];
      if (existing) {
        if (!existing.queries.includes(query)) existing.queries.push(query);
        existing.rank = Math.min(existing.rank, index + 1);
        return;
      }
      merged.set(key, { title: String(item.title ?? ""), url: item.url, snippet: String(item.snippet ?? ""),
        date: item.date ?? null, last_updated: item.last_updated ?? null, rank: index + 1, queries: [query] });
    });
  });
  return [...merged.values()].sort((a, b) => a.rank - b.rank || a.url.localeCompare(b.url));
}

/** The operator's own key, for deployments that search without a per-owner connection. */
export const operatorSearchKey = () => {
  const key = (env as Record<string, unknown>).PERPLEXITY_API_KEY;
  return typeof key === "string" && key.trim() ? key.trim() : null;
};

export async function perplexitySearch(key: string, options: SearchOptions, fetchImpl: typeof fetch = fetch) {
  const { body, queries } = searchRequest(options);
  const response = await fetchImpl(SEARCH_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
  // Credentials never reach a stored record, a log line or an error message.
  const text = (await boundedText(response.body, 4_000_000)).split(key).join("[credential removed]");
  if (!response.ok) {
    const retryAfter = response.headers.get("retry-after");
    let reason = ""; try { const parsed = JSON.parse(text); reason = String(parsed?.error?.message || parsed?.detail || parsed?.message || ""); } catch { reason = text.slice(0, 300); }
    if (response.status === 401) throw new AppError("Perplexity rejected the API key for search. Reconnect the account.", 400);
    if (response.status === 429) throw new AppError(`Perplexity rate-limited this search.${retryAfter ? ` Retry after ${retryAfter} seconds.` : ""} No automatic retry was made.`, 429);
    throw new AppError(`Search returned HTTP ${response.status}.${reason ? ` Provider said: ${reason.slice(0, 300)}` : ""} No automatic retry was made.`, 400);
  }
  let raw: { id?: unknown; results?: unknown };
  try { raw = JSON.parse(text); } catch { throw new AppError("Search returned an unexpected response format."); }
  // A single query returns results[]; a multi-query request returns one list per query.
  const results = Array.isArray(raw.results) ? raw.results : [];
  const lists: SearchResult[][] = Array.isArray(results[0]) ? results as SearchResult[][] : [results as SearchResult[]];
  return { request: { ...body, endpoint: SEARCH_ENDPOINT }, raw, queries, results: rankResults(lists, queries), searchId: typeof raw.id === "string" ? raw.id : null };
}
