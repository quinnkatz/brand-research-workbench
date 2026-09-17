import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { makeRequest, normalize, endpoints } from '../lib/providers.ts';
const fixture = p => JSON.parse(readFileSync(new URL(`./fixtures/${p}-synthetic.json`, import.meta.url)));
for (const p of ['openai', 'anthropic', 'gemini']) {
  test(`${p}: extracts answer, citations, disclosed events; never invents rejected sources`, () => {
    const raw = fixture(p); const before = JSON.stringify(raw); const result = normalize(p, raw);
    assert.equal(result.completion, 'complete'); assert.ok(result.segments.length);
    assert.ok(result.citations.length); assert.ok(result.tool_events.length);
    assert.equal(result.rejected_sources, null); assert.equal(result.private_ranking_reasons, null);
    assert.equal(JSON.stringify(raw), before, 'Original must not be mutated');
  });
  test(`${p}: search off has no search tool or hidden prompt`, () => {
    const request = makeRequest(p, 'account-model', 'Exact customer question?', 'off', 1024);
    assert.equal(request.tools, undefined); assert.equal(request.system, undefined); assert.equal(request.system_instruction, undefined);
    assert.equal(p === 'anthropic' ? request.messages[0].content : request.input, 'Exact customer question?');
  });
}
test('Anthropic nested search errors remain visible even on completed HTTP success', () => {
  const result = normalize('anthropic', { stop_reason: 'end_turn', content: [{ type: 'server_tool_use', name: 'web_search', input: { query: 'question' } }, { type: 'web_search_tool_result', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } }, { type: 'text', text: 'I could not search.' }] });
  assert.ok(result.warnings.some(x => x.includes('unavailable'))); assert.equal(result.completion, 'complete');
});
test('Anthropic pause is partial, never silently complete', () => { assert.equal(normalize('anthropic', { stop_reason: 'pause_turn', content: [] }).completion, 'partial'); });
test('OpenAI refusal overrides completed envelope', () => { assert.equal(normalize('openai', { status: 'completed', output: [{ type: 'message', content: [{ type: 'refusal', refusal: 'No' }] }] }).completion, 'refused'); });
test('Gemini legacy schema warns instead of presenting empty answer as omission', () => { const r = normalize('gemini', { candidates: [] }); assert.equal(r.completion, 'unknown'); assert.ok(r.warnings.some(x => x.includes('generateContent'))); });
test('Distinct consulted and cited roles remain traceable', () => { const r = normalize('openai', fixture('openai')); assert.ok(r.sources.some(x => x.role === 'cited')); assert.ok(r.sources.some(x => x.role === 'provider_disclosed_consulted')); assert.ok(r.sources.every(x => x.raw_path.startsWith('$.'))); });
test('Large native events are preserved in original and bounded in index', () => { const raw = { status: 'completed', output: [{ type: 'web_search_call', detail: 'a'.repeat(700000) }] }; const r = normalize('openai', raw); assert.ok(JSON.stringify(r).length < 10000); assert.equal(raw.output[0].detail.length, 700000); assert.ok(r.warnings.some(x => x.includes('Large tool events'))); });
