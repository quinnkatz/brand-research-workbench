import { AppError, boundedBytes, bucket, hash } from './server';
import { fetchPublicPage, inspectHtml, publicAuditUrl, robotsAllowed, validateDns } from './readiness';
import { putRecord } from './investigation-server';
export type CaptureText = {text:string;title:string;requestedUrl:string;finalUrl:string;capturedAt:string;contentHash:string;httpStatus:number;contentType:string;redirects:string[];limitation:string};
// Deliberately same-host redirects. Capturing a cited third-party domain does not
// relax the separate brand-audit host restriction, nor forward application auth.
export async function retrieveSource(value:string):Promise<{metadata:CaptureText;bytes:Uint8Array}>{
  const root=publicAuditUrl(value),requestedUrl=root.href,capturedAt=new Date().toISOString();
  const policy=await fetchPublicPage(`${root.origin}/robots.txt`,root.hostname);
  if(policy.status!==404&&policy.status!==410&&(policy.status<200||policy.status>=300))throw new AppError('The source did not allow its crawl policy to be checked. Use a manual excerpt.');
  let url=root;const redirects:string[]=[];
  for(let i=0;i<4;i++){
    if(policy.status<300&&!robotsAllowed(policy.text,url.pathname+url.search))throw new AppError('This page disallows automated capture. Use an authorized manual excerpt.');
    await validateDns(url.hostname);
    const response=await fetch(url.href,{redirect:'manual',headers:{'User-Agent':'BrandResearchAudit/1.0',Accept:'text/html,text/plain,application/xhtml+xml'},signal:AbortSignal.timeout(12000)});
    if([301,302,303,307,308].includes(response.status)){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new AppError('The source returned an incomplete redirect.');redirects.push(url.href);url=publicAuditUrl(new URL(location,url).href,root.hostname);continue;}
    if(response.status<200||response.status>=300){await response.body?.cancel();throw new AppError(`Source returned HTTP ${response.status}. Use a manual excerpt if you can inspect it.`);}
    const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();if(!['text/html','text/plain','application/xhtml+xml'].includes(contentType)){await response.body?.cancel();throw new AppError('Only public HTML and plain text can be captured here. Preserve a manual excerpt for this source.');}
    const bytes=await boundedBytes(response.body,1_500_000),raw=new TextDecoder().decode(bytes),parsed=contentType==='text/plain'?{body:raw.slice(0,150000),title:url.hostname}:await inspectHtml(raw,url.href);
    return {bytes,metadata:{text:parsed.body,title:parsed.title,requestedUrl,finalUrl:url.href,capturedAt,contentHash:await hash(bytes.buffer as ArrayBuffer),httpStatus:response.status,contentType,redirects,limitation:parsed.body.trim().length<80?'Little readable text was returned. The page may require JavaScript or authentication; inspect it manually.':raw.length>150000?'Extracted text is bounded to 150,000 characters; original bytes are retained.':'Server-returned text only; JavaScript was not executed.'}};
  }throw new AppError('Too many source redirects. Use a manual excerpt.');
}
export async function captureSource(uid:string,studyId:string,runId:string,url:string,actor:string){
  const captureId=crypto.randomUUID();let rawSaved=false,parsedSaved=false;
  try{const {bytes,metadata}=await retrieveSource(url);await bucket().put(`${uid}/captures/${captureId}/original`,bytes,{httpMetadata:{contentType:'application/octet-stream'}});rawSaved=true;await bucket().put(`${uid}/captures/${captureId}/text.json`,JSON.stringify(metadata),{httpMetadata:{contentType:'application/json'}});parsedSaved=true;
    return await putRecord(uid,studyId,'source',{url,runId,captureId,title:metadata.title,capturedAt:metadata.capturedAt,contentHash:metadata.contentHash,finalUrl:metadata.finalUrl,httpStatus:metadata.httpStatus,contentType:metadata.contentType,provenance:'application_retrieved_later',status:'captured',limitation:metadata.limitation,actorId:actor,excerpt:''});
  }catch(error){if(rawSaved)await bucket().delete(`${uid}/captures/${captureId}/original`);if(parsedSaved)await bucket().delete(`${uid}/captures/${captureId}/text.json`);return await putRecord(uid,studyId,'source',{url,runId,provenance:'application_capture_attempt',status:'unavailable',capturedAt:new Date().toISOString(),error:error instanceof AppError?error.message:'The source could not be captured. Your existing evidence is unchanged. Try a manual excerpt.',actorId:actor,excerpt:''});}
}
export async function captureText(uid:string,record:{payload:Record<string,unknown>}):Promise<CaptureText>{const p=record.payload;if(p.provenance!=='application_retrieved_later'||p.status!=='captured'||typeof p.captureId!=='string')throw new AppError('This source has no retrieved text.',404);const file=await bucket().get(`${uid}/captures/${p.captureId}/text.json`);if(!file)throw new AppError('Source text is temporarily unavailable.',503);return file.json<CaptureText>();}
