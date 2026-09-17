import { env } from "cloudflare:workers";
import { getChatGPTUser } from "@/app/chatgpt-auth";
import { z } from "zod";
export class AppError extends Error { constructor(message: string, public status = 400) { super(message); } }
export function db() { if (!env.DB) throw new AppError("The research database is unavailable. Please try again shortly.", 503); return env.DB; }
export function bucket() { if (!env.BUCKET) throw new AppError("Evidence storage is unavailable. Please try again shortly.", 503); return env.BUCKET; }
export async function owner(req: Request, mutation = false) {
  const user = await getChatGPTUser();
  if (!user) throw new AppError("Sign in with ChatGPT to open your private research workspace.", 401);
  if (mutation) {
    const origin = req.headers.get("origin");
    if (origin && origin !== new URL(req.url).origin) throw new AppError("Request origin does not match this application.", 403);
    if (req.headers.get("sec-fetch-site") === "cross-site") throw new AppError("Cross-site requests are not allowed.", 403);
  }
  return user.userId;
}
export async function boundedBytes(body: ReadableStream<Uint8Array> | null, limit = 2_000_000) {
  if (!body) return new Uint8Array(0);
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > limit) { await reader.cancel(); throw new AppError(`Content exceeds the ${Math.floor(limit / 1_000_000)} MB limit.`, 413); } chunks.push(value); } }
  finally { reader.releaseLock(); }
  const buffer = new Uint8Array(length); let offset = 0;
  chunks.forEach(c => { buffer.set(c, offset); offset += c.length; });
  return buffer;
}
export async function boundedText(body: ReadableStream<Uint8Array> | null, limit = 2_000_000) {
  return new TextDecoder().decode(await boundedBytes(body, limit));
}
export async function jsonBody(req: Request) {
  if (!req.headers.get("content-type")?.startsWith("application/json")) throw new AppError("Expected JSON.", 415);
  try { return JSON.parse(await boundedText(req.body)); } catch (e) { if (e instanceof AppError) throw e; throw new AppError("The JSON could not be read."); }
}
export const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
export function failure(e: unknown) {
  if (e instanceof AppError) return reply({ error: e.message }, e.status);
  if (e instanceof z.ZodError) return reply({ error: e.errors.map(x => `${x.path.join(".")}: ${x.message}`).join("; ") }, 400);
  return reply({ error: "The operation could not be completed. Your saved records are still available. Please try again." }, 500);
}
export async function ownStudy(id: string, uid: string) { const result = await db().prepare("SELECT * FROM studies WHERE id = ? AND owner_id = ?").bind(id, uid).first(); if (!result) throw new AppError("Study not found.", 404); return result; }
export async function ownRun(id: string, uid: string) { const result = await db().prepare("SELECT * FROM runs WHERE id = ? AND owner_id = ?").bind(id, uid).first<Record<string, any>>(); if (!result) throw new AppError("Run not found.", 404); return result; }
export const idSchema = z.string().uuid();
export const urlSchema = z.string().max(2000).refine(v => { try { return ["http:", "https:"].includes(new URL(v).protocol); } catch { return false; } }, "Enter an http or https URL.");
export function publicRun(row: Record<string, any>) { const { owner_id, evidence_key, ...safe } = row; return { ...safe, settings: JSON.parse(row.settings), normalized: row.normalized ? JSON.parse(row.normalized) : null }; }
export function publicRecord(row: Record<string, any>) { const { owner_id, ...safe } = row; return { ...safe, payload: JSON.parse(row.payload) }; }
export async function hash(text: string | ArrayBuffer) { const b = typeof text === "string" ? new TextEncoder().encode(text) : text; return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", b))).map(x => x.toString(16).padStart(2, "0")).join(""); }
export async function saveEvidence(uid: string, id: string, evidence: unknown) {
  const text = JSON.stringify(evidence); const digest = await hash(text); const key = `${uid}/runs/${id}/original.json`;
  await bucket().put(key, text, { httpMetadata: { contentType: "application/json" } });
  return { key, digest };
}
