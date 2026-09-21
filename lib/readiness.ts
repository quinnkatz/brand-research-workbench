import { AppError, boundedText, hash } from "./server";
export function publicAuditUrl(value:string,host?:string){
  let url:URL;try{url=new URL(value);}catch{throw new AppError("Enter a valid public HTTPS page.");}
  const name=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||url.username||url.password||url.port&&url.port!=="443"||!name.includes(".")||name.length>253||!/^[a-z0-9.-]+$/.test(name)||/(^|\.)(localhost|local|internal|test|invalid|example|onion)$/.test(name)||/^\d+(\.\d+)*$/.test(name))throw new AppError("Audits accept public HTTPS domains only.");
  if(host&&name!==host)throw new AppError("Choose a page on the brand website’s exact hostname.");url.hash="";return url;
}
function publicIp(value:string){
  if(value.includes(":"))return /^2[0-9a-f]{3}:/i.test(value)&&!/^2001:(db8|0|10|20)(:|$)/i.test(value)&&!/^2002:/i.test(value);
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(value))return false;
  const [a,b,c,d]=value.split(".").map(Number);if([a,b,c,d].some(n=>n>255))return false;
  return !(a===0||a===10||a===127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===2)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113||a===100&&b>=64&&b<=127||a>=224);
}
async function validateDns(host:string){
  let addresses=0;
  for(const type of ["A","AAAA"]){
    const r=await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`,{headers:{accept:"application/dns-json"},redirect:"manual",signal:AbortSignal.timeout(5000)});
    if(!r.ok){await r.body?.cancel();throw new AppError("Could not verify public DNS for this page.");}
    const data=JSON.parse(await boundedText(r.body,40000));
    for(const answer of data.Answer||[])if(answer.type===1||answer.type===28){addresses++;if(!publicIp(answer.data))throw new AppError("This domain resolves to an address that cannot be audited.");}
  }
  if(!addresses)throw new AppError("This domain has no verifiable public address.");
}
export async function fetchPublicPage(value:string,host:string){
  let url=publicAuditUrl(value,host);const visited:string[]=[];
  for(let i=0;i<4;i++){
    await validateDns(url.hostname);visited.push(url.href);
    const response=await fetch(url.href,{headers:{"User-Agent":"BrandResearchAudit/1.0","Accept":"text/html,text/plain,application/xhtml+xml"},redirect:"manual",signal:AbortSignal.timeout(12000)});
    if([301,302,303,307,308].includes(response.status)){
      const target=response.headers.get("location");await response.body?.cancel();if(!target)throw new AppError("A redirect has no destination.");url=publicAuditUrl(new URL(target,url).href,host);continue;
    }
    const contentType=response.headers.get("content-type")||"";
    if(!/text\/|application\/xhtml\+xml/.test(contentType)){await response.body?.cancel();throw new AppError("This page does not return readable HTML or text.");}
    const text=await boundedText(response.body,1_500_000);
    return {url:url.href,status:response.status,contentType,text,headers:{robots:response.headers.get("x-robots-tag"),modified:response.headers.get("last-modified")},redirects:visited.slice(0,-1)};
  }
  throw new AppError("The page has too many redirects.");
}
export function robotsAllowed(text:string,path:string,agent="brandresearchaudit"){
  const groups:{agents:string[];rules:{path:string;allow:boolean}[]}[]=[];let group={agents:[] as string[],rules:[] as {path:string;allow:boolean}[]},seenRules=false;
  for(const line of text.split(/\r?\n/)){const clean=line.split("#")[0].trim(),i=clean.indexOf(":");if(i<0)continue;const name=clean.slice(0,i).trim().toLowerCase(),value=clean.slice(i+1).trim();
    if(name==="user-agent"){if(seenRules){groups.push(group);group={agents:[],rules:[]};seenRules=false;}group.agents.push(value.toLowerCase());}
    if(["allow","disallow"].includes(name)&&group.agents.length){seenRules=true;if(value)group.rules.push({path:value,allow:name==="allow"});}
  }groups.push(group);
  const exact=groups.filter(g=>g.agents.some(a=>a!=="*"&&agent.includes(a)));const matched=exact.length?exact:groups.filter(g=>g.agents.includes("*"));
  let best=-1,allow=true;for(const rule of matched.flatMap(g=>g.rules)){const escaped=rule.path.replace(/[.+?^{}()|[\]\\]/g,"\\$&").replaceAll("*",".*");if(new RegExp(`^${escaped}`).test(path)){const length=rule.path.replaceAll("*","").length;if(length>best||length===best&&rule.allow){best=length;allow=rule.allow;}}}return allow;
}
export async function inspectHtml(html:string,url:string){
  const result={title:"",description:"",canonical:"",robots:"",headings:[] as {level:string;text:string}[],body:"",schemas:[] as string[],links:[] as string[],lang:""};
  // Extract structured data before removing scripts; removed descendants still receive
  // HTMLRewriter text callbacks, so visible text needs a separate clean pass.
  await new HTMLRewriter().on('script[type="application/ld+json"]',{element(){result.schemas.push("");},text(t){const i=result.schemas.length-1;if(i>=0&&result.schemas[i].length<100000)result.schemas[i]+=t.text;}}).transform(new Response(html)).text();
  const clean=await new HTMLRewriter().on("script,style,noscript",{element(e){e.remove();}}).transform(new Response(html)).text();
  const rewriter=new HTMLRewriter()
    .on("html",{element(e){result.lang=e.getAttribute("lang")||"";}})
    .on("title",{text(t){result.title+=t.text;}})
    .on('meta[name="description"]',{element(e){result.description=e.getAttribute("content")||"";}})
    .on('meta[name="robots"]',{element(e){result.robots=e.getAttribute("content")||"";}})
    .on('link[rel="canonical"]',{element(e){result.canonical=e.getAttribute("href")||"";}})
    .on("h1,h2,h3",{element(e){const item={level:e.tagName,text:""};result.headings.push(item);},text(t){const last=result.headings.at(-1);if(last)last.text+=t.text;}})
    .on("body",{text(t){if(result.body.length<150000)result.body+=t.text;}})
    .on("a[href]",{element(e){try{const u=new URL(e.getAttribute("href")||"",url);if(u.protocol==="https:"&&result.links.length<300)result.links.push(u.href);}catch{}}});
  await rewriter.transform(new Response(clean)).text();
  return {...result,title:result.title.trim(),body:result.body.replace(/\s+/g," ").trim(),headings:result.headings.map(h=>({...h,text:h.text.trim()})),schemas:result.schemas.map(raw=>{try{return {valid:true,value:JSON.parse(raw),raw};}catch{return {valid:false,value:null,raw};}})};
}
export async function auditPage(value:string,brandWebsite:string){
  const root=publicAuditUrl(brandWebsite),url=publicAuditUrl(value,root.hostname),capturedAt=new Date().toISOString();
  const robots=await fetchPublicPage(`${root.origin}/robots.txt`,root.hostname);
  if(robots.status>=500||robots.status===401||robots.status===403)throw new AppError("The website did not permit a robots-policy check. The audit stopped before fetching the page.");
  if(robots.status>=200&&robots.status<300&&!robotsAllowed(robots.text,url.pathname+url.search))throw new AppError("The website’s robots policy disallows this audit. Choose a permitted page.");
  const page=await fetchPublicPage(url.href,root.hostname),parsed=await inspectHtml(page.text,page.url);
  const checks=[
    {id:"http",title:"Page access",status:page.status===200?"pass":"attention",evidence:`HTTP ${page.status}`,explanation:"The status observed by this audit client."},
    {id:"title",title:"Page title",status:parsed.title?"pass":"attention",evidence:parsed.title||"No title in returned HTML",explanation:"A descriptive title helps identify the page. It does not guarantee AI selection."},
    {id:"description",title:"Description",status:parsed.description?"pass":"attention",evidence:parsed.description||"No meta description in returned HTML",explanation:"Inspect whether the summary describes this specific product or offer."},
    {id:"headings",title:"Heading structure",status:parsed.headings.some(h=>h.level==="h1")?"pass":"attention",evidence:parsed.headings.slice(0,20).map(h=>`${h.level}: ${h.text}`).join("\n")||"No h1–h3 headings",explanation:"The actual heading text returned by the server."},
    {id:"text",title:"Extractable text",status:parsed.body.length>=200?"pass":"attention",evidence:`${parsed.body.length} captured text characters. ${parsed.body.slice(0,900)}`,explanation:"Server-returned HTML only; JavaScript is not executed. More text is not inherently better."},
    {id:"schema",title:"Structured data",status:parsed.schemas.length&&parsed.schemas.every(s=>s.valid)?"pass":"attention",evidence:parsed.schemas.length?`${parsed.schemas.length} JSON-LD blocks; ${parsed.schemas.filter(s=>!s.valid).length} invalid JSON blocks.`:"No JSON-LD blocks found",explanation:"Checks JSON syntax and preserves its content; this is not a schema.org or rich-result eligibility validator."},
    {id:"robots",title:"Index directives",status:/noindex|nosnippet|none/i.test(`${parsed.robots} ${page.headers.robots}`)?"attention":"pass",evidence:`Meta: ${parsed.robots||"not present"}; HTTP: ${page.headers.robots||"not present"}`,explanation:"Different crawlers interpret directives differently. Absence of a block is not evidence that a crawler visited."},
    {id:"canonical",title:"Canonical URL",status:parsed.canonical?"pass":"attention",evidence:parsed.canonical||"No canonical link found",explanation:"Review the target for a conflicting or outdated product identity."},
  ];
  return {capturedAt,url:page.url,status:page.status,contentHash:await hash(page.text),checks,parsed,original:page,robots:{url:robots.url,status:robots.status,content:robots.text},crawlerPolicy:["GPTBot","OAI-SearchBot","ChatGPT-User","ClaudeBot","Claude-SearchBot","Googlebot","PerplexityBot"].map(agent=>({agent,allowed:robots.status>=200&&robots.status<300?robotsAllowed(robots.text,url.pathname+url.search,agent.toLowerCase()):null})),methodVersion:"public-html-audit-v1.1"};
}
