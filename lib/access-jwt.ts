// Verifies the Cloudflare Access identity token (Cf-Access-Jwt-Assertion).
// Access signs it with RS256; public keys are served by the team domain.
// https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/

export type AccessIdentity = { sub: string; email: string };
type Jwk = JsonWebKey & { kid?: string };
type Options = { teamDomain: string; audience: string; now?: number; fetchImpl?: typeof fetch };

const CERT_TTL_MS = 60 * 60 * 1000;
let certCache: { domain: string; keys: Jwk[]; fetchedAt: number } | null = null;

const base64url = (value: string) => Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=")), c => c.charCodeAt(0));
const json = (value: string) => JSON.parse(new TextDecoder().decode(base64url(value)));

export function normalizeTeamDomain(value: string) {
  const host = value.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  if (!/^[a-z0-9-]+\.cloudflareaccess\.com$/i.test(host)) throw new Error("ACCESS_TEAM_DOMAIN must look like <team>.cloudflareaccess.com");
  return host.toLowerCase();
}

async function keys(domain: string, fetchImpl: typeof fetch, now: number, refresh = false) {
  if (!refresh && certCache?.domain === domain && now - certCache.fetchedAt < CERT_TTL_MS) return certCache.keys;
  const response = await fetchImpl(`https://${domain}/cdn-cgi/access/certs`);
  if (!response.ok) throw new Error(`Access certificates unavailable (${response.status})`);
  const body = await response.json() as { keys?: Jwk[] };
  certCache = { domain, keys: body.keys ?? [], fetchedAt: now };
  return certCache.keys;
}

/** Returns the verified identity, or null for any missing, malformed, expired or foreign token. */
export async function verifyAccessJwt(token: string | null | undefined, options: Options): Promise<AccessIdentity | null> {
  if (!token || !options.audience) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const now = options.now ?? Date.now(), fetchImpl = options.fetchImpl ?? fetch;
  let header: any, payload: any, domain: string;
  try { header = json(parts[0]); payload = json(parts[1]); domain = normalizeTeamDomain(options.teamDomain); } catch { return null; }
  if (header.alg !== "RS256" || typeof header.kid !== "string") return null;

  let jwk = (await keys(domain, fetchImpl, now)).find(k => k.kid === header.kid);
  if (!jwk) jwk = (await keys(domain, fetchImpl, now, true)).find(k => k.kid === header.kid); // key rotation
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64url(parts[2]), new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  if (!valid) return null;

  const seconds = Math.floor(now / 1000), audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!audiences.includes(options.audience)) return null;
  if (payload.iss !== `https://${domain}`) return null;
  if (typeof payload.exp !== "number" || payload.exp < seconds - 60) return null;
  if (typeof payload.nbf === "number" && payload.nbf > seconds + 60) return null;
  if (typeof payload.sub !== "string" || !payload.sub || typeof payload.email !== "string" || !payload.email.includes("@")) return null;
  return { sub: payload.sub, email: payload.email.toLowerCase() };
}

export function resetAccessCertCache() { certCache = null; }
