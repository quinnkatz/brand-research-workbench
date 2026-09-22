// Sign-in boundary: identity must come from a verified Cloudflare Access token in
// production, and forged ChatGPT-style headers must never be trusted there.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { verifyAccessJwt, resetAccessCertCache } from '../lib/access-jwt.ts';
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve('wrangler/package.json'))('miniflare');

const TEAM = 'quinn-test.cloudflareaccess.com', AUD = 'aud-tag-123';
const b64url = bytes => Buffer.from(bytes).toString('base64url');
const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const other = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', pair.publicKey)), kid: 'k1', alg: 'RS256' };
const certs = JSON.stringify({ keys: [jwk] });
const now = Date.now(), seconds = Math.floor(now / 1000);

async function sign(claims = {}, { key = pair.privateKey, header = {} } = {}) {
  const h = b64url(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT', ...header }));
  const p = b64url(JSON.stringify({ sub: 'user-1', email: 'Client@Brand.com', aud: [AUD], iss: `https://${TEAM}`, iat: seconds, exp: seconds + 600, ...claims }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${h}.${p}`));
  return `${h}.${p}.${b64url(new Uint8Array(sig))}`;
}
const fetchCerts = async url => { assert.equal(String(url), `https://${TEAM}/cdn-cgi/access/certs`); return new Response(certs); };
const verify = (token, extra = {}) => { resetAccessCertCache(); return verifyAccessJwt(token, { teamDomain: TEAM, audience: AUD, now, fetchImpl: fetchCerts, ...extra }); };

test('Access token: valid token yields a lower-cased email identity', async () => {
  assert.deepEqual(await verify(await sign()), { sub: 'user-1', email: 'client@brand.com' });
  assert.deepEqual(await verify(await sign(), { teamDomain: `https://${TEAM}/` }), { sub: 'user-1', email: 'client@brand.com' });
});

test('Access token: rejects forged, foreign, expired and malformed tokens', async () => {
  assert.equal(await verify(await sign({}, { key: other.privateKey })), null, 'wrong signing key');
  assert.equal(await verify(await sign({ aud: ['someone-else'] })), null, 'wrong audience');
  assert.equal(await verify(await sign({ iss: 'https://evil.cloudflareaccess.com' })), null, 'wrong issuer');
  assert.equal(await verify(await sign({ exp: seconds - 3600 })), null, 'expired');
  assert.equal(await verify(await sign({ nbf: seconds + 3600 })), null, 'not yet valid');
  assert.equal(await verify(await sign({ email: undefined })), null, 'service token without email');
  assert.equal(await verify(await sign({}, { header: { alg: 'none' } })), null, 'alg none');
  assert.equal(await verify(await sign({}, { header: { kid: 'unknown' } })), null, 'unknown key id');
  const [h, , s] = (await sign()).split('.');
  assert.equal(await verify(`${h}.${b64url(JSON.stringify({ sub: 'admin', email: 'admin@x.com', aud: [AUD], iss: `https://${TEAM}`, exp: seconds + 600 }))}.${s}`), null, 'tampered payload');
  for (const junk of [null, '', 'a.b', 'not.a.jwt', '...']) assert.equal(await verify(junk), null);
  assert.equal(await verify(await sign(), { audience: '' }), null, 'missing configured audience');
  assert.equal(await verify(await sign(), { teamDomain: 'example.com' }), null, 'non-Access team domain');
});

function worker(bindings) {
  return new Miniflare({ modules: ['index.js', ...readdirSync('dist/server', { recursive: true }).filter(p => /\.m?js$/.test(p) && p !== 'index.js')].map(p => ({ type: 'ESModule', path: resolve('dist/server', p) })), modulesRoot: resolve('dist/server'), compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'], d1Databases: ['DB'], r2Buckets: ['BUCKET'], bindings,
    outboundService: async request => new URL(request.url).href === `https://${TEAM}/cdn-cgi/access/certs` ? new Response(certs) : new Response('blocked in test', { status: 599 }) });
}
async function migrate(mf) {
  const db = await mf.getD1Database('DB');
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort())
    for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').filter(s => s.trim())) await db.prepare(statement).run();
}
const forged = { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.test' };
const state = (mf, headers = {}) => mf.dispatchFetch('https://workbench.test/api/workbench?action=state', { headers });

test('Worker: fails closed when AUTH_MODE is missing, even with forged headers', async () => {
  const mf = worker({});
  try { await migrate(mf); assert.equal((await state(mf, forged)).status, 401); } finally { await mf.dispose(); }
});

test('Worker: Cloudflare Access mode ignores forged headers and accepts only a verified token', async () => {
  const mf = worker({ AUTH_MODE: 'cloudflare-access', ACCESS_TEAM_DOMAIN: TEAM, ACCESS_AUD: AUD });
  try {
    await migrate(mf);
    assert.equal((await state(mf, forged)).status, 401, 'forged ChatGPT headers must not sign anyone in');
    assert.equal((await state(mf, { 'cf-access-jwt-assertion': await sign({}, { key: other.privateKey }) })).status, 401, 'forged token');
    const ok = await state(mf, { 'cf-access-jwt-assertion': await sign() });
    assert.equal(ok.status, 200, await ok.clone().text());
    const home = await (await mf.dispatchFetch('https://workbench.test/', { headers: { 'cf-access-jwt-assertion': await sign() } })).text();
    assert.ok(home.includes('/cdn-cgi/access/logout'), 'sign-out goes through Cloudflare Access');
    assert.ok(!home.includes('signin-with-chatgpt'), 'no ChatGPT sign-in link in production');
  } finally { await mf.dispose(); }
});
