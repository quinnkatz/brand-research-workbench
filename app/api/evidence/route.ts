import { AppError, boundedBytes, bucket, db, failure, hash, idSchema, ownRun, owner, reply } from "@/lib/server";
export const dynamic = "force-dynamic";
const allowed = new Set(["image/png", "image/jpeg", "application/pdf", "text/plain", "application/json"]);
export async function POST(req: Request) {
  try {
    const actor = await owner(req, true);
    const length = Number(req.headers.get("content-length"));
    if (length > 5_500_000) throw new AppError("Choose a file smaller than 5 MB.", 413);
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.startsWith("multipart/form-data")) throw new AppError("Expected a file upload.", 415);
    const bytesReceived = await boundedBytes(req.body, 5_500_000);
    const data = await new Response(bytesReceived, { headers: { "Content-Type": contentType } }).formData(); const runId = idSchema.parse(data.get("runId"));
    const uid = (await ownRun(runId, actor, "write")).owner_id;
    const file = data.get("file");
    if (!file || typeof file === "string" || file.size > 5_000_000 || !file.size) throw new AppError("Choose a non-empty file smaller than 5 MB.");
    if (!allowed.has(file.type)) throw new AppError("Use a PNG, JPEG, PDF, text, or JSON file.");
    const id = crypto.randomUUID(); const key = `${uid}/runs/${runId}/attachments/${id}`;
    const bytes = await file.arrayBuffer(); const digest = await hash(bytes);
    await bucket().put(key, bytes, { httpMetadata: { contentType: file.type } });
    const name = file.name.replace(/[\r\n\x00-\x1f]/g, "").slice(0, 180) || "evidence";
    await db().prepare("INSERT INTO attachments (id, owner_id, run_id, name, mime, object_key, sha256, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(id, uid, runId, name, file.type, key, digest, new Date().toISOString()).run();
    return reply({ id }, 201);
  } catch (e) { return failure(e); }
}
export async function GET(req: Request) {
  try {
    const uid = await owner(req); const id = idSchema.parse(new URL(req.url).searchParams.get("id"));
    const row = await db().prepare("SELECT * FROM attachments WHERE id = ?").bind(id).first<Record<string, string>>();
    if (!row) throw new AppError("Attachment not found.", 404);
    await ownRun(row.run_id, uid);
    const file = await bucket().get(row.object_key); if (!file) throw new AppError("File not found.", 404);
    return new Response(file.body, { headers: { "Content-Type": row.mime, "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(row.name)}`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (e) { return failure(e); }
}
