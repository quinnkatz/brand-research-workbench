let observation=null;
const field=id=>document.getElementById(id);
(async()=>{try{
 const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
 const [result]=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
   const selection=window.getSelection();if(!selection||selection.isCollapsed)throw new Error("Select the AI answer text in the page first.");
   const links=[];for(let i=0;i<selection.rangeCount;i++){const fragment=selection.getRangeAt(i).cloneContents();for(const a of fragment.querySelectorAll("a[href]")){try{const url=new URL(a.getAttribute("href"),location.href);if(["https:","http:"].includes(url.protocol))links.push(url.href);}catch{}}}
   return {answer:selection.toString(),sources:[...new Set(links)],pageUrl:location.href,pageTitle:document.title,capturedAt:new Date().toISOString(),locale:document.documentElement.lang||navigator.language};
 }});
 observation=result.result;if(!observation?.answer)throw new Error("Select the complete answer and reopen this panel.");
 field('answer').value=observation.answer;field('links').value=observation.sources.join('\n');
 const host=new URL(observation.pageUrl).hostname;
 field('surface').value=host==='chatgpt.com'?'chatgpt':host==='claude.ai'?'claude':host==='gemini.google.com'?'gemini':host.endsWith('perplexity.ai')?'perplexity':host==='copilot.microsoft.com'?'copilot':host==='grok.com'?'grok':/^www\.google\./.test(host)?'google_ai_overview':'other';
}catch(e){field('status').textContent=e.message||'This browser page cannot be captured. You can paste the text manually.';}})();
field('capture').addEventListener('submit',event=>{event.preventDefault();try{
 if(!observation)throw new Error('Reopen this panel after selecting an answer in a supported webpage.');
 const sources=field('links').value.split('\n').filter(v=>v.trim()).map(v=>{const u=new URL(v.trim());if(!['https:','http:'].includes(u.protocol))throw new Error('Source links must use HTTP or HTTPS.');return u.href;});
 const payload={format:'brand-research-consumer-capture',version:1,...observation,answer:field('answer').value,prompt:field('question').value,surface:field('surface').value,sources,method:'user_selected_browser_text',limitations:['Researcher-controlled selection and edits; not an authenticated platform export.','Source links have no verified sentence association.','Personalization and hidden retrieval decisions are unknown.']};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`consumer-observation-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);field('status').textContent='Downloaded. Import and review in your brand workspace.';
}catch(e){field('status').textContent=e.message;}});
