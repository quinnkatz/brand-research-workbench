import { z } from "zod";
import { captureText } from "@/lib/source-capture";
import { validAnchor } from "@/lib/claims";
import type { Run } from "@/lib/research";
import { AppError, audit, boundedText, bucket, db, failure, idSchema, jsonBody, ownRun, ownStudy, owner, publicRecord, publicRun, reply, saveEvidence, urlSchema } from "@/lib/server";
import { endpoints, makeRequest, normalize, providerHeaders } from "@/lib/providers";
import { publicStudy } from "@/lib/research-server";
import type { Normalized, Provider } from "@/lib/research";
import { connectionFor, openSecret, savedKey } from "@/lib/vault";
export const dynamic = "force-dynamic";
const providerSchema = z.enum(["openai", "anthropic", "gemini", "perplexity_api", "xai"]);
const text = (max = 10000) => z.string().trim().min(1).max(max);
const exactText = (max: number) => z.string().min(1).max(max).refine(v => !!v.trim(), "Text cannot be blank.");
const optionalText = (max = 10000) => z.string().max(max).default("");
const factSchema = z.object({ claim: text(4000), product: optionalText(300), productId: idSchema.optional(), source: urlSchema, excerpt: text(8000), checkedAt: text(50), status: z.enum(["verified", "needs_review", "disputed"]), notes: optionalText(8000) });
const questionSchema = z.object({ prompt: exactText(12000), intent: z.enum(["discovery", "comparison", "verification", "purchase", "support"]), notes: optionalText(4000), origin: z.enum(["customer", "researcher", "template", "ai_suggested"]).default("researcher"), tags: z.array(text(60)).max(12).default([]), audience: optionalText(300), market: optionalText(100), language: optionalText(100), topic: optionalText(100), purpose:z.enum(["baseline","diagnostic","injected_facts"]).default("baseline"), productId: idSchema.optional() });
const reviewSchema = z.object({ runId: idSchema, claim: exactText(6000), anchor: z.object({ segmentIndex: z.number().int().min(0), start: z.number().int().min(0), end: z.number().int().min(1) }).nullable().optional(), impact: optionalText(4000), recommendation: optionalText(8000), verdict: z.enum(["supported", "contradicted", "uncertain", "mixed", "context_dependent", "omitted"]), evidenceLevel: z.enum(["observed", "inferred", "experimentally_supported", "unknown"]), materiality: z.enum(["low", "medium", "high"]), factIds: z.array(idSchema).max(50), sourceRefs: z.array(z.object({sourceId:idSchema,start:z.number().int().min(0),end:z.number().int().min(1),text:exactText(8000)})).max(10).default([]), explanation: text(10000), hypothesis: optionalText(8000), nextTest: optionalText(8000) });

async function studyData(studyId: string, uid: string) {
  const access = await ownStudy(studyId, uid); uid = access.owner_id;
  const [records, runs, count] = await Promise.all([
    db().prepare("SELECT * FROM records WHERE study_id = ? AND owner_id = ? ORDER BY created_at DESC").bind(studyId, uid).all(),
    db().prepare("SELECT * FROM runs WHERE study_id = ? AND owner_id = ? ORDER BY created_at DESC, id DESC LIMIT 500").bind(studyId, uid).all(),
    db().prepare("SELECT count(*) AS n FROM runs WHERE study_id = ? AND owner_id = ?").bind(studyId, uid).first<any>(),
  ]);
  return { records: records.results.map(publicRecord), runs: runs.results.map(publicRun), totalRuns: Number(count?.n || 0) };
}
export async function GET(req: Request) {
  try {
    const uid = await owner(req); const params = new URL(req.url).searchParams; const action = params.get("action") || "state";
    if (action === "state") {
      const studies = await db().prepare("SELECT s.*, CASE WHEN s.owner_id = ? THEN 'owner' ELSE m.role END AS access_role FROM studies s LEFT JOIN study_members m ON m.study_id = s.id AND m.user_id = ? WHERE s.owner_id = ? OR m.user_id = ? ORDER BY s.created_at DESC").bind(uid, uid, uid, uid).all();
      const id = params.get("studyId") || (studies.results[0]?.id as string | undefined);
      return reply({ studies: studies.results.map(publicStudy), studyId: id || null, ...(id ? await studyData(idSchema.parse(id), uid) : { records: [], runs: [] }) });
    }
    if (action === "runs_page") {
      const studyId=idSchema.parse(params.get("studyId")),study=await ownStudy(studyId,uid),cursor=idSchema.parse(params.get("before"));
      const last=await ownRun(cursor,uid);if(last.study_id!==studyId)throw new AppError("The cursor belongs to another study.");
      const rows=await db().prepare("SELECT * FROM runs WHERE study_id=? AND owner_id=? AND (created_at < ? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT 200").bind(studyId,study.owner_id,last.created_at,last.created_at,cursor).all();
      return reply({runs:rows.results.map(publicRun)});
    }
    if (action === "run") {
      const row = await ownRun(idSchema.parse(params.get("id")), uid);
      const files = await db().prepare("SELECT id, name, mime, sha256, created_at FROM attachments WHERE run_id = ? AND owner_id = ? ORDER BY created_at").bind(row.id, row.owner_id).all();
      return reply({ run: { ...publicRun(row), attachments: files.results } });
    }
    if (action === "evidence") {
      const row = await ownRun(idSchema.parse(params.get("id")), uid);
      if (!row.evidence_key) throw new AppError("No original response was recorded for this run.", 404);
      const original = await bucket().get(row.evidence_key);
      if (!original) throw new AppError("The evidence file could not be found.", 404);
      return new Response(original.body, { headers: { "Content-Type": "application/json", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
    }
    if (action === "export") {
      const studyId = idSchema.parse(params.get("studyId")); const study = await ownStudy(studyId, uid);
      const data = await studyData(studyId, uid); const safeStudy = publicStudy(study);
      // Full originals are downloaded individually to keep large studies safe to export.
      return reply({ format: "brand-research-workbench", version: 1, exportedAt: new Date().toISOString(), study: safeStudy, ...data,
        note: "Structured study export (up to 500 latest runs). Original provider responses and attachments are available in each run's Evidence tab." });
    }
    throw new AppError("Unknown operation.", 404);
  } catch (e) { return failure(e); }
}

export async function POST(req: Request) {
  try {
    const actor = await owner(req, true); let uid = actor; const body = await jsonBody(req); const now = new Date().toISOString();
    if (body.action === "study") {
      const v = z.object({ id: idSchema.optional(), name: text(120), brand: text(120), website: z.union([urlSchema, z.literal("")]).default(""), objective: optionalText(4000) }).parse(body);
      if (v.id) {
        uid = (await ownStudy(v.id, actor, "write")).owner_id;
        await db().prepare("UPDATE studies SET name = ?, brand = ?, website = ?, objective = ? WHERE id = ? AND owner_id = ?").bind(v.name, v.brand, v.website, v.objective, v.id, uid).run();
        return reply({ id: v.id });
      }
      const id = crypto.randomUUID();
      await db().prepare("INSERT INTO studies (id, owner_id, name, brand, website, objective, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, uid, v.name, v.brand, v.website, v.objective, now).run();
      return reply({ id }, 201);
    }
    if (body.action === "record") {
      const { studyId, kind, id } = z.object({ studyId: idSchema, kind: z.enum(["fact", "question", "review"]), id: idSchema.optional() }).parse(body);
      uid = (await ownStudy(studyId, actor, "write")).owner_id;
      const payload = kind === "fact" ? factSchema.parse(body.payload) : kind === "question" ? questionSchema.parse(body.payload) : reviewSchema.parse(body.payload);
      if((payload as any).productId){const product=await db().prepare("SELECT * FROM records WHERE id=? AND study_id=? AND owner_id=? AND kind='product'").bind((payload as any).productId,studyId,uid).first();if(!product)throw new AppError("Choose a product in this brand workspace.");Object.assign(payload,{productSnapshot:publicRecord(product)});}
      if (kind === "review") {
        const review = reviewSchema.parse(payload); const run = await ownRun(review.runId, uid);
        if (run.study_id !== studyId) throw new AppError("The run belongs to a different study.");
        if (review.anchor && !validAnchor(publicRun(run) as Run, review.anchor, review.claim)) throw new AppError("The selected passage no longer matches the recorded answer. Select it again before saving.");
        const factSnapshots = [];
        for (const factId of review.factIds) {
          const fact = await db().prepare("SELECT * FROM records WHERE id = ? AND owner_id = ? AND study_id = ? AND kind = 'fact'").bind(factId, uid, studyId).first();
          if (!fact) throw new AppError("One of the selected facts is no longer available.");
          factSnapshots.push(publicRecord(fact));
        }
        const sourceSnapshots=[];
        for(const reference of review.sourceRefs){
          const row=await db().prepare("SELECT * FROM records WHERE id=? AND owner_id=? AND study_id=? AND kind='source'").bind(reference.sourceId,uid,studyId).first();
          if(!row)throw new AppError("The selected source does not belong to this study.");
          const source=publicRecord(row),p=source.payload;
          const text=p.provenance==="application_retrieved_later"?(await captureText(uid,source)).text:p.provenance==="researcher_supplied_capture"?p.excerpt:"";
          if(!text||reference.end>text.length||reference.end<=reference.start||text.slice(reference.start,reference.end)!==reference.text)throw new AppError("The selected source excerpt does not match its preserved text.");
          sourceSnapshots.push({...reference,captureId:p.captureId,url:p.url,finalUrl:p.finalUrl,provenance:p.provenance,capturedAt:p.capturedAt,contentHash:p.contentHash});
        }
        Object.assign(payload, { factSnapshots,sourceSnapshots,reviewerId:actor,reviewedAt:now,provider:run.provider,environment:run.environment });
      }
      if (id) {
        const old = await db().prepare("SELECT * FROM records WHERE id = ? AND owner_id = ? AND study_id = ? AND kind = ?").bind(id, uid, studyId, kind).first<any>();
        if (!old) throw new AppError("Record not found.", 404);
        if (body.expectedUpdatedAt && body.expectedUpdatedAt !== old.updated_at) throw new AppError("This record changed in another session. Refresh before saving.", 409);
        const result = await db().batch([
          db().prepare("INSERT INTO record_history (id, record_id, owner_id, study_id, kind, payload, recorded_at) SELECT ?, id, owner_id, study_id, kind, payload, ? FROM records WHERE id = ? AND owner_id = ? AND updated_at = ?").bind(crypto.randomUUID(), now, id, uid, old.updated_at),
          db().prepare("UPDATE records SET payload = ?, updated_at = ? WHERE id = ? AND owner_id = ? AND updated_at = ?").bind(JSON.stringify(payload), now, id, uid, old.updated_at),
        ]);
        if (result[1].meta.changes !== 1) throw new AppError("This record changed in another session. Refresh before saving.", 409);
        await audit(studyId,actor,`${kind}_updated`,id,{});
        return reply({ id });
      }
      const newId = crypto.randomUUID();
      await db().prepare("INSERT INTO records (id, owner_id, study_id, kind, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(newId, uid, studyId, kind, JSON.stringify(payload), now, now).run();
      await audit(studyId,actor,`${kind}_created`,newId,{});
      return reply({ id: newId }, 201);
    }
    if (body.action === "models") {
      const { provider, connectionId, key: enteredKey } = z.object({ provider: providerSchema, connectionId:idSchema.optional(), key: z.string().trim().min(10).max(512).optional() }).parse(body);
      const key = connectionId ? await openSecret(await connectionFor(actor,connectionId,provider)) : z.string().min(10).max(512).parse(enteredKey);
      if(provider==="perplexity_api")throw new AppError("Sonar model IDs are entered directly. Use a Sonar model such as sonar or sonar-pro; verify account access with a deliberate collection request.");
      const url = provider === "xai" ? "https://api.x.ai/v1/models" : provider === "openai" ? "https://api.openai.com/v1/models" : provider === "anthropic" ? "https://api.anthropic.com/v1/models?limit=1000" : "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000";
      const res = await fetch(url, { headers: providerHeaders(provider, key), redirect: "manual", signal: AbortSignal.timeout(20000) });
      if (!res.ok) { await res.body?.cancel(); throw new AppError(`The provider returned HTTP ${res.status}. Check the API key, account access, and billing settings.`, 400); }
      const raw = JSON.parse(await boundedText(res.body));
      const models = (provider === "gemini" ? raw.models || [] : raw.data || []).map((m: any) => ({ id: String(m.id || m.name || "").replace(/^models\//, ""), name: String(m.display_name || m.displayName || m.id || m.name || "") })).filter((m: any) => m.id).sort((a: any, b: any) => a.id.localeCompare(b.id));
      return reply({ models, note: "Account model list. Listing a model does not guarantee it supports this app's search tool." });
    }
    if (["collect", "import", "observe"].includes(body.action)) {
      const base = z.object({ studyId: idSchema, prompt: exactText(12000), model: text(200), notes: optionalText(8000) }).parse(body);
      uid = (await ownStudy(base.studyId, actor, "write")).owner_id; bucket();
      const id = crypto.randomUUID();
      if (body.action === "observe") {
        const v = z.object({ surface: z.enum(["chatgpt", "claude", "google_ai_mode", "google_ai_overview", "gemini", "perplexity", "copilot", "grok", "other"]), answer: exactText(100000), observedAt: z.string().datetime(), location: text(300), locale: text(100), memory: text(300), conversation: text(2000), mode: text(300), searchObservation: z.enum(["search_ui_visible", "no_search_ui_visible", "unknown"]), sources: z.array(z.object({ url: urlSchema, title: optionalText(500) })).max(150) }).parse(body);
        const normalized: Normalized = { parser_version: "manual-1.0.0", provider: v.surface, completion: "manually_recorded", native_status: null, model_reported: base.model, provider_response_id: null, usage: null,
          segments: [{ text: v.answer, raw_path: "$.observation.answer" }], tool_events: [], citations: [],
          sources: v.sources.map((s, i) => ({ ...s, role: "manually_recorded_link", raw_path: `$.observation.sources[${i}]` })),
          warnings: ["Manually transcribed observation. Source roles, completeness, and settings are reported by the observer."],
          unparsed_top_level_events: [], search_observation: v.searchObservation, rejected_sources: null, private_ranking_reasons: null };
        const settings = { observedAt: v.observedAt, location: v.location, locale: v.locale, memory: v.memory, conversation: v.conversation, mode: v.mode, notes: base.notes };
        const evidence = await saveEvidence(uid, id, { format: "manual-observation-v1", recordedAt: now, prompt: base.prompt, observation: v, settings });
        await insertRun({ id, uid, base, provider: v.surface, environment: "consumer", search: "observer_reported", settings, normalized, evidence, now });
        return reply({ id }, 201);
      }
      const v = z.object({ provider: providerSchema, search: z.enum(["auto", "off"]), maxTokens: z.number().int().min(256).max(16384).default(4096) }).parse(body);
      if (body.action === "import") {
        const raw = z.record(z.unknown()).parse(body.raw); const normalized = normalize(v.provider, raw);
        const evidence = await saveEvidence(uid, id, { format: "imported-response-v1", importedAt: now, declaredPrompt: base.prompt, declaredModel: base.model, response: raw });
        await insertRun({ id, uid, base, provider: v.provider, environment: "imported", search: v.search, settings: { notes: base.notes, declaredSettingsUnverified: true }, normalized, evidence, now });
        return reply({ id }, 201);
      }
      const key = body.connectionId ? await savedKey(uid,base.studyId,v.provider,idSchema.parse(body.connectionId),id) : z.string().trim().min(10).max(512).parse(body.key); const request = makeRequest(v.provider, base.model, base.prompt, v.search, v.maxTokens);
      const settings = { maxOutputTokens: v.maxTokens, searchMode: v.search, notes: base.notes, systemPrompt: null, userLocation: null, domainFilters: null, ...(v.provider === "anthropic" && v.search === "auto" ? { maxSearches: 3, toolVersion: "web_search_20260318" } : {}) };
      await db().prepare("INSERT INTO runs (id, owner_id, study_id, provider, environment, model, prompt, status, search, settings, created_at) VALUES (?, ?, ?, ?, 'api', ?, ?, 'running', ?, ?, ?)").bind(id, uid, base.studyId, v.provider, base.model, base.prompt, v.search, JSON.stringify(settings), now).run();
      let responseText: string | null = null; let httpStatus: number | null = null;
      try {
        const response = await fetch(endpoints[v.provider], { method: "POST", headers: providerHeaders(v.provider, key), body: JSON.stringify(request), redirect: "manual", signal: AbortSignal.timeout(150000) });
        httpStatus = response.status; responseText = await boundedText(response.body, 4_000_000);
        // Credentials are never stored in the request, response headers, logs, or normalized record.
        responseText = responseText.split(key).join("[credential removed]");
        let raw: any; try { raw = JSON.parse(responseText); } catch { throw new AppError(`The provider returned a non-JSON response (HTTP ${httpStatus}).`); }
        const normalized = normalize(v.provider, raw);
        const evidence = await saveEvidence(uid, id, { format: "provider-run-v1", startedAt: now, completedAt: new Date().toISOString(), endpoint: endpoints[v.provider], request, httpStatus, responseText, response: raw });
        const error = response.ok ? null : `Provider HTTP ${httpStatus}: ${String(raw.error?.message || raw.message || "Request failed").slice(0, 800)}`;
        await db().prepare("UPDATE runs SET status = ?, normalized = ?, evidence_key = ?, evidence_hash = ?, error = ?, finished_at = ? WHERE id = ? AND owner_id = ?").bind(response.ok ? normalized.completion : "failed", JSON.stringify(normalized), evidence.key, evidence.digest, error, new Date().toISOString(), id, uid).run();
      } catch (e) {
        const timeout = e instanceof Error && ["TimeoutError", "AbortError"].includes(e.name);
        const error = timeout ? "Request timed out. The provider may still have processed or billed it. No retry was made." : e instanceof AppError ? e.message : "The provider request or evidence save failed. No retry was made. Check the provider account before repeating.";
        let evidence: { key: string; digest: string } | null = null;
        try { evidence = await saveEvidence(uid, id, { format: "provider-run-v1", startedAt: now, endpoint: endpoints[v.provider], request, httpStatus, responseText, error }); } catch { /* preserve failure in D1 even if object storage is unavailable */ }
        await db().prepare("UPDATE runs SET status = 'failed', error = ?, evidence_key = ?, evidence_hash = ?, finished_at = ? WHERE id = ? AND owner_id = ?").bind(error, evidence?.key || null, evidence?.digest || null, new Date().toISOString(), id, uid).run();
      }
      return reply({ id }, 201);
    }
    throw new AppError("Unknown operation.", 404);
  } catch (e) { return failure(e); }
}
async function insertRun({ id, uid, base, provider, environment, search, settings, normalized, evidence, now }: { id: string; uid: string; base: { studyId: string; model: string; prompt: string }; provider: string; environment: string; search: string; settings: unknown; normalized: Normalized; evidence: { key: string; digest: string }; now: string }) {
  await db().prepare("INSERT INTO runs (id, owner_id, study_id, provider, environment, model, prompt, status, search, settings, normalized, evidence_key, evidence_hash, created_at, finished_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, uid, base.studyId, provider, environment, base.model, base.prompt, normalized.completion, search, JSON.stringify(settings), JSON.stringify(normalized), evidence.key, evidence.digest, now, now).run();
}
