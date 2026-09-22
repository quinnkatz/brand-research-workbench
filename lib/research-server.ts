import { z } from "zod";
import { AppError, boundedText, bucket, db, hash, publicRun, saveEvidence } from "./server";
import { endpoints, makeRequest, normalize, providerHeaders } from "./providers";
import { emptyProfile, type Provider } from "./research";

const short = (n: number) => z.string().trim().max(n);
export const profileSchema = z.object({
  category: short(300).default(""), audience: short(1200).default(""), positioning: short(3000).default(""),
  aliases: z.array(short(120).min(2)).max(20).default([]),
  competitors: z.array(z.object({ name: short(120).min(2), aliases: z.array(short(120).min(2)).max(20).default([]) })).max(12).default([]),
  market: short(120).default(""), language: short(120).default(""),
});
export function publicStudy(row: any) {
  const { owner_id, profile, ...rest } = row;
  let parsed = {}; try { parsed = typeof profile === "string" ? JSON.parse(profile) : profile || {}; } catch { /* legacy record */ }
  return { ...rest, profile: { ...emptyProfile(), ...parsed } };
}
export function publicJob(row: any) { const { owner_id, ...rest } = row; return { ...rest, repeat_index: Number(rest.repeat_index), settings: JSON.parse(rest.settings) }; }
export async function appendRecord(uid: string, studyId: string, kind: string, payload: unknown) {
  const id = crypto.randomUUID(), now = new Date().toISOString();
  await db().prepare("INSERT INTO records (id, owner_id, study_id, kind, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, uid, studyId, kind, JSON.stringify(payload), now, now).run();
  return id;
}
export async function providerCall(provider: Provider, model: string, prompt: string, key: string, search = "off", maxTokens = 8192) {
  const request = makeRequest(provider, model, prompt, search, maxTokens);
  const response = await fetch(endpoints[provider], { method: "POST", headers: providerHeaders(provider, key), body: JSON.stringify(request), redirect: "manual", signal: AbortSignal.timeout(150000) });
  const responseText = (await boundedText(response.body, 4_000_000)).split(key).join("[credential removed]");
  let raw: any; let parseError: string | null = null;
  try { raw = JSON.parse(responseText); if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(); }
  catch { raw = null; parseError = `The provider returned an unexpected response format (HTTP ${response.status}). Inspect the preserved response text.`; }
  let normalized;
  try { normalized = normalize(provider, raw || { error: { message: parseError } }); }
  catch { parseError = "The response parser could not index this format. The original response is preserved for inspection."; normalized = normalize(provider, { error: { message: parseError } }); }
  if (parseError) normalized.warnings.push(parseError);
  return { request, raw, responseText, httpStatus: response.status, ok: response.ok && !parseError, normalized };
}
export async function executeJob(uid: string, jobId: string, key: string) {
  const job = await db().prepare("SELECT * FROM collection_jobs WHERE id = ? AND owner_id = ?").bind(jobId, uid).first<any>();
  if (!job) throw new AppError("Collection item not found.", 404);
  if (job.status !== "queued") return { id: job.run_id, status: job.status, alreadyStarted: true };
  const now = new Date().toISOString(), runId = crypto.randomUUID(), settings = JSON.parse(job.settings);
  const claimed = await db().prepare("UPDATE collection_jobs SET status = 'running', run_id = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND status = 'queued'").bind(runId, now, jobId, uid).run();
  if (claimed.meta.changes !== 1) {const existing=await db().prepare("SELECT run_id,status FROM collection_jobs WHERE id=? AND owner_id=?").bind(jobId,uid).first<any>();return {id:existing?.run_id,status:existing?.status,alreadyStarted:true};}
  let phase = "creating_run";
  let retained: { key: string; digest: string } | null = null;
  try {
    await db().prepare("INSERT INTO runs (id, owner_id, study_id, provider, environment, model, prompt, status, search, settings, created_at) VALUES (?, ?, ?, ?, 'api', ?, ?, 'running', ?, ?, ?)")
      .bind(runId, uid, job.study_id, job.provider, job.model, job.prompt, settings.search, JSON.stringify({ ...settings, batchId: job.batch_id, jobId, questionId: job.question_id, repeatIndex: Number(job.repeat_index), userLocation: null, domainFilters: null }), now).run();
    phase = "provider_request";
    const result = await providerCall(job.provider, job.model, job.prompt, key, settings.search, settings.maxTokens);
    phase = "retaining_evidence";
    const evidence = await saveEvidence(uid, runId, { format: "provider-run-v2", startedAt: now, completedAt: new Date().toISOString(), endpoint: endpoints[job.provider as Provider], ...result, normalized: undefined });
    retained = evidence;
    phase = "indexing_result";
    const status = result.ok ? result.normalized.completion : "failed";
    const error = result.ok ? null : `Provider HTTP ${result.httpStatus}. Inspect the saved original response for details.`;
    await db().batch([
      db().prepare("UPDATE runs SET status = ?, normalized = ?, evidence_key = ?, evidence_hash = ?, error = ?, finished_at = ? WHERE id = ? AND owner_id = ?").bind(status, JSON.stringify(result.normalized), evidence.key, evidence.digest, error, new Date().toISOString(), runId, uid),
      db().prepare("UPDATE collection_jobs SET status = ?, error = ?, updated_at = ? WHERE id = ? AND owner_id = ?").bind(status === "complete" ? "complete" : "needs_attention", error || (status === "complete" ? null : `Response status: ${status}.`), new Date().toISOString(), jobId, uid),
    ]);
    return { id: runId, status };
  } catch {
    const error = "Collection interrupted. The provider may have processed or billed the request. Inspect your account before creating a replacement; it will not retry automatically.";
    if (!retained) { try { retained = await saveEvidence(uid, runId, { format: "provider-run-failure-v2", startedAt: now, phase, endpoint: endpoints[job.provider as Provider], request: makeRequest(job.provider, job.model, job.prompt, settings.search, settings.maxTokens), error }); } catch {} }
    await db().batch([
      db().prepare("UPDATE runs SET status = 'failed', error = ?, evidence_key = ?, evidence_hash = ?, finished_at = ? WHERE id = ? AND owner_id = ?").bind(error, retained?.key || null, retained?.digest || null, new Date().toISOString(), runId, uid),
      db().prepare("UPDATE collection_jobs SET status = 'needs_attention', error = ?, updated_at = ? WHERE id = ? AND owner_id = ?").bind(error, new Date().toISOString(), jobId, uid),
    ]);
    return { id: runId, status: "failed" };
  }
}
export async function reportFromToken(token: string) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw new AppError("This report link is unavailable.", 404);
  const row = await db().prepare("SELECT * FROM report_snapshots WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?").bind(await hash(token), new Date().toISOString()).first<any>();
  if (!row) throw new AppError("This report link has expired or been withdrawn.", 404);
  const file = await bucket().get(row.object_key);
  if (!file) throw new AppError("The saved report could not be loaded.", 503);
  return { row, snapshot: await file.json<any>() };
}
