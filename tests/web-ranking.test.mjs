// Perplexity Search API: ranked web results stored as a baseline record.
// The outbound call is mocked; no paid request is made and no key is real.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
const require = createRequire(import.meta.url);
const { Miniflare } = createRequire(require.resolve('wrangler/package.json'))('miniflare');

const DEPLOYMENT_KEY = 'pplx-test-deployment-key';
const result = (url, title, snippet, extra = {}) => ({ url, title, snippet, date: null, last_updated: null, ...extra });

test('Web ranking: stores ranked results, merges multi-query by URL, and never stores the key', async () => {
  let mode = 'ok', seen = [];
  const mf = new Miniflare({
    modules: ['index.js', ...readdirSync('dist/server', { recursive: true }).filter(p => /\.m?js$/.test(p) && p !== 'index.js')].map(p => ({ type: 'ESModule', path: resolve('dist/server', p) })),
    modulesRoot: resolve('dist/server'), compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'], r2Buckets: ['BUCKET'], bindings: { AUTH_MODE: 'sites', PERPLEXITY_API_KEY: DEPLOYMENT_KEY },
    outboundService: async request => {
      const url = new URL(request.url);
      if (url.href !== 'https://api.perplexity.ai/search') return new Response('unexpected host', { status: 599 });
      seen.push({ auth: request.headers.get('authorization'), body: await request.json() });
      if (mode === 'rate_limited') return new Response(JSON.stringify({ error: { message: 'slow down' } }), { status: 429, headers: { 'retry-after': '30', 'content-type': 'application/json' } });
      if (mode === 'unauthorized') return new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401, headers: { 'content-type': 'application/json' } });
      if (mode === 'multi') return Response.json({ id: 'search-multi', results: [
        [result('https://brand.test/hearing', 'Brand page', 'Official page'), result('https://review.test/best', 'Best list', 'Roundup')],
        [result('https://review.test/best', 'Best list', 'Roundup'), result('https://forum.test/thread', 'Forum thread', 'Discussion')],
      ] });
      return Response.json({ id: 'search-single', results: [result('https://review.test/best', 'Best list', 'Roundup', { date: '2026-09-01' }), result('https://brand.test/hearing', 'Brand page', 'Official page')] });
    },
  });
  try {
    const db = await mf.getD1Database('DB');
    for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort())
      for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').filter(s => s.trim())) await db.prepare(statement).run();
    const headers = (uid = 'owner') => ({ 'oai-authenticated-user-id': uid, 'oai-authenticated-user-email': `${uid}@example.test`, origin: 'https://workbench.test', 'content-type': 'application/json' });
    const post = (path, body, uid = 'owner') => mf.dispatchFetch(`https://workbench.test/api/${path}`, { method: 'POST', headers: headers(uid), body: JSON.stringify(body) });
    const json = async (response, status) => { const copy = response.clone(); assert.equal(response.status, status, await copy.text()); return response.json(); };

    const { id: studyId } = await json(await post('workbench', { action: 'study', name: 'Ranking test', brand: 'Audien', website: '', objective: 'Baseline' }), 201);
    const { id: questionId } = await json(await post('workbench', { action: 'record', studyId, kind: 'question', payload: { prompt: 'best over-the-counter hearing aids', intent: 'discovery', origin: 'template', notes: '', tags: [] } }), 201);

    // Single query: ranked results, the original response kept, the question linked.
    const single = await json(await post('research', { action: 'web_ranking', studyId, questionId, query: 'best over-the-counter hearing aids', maxResults: 5, contextSize: 'high', country: 'us' }), 201);
    assert.deepEqual(single.results.map(r => r.url), ['https://review.test/best', 'https://brand.test/hearing']);
    assert.equal(single.results[0].rank, 1); assert.equal(single.results[0].date, '2026-09-01');
    assert.equal(seen[0].auth, `Bearer ${DEPLOYMENT_KEY}`);
    assert.deepEqual(seen[0].body, { query: 'best over-the-counter hearing aids', max_results: 5, search_context_size: 'high', country: 'US' });
    const saved = JSON.parse((await db.prepare("SELECT payload FROM records WHERE id = ? AND kind = 'web_ranking'").bind(single.id).first()).payload);
    assert.equal(saved.questionId, questionId);
    assert.equal(saved.keySource, 'deployment');
    assert.equal(saved.response.id, 'search-single', 'the original response is preserved');
    assert.ok(!JSON.stringify(saved).includes(DEPLOYMENT_KEY), 'the key never reaches a stored record');

    // Multi-query: one entry per URL, best rank kept, both queries recorded.
    mode = 'multi';
    const multi = await json(await post('research', { action: 'web_ranking', studyId, query: ['best otc hearing aids', 'cheap hearing aids reviews'] }), 201);
    assert.deepEqual(multi.results.map(r => r.url), ['https://brand.test/hearing', 'https://review.test/best', 'https://forum.test/thread']);
    const shared = multi.results.find(r => r.url === 'https://review.test/best');
    assert.deepEqual(shared.queries, ['best otc hearing aids', 'cheap hearing aids reviews']);
    assert.equal(shared.rank, 1, 'the best rank across queries is kept');
    assert.deepEqual(seen[1].body.query, ['best otc hearing aids', 'cheap hearing aids reviews']);

    // Rejected before any request: too many queries, mixed domain modes, unknown question.
    const before = seen.length;
    assert.equal((await post('research', { action: 'web_ranking', studyId, query: ['a', 'b', 'c', 'd', 'e', 'f'] })).status, 400);
    assert.equal((await post('research', { action: 'web_ranking', studyId, query: 'a', domainFilter: ['nature.com', '-reddit.com'] })).status, 400);
    assert.equal((await post('research', { action: 'web_ranking', studyId, query: 'a', questionId: crypto.randomUUID() })).status, 400);
    assert.equal(seen.length, before, 'invalid requests never reach the provider');

    // Provider failures surface honestly and save nothing.
    const records = async () => (await db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind = 'web_ranking'").first()).n;
    const count = await records();
    mode = 'rate_limited';
    const limited = await post('research', { action: 'web_ranking', studyId, query: 'a' });
    assert.equal(limited.status, 429); assert.match((await limited.json()).error, /Retry after 30 seconds/);
    mode = 'unauthorized';
    const rejected = await post('research', { action: 'web_ranking', studyId, query: 'a' });
    assert.equal(rejected.status, 400); assert.match((await rejected.json()).error, /rejected the API key/);
    assert.equal(await records(), count, 'a failed search stores no baseline record');

    // Another account cannot search inside this study.
    mode = 'ok';
    assert.equal((await post('research', { action: 'web_ranking', studyId, query: 'a' }, 'intruder')).status, 404);
  } finally { await mf.dispose(); }
});

test('Web ranking: without a connection or deployment key, the request is refused', async () => {
  const mf = new Miniflare({
    modules: ['index.js', ...readdirSync('dist/server', { recursive: true }).filter(p => /\.m?js$/.test(p) && p !== 'index.js')].map(p => ({ type: 'ESModule', path: resolve('dist/server', p) })),
    modulesRoot: resolve('dist/server'), compatibilityDate: '2026-05-15', compatibilityFlags: ['nodejs_compat'],
    d1Databases: ['DB'], r2Buckets: ['BUCKET'], bindings: { AUTH_MODE: 'sites' },
    outboundService: async () => new Response('no search should happen', { status: 599 }),
  });
  try {
    const db = await mf.getD1Database('DB');
    for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort())
      for (const statement of readFileSync(`drizzle/${file}`, 'utf8').split('--> statement-breakpoint').filter(s => s.trim())) await db.prepare(statement).run();
    const headers = { 'oai-authenticated-user-id': 'owner', 'oai-authenticated-user-email': 'owner@example.test', origin: 'https://workbench.test', 'content-type': 'application/json' };
    const study = await (await mf.dispatchFetch('https://workbench.test/api/workbench', { method: 'POST', headers, body: JSON.stringify({ action: 'study', name: 'No key', brand: 'Audien', website: '', objective: 'Baseline' }) })).json();
    const response = await mf.dispatchFetch('https://workbench.test/api/research', { method: 'POST', headers, body: JSON.stringify({ action: 'web_ranking', studyId: study.id, query: 'anything' }) });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /Connect a Perplexity account/);
  } finally { await mf.dispose(); }
});
