import { env } from "cloudflare:workers";
import { AppError, db } from "./server";

const encoder = new TextEncoder();
const encode = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const decode = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export function vaultReady() { return !!(env as any).VAULT_MASTER_KEY; }
async function master() {
  const value = (env as any).VAULT_MASTER_KEY;
  if (!value) throw new AppError("Secure connection storage is not configured by the workspace operator.", 503);
  let bytes; try { bytes = decode(value); } catch { throw new AppError("Secure connection storage needs attention.", 503); }
  if (bytes.length !== 32) throw new AppError("Secure connection storage needs attention.", 503);
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}
export async function seal(secret: string, context: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(context) }, await master(), encoder.encode(secret));
  return { ciphertext: encode(new Uint8Array(ciphertext)), iv: encode(iv) };
}
export async function openSecret(row: any): Promise<string> {
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(row.iv), additionalData: encoder.encode(`${row.owner_id}:${row.id}:${row.provider}`) }, await master(), decode(row.ciphertext));
    return new TextDecoder().decode(plain);
  } catch { throw new AppError("The saved connection could not be opened. Ask its owner to reconnect it.", 503); }
}
export async function connectionFor(ownerId: string, id: string, provider?: string) {
  const row = await db().prepare("SELECT * FROM connections WHERE id = ? AND owner_id = ?").bind(id, ownerId).first<any>();
  if (!row || provider && row.provider !== provider) throw new AppError("Connection unavailable for this provider.", 404);
  return row;
}
// One reservation per logical request; never refund an uncertain provider call.
export async function reserveRequest(studyId: string, connectionId: string, requestId: string) {
  const grant = await db().prepare("SELECT * FROM study_connections WHERE study_id = ? AND connection_id = ?").bind(studyId, connectionId).first<any>();
  if (!grant) throw new AppError("The connection owner must authorize a request allowance for this brand.", 403);
  const existing = await db().prepare("SELECT grant_id FROM request_reservations WHERE id = ?").bind(requestId).first<any>();
  if (existing) { if (existing.grant_id !== grant.id) throw new AppError("This request already uses a different connection.", 409); return; }
  // D1 batches are transactional. The insert condition enforces the lifetime cap under concurrency.
  const result = await db().batch([
    db().prepare("INSERT OR IGNORE INTO request_reservations (id,grant_id,created_at) SELECT ?, id, ? FROM study_connections WHERE id = ? AND (SELECT count(*) FROM request_reservations WHERE grant_id = ?) < request_limit").bind(requestId, new Date().toISOString(), grant.id, grant.id),
    db().prepare("UPDATE study_connections SET used_requests = (SELECT count(*) FROM request_reservations WHERE grant_id = ?) WHERE id = ?").bind(grant.id, grant.id),
  ]);
  if (result[0].meta.changes !== 1) {
    const found = await db().prepare("SELECT grant_id FROM request_reservations WHERE id = ?").bind(requestId).first<any>();
    if (!found || found.grant_id !== grant.id) throw new AppError("This brand’s authorized request allowance is exhausted. Its owner can increase it.", 402);
  }
}
export async function savedKey(ownerId: string, studyId: string, provider: string, connectionId: string, requestId: string) {
  const row = await connectionFor(ownerId, connectionId, provider);
  const key = await openSecret(row);
  await reserveRequest(studyId, connectionId, requestId);
  return key;
}
