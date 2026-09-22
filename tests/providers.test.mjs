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

test('Perplexity keeps citations at block scope and distinguishes search results',()=>{
 const raw={id:'synthetic',model:'sonar-pro',choices:[{finish_reason:'stop',message:{content:'Aster has a removable filter [1].'}}],citations:['https://brand.test/care'],search_results:[{url:'https://editor.test/review',title:'Review'}],usage:{num_search_queries:2}};const before=JSON.stringify(raw),r=normalize('perplexity_api',raw);
 assert.equal(r.completion,'complete');assert.equal(r.citations[0].native.scope,'answer_block');assert.ok(r.sources.some(s=>s.role==='provider_disclosed_search_result'));assert.equal(r.rejected_sources,null);assert.equal(JSON.stringify(raw),before);
 assert.equal(endpoints.perplexity_api,'https://api.perplexity.ai/v1/agent');
 const off=makeRequest('perplexity_api','sonar-pro','Exact?','off',1000);assert.equal(off.model,'perplexity/sonar-pro');assert.equal(off.input,'Exact?');assert.equal(off.max_output_tokens,1000);assert.equal(off.tools,undefined);
 const on=makeRequest('perplexity_api','perplexity/sonar','Exact?','auto',1000);assert.equal(on.model,'perplexity/sonar');assert.deepEqual(on.tools,[{type:'web_search'}]);
 assert.throws(()=>makeRequest('perplexity_api','openai/gpt-5','Exact?','auto',1000),/Perplexity model/);
 assert.equal(normalize('perplexity_api',{choices:[{finish_reason:'length',message:{content:'Partial'}}]}).completion,'partial');
});
test('Perplexity Agent API: cited passages, disclosed search results and unknown items preserved',()=>{
 const raw={id:'synthetic',object:'response',status:'completed',model:'perplexity/sonar-pro',output:[{type:'search_results',results:[{id:1,url:'https://editor.test/review',title:'Review',snippet:'…',source:'web'}]},{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:'Aster has a removable filter.',annotations:[{type:'url_citation',start_index:0,end_index:28,url:'https://brand.test/care',title:'Care'}]}]},{type:'new_future_item',x:1}],usage:{input_tokens:10,output_tokens:5,cost:{currency:'USD',total_cost:0.001}}};
 const before=JSON.stringify(raw),r=normalize('perplexity_api',raw);
 assert.equal(r.completion,'complete');assert.equal(r.native_status,'completed');assert.equal(r.segments[0].text,'Aster has a removable filter.');
 assert.equal(r.citations[0].native.url,'https://brand.test/care');assert.equal(r.citations[0].segment_index,0);
 assert.ok(r.sources.some(s=>s.role==='provider_disclosed_search_result'&&s.url==='https://editor.test/review'));assert.equal(r.search_observation,'search_results_disclosed');
 assert.deepEqual(r.unparsed_top_level_events.map(e=>e.type),['new_future_item']);assert.equal(r.rejected_sources,null);assert.equal(JSON.stringify(raw),before);
 assert.equal(normalize('perplexity_api',{status:'in_progress',output:[]}).completion,'partial');
});
test('Anthropic web search uses direct calls so every Claude model accepts it',()=>{const t=makeRequest('anthropic','claude-haiku-4-5','q','auto',1000).tools[0];assert.equal(t.type,'web_search_20260318');assert.deepEqual(t.allowed_callers,['direct']);assert.equal(makeRequest('anthropic','m','q','off',1000).tools,undefined);});
test('xAI preserves its own provider identity and full native response paths',()=>{
 const r=normalize('xai',{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'Aster',annotations:[{type:'url_citation',url:'https://brand.test',start_index:0,end_index:5}]}]}]});assert.equal(r.provider,'xai');assert.equal(r.completion,'complete');assert.equal(r.sources[0].url,'https://brand.test');assert.equal(r.private_ranking_reasons,null);assert.equal(makeRequest('xai','account-model','Exact?','off',1000).tools,undefined);assert.equal(makeRequest('xai','account-model','Exact?','auto',1000).tools[0].type,'web_search');
});
