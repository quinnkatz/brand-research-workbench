import type { Normalized, ResearchRecord, Run } from "./research";

export type ClaimAnchor = { segmentIndex: number; start: number; end: number };
export type SelectedClaim = ClaimAnchor & { text: string };
export type NativeCitation = Normalized["citations"][number];

// Passage boundaries are navigation aids, not a model's assessment of atomic claims.
// Offsets always refer to the unchanged answer segment, in JavaScript UTF-16 units.
export function passages(text: string, segmentIndex: number): SelectedClaim[] {
  const parts = new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text);
  return Array.from(parts, part => ({ segmentIndex, start: part.index, end: part.index + part.segment.length, text: part.segment }));
}
export function validAnchor(run: Run, anchor: ClaimAnchor, quote: string) {
  const text = run.normalized?.segments[anchor.segmentIndex]?.text;
  return typeof text === "string" && Number.isInteger(anchor.start) && Number.isInteger(anchor.end) && anchor.start >= 0 && anchor.end > anchor.start && anchor.end <= text.length && text.slice(anchor.start, anchor.end) === quote;
}
export function citationSpan(run: Run, citation: NativeCitation): { start: number; end: number } | null {
  const text = run.normalized?.segments[citation.segment_index]?.text;
  const n = citation.native;
  // Only map the supported Responses API contract. Do not reinterpret another
  // provider's source-document offsets as answer offsets. Non-ASCII offsets stay
  // at block scope until their encoding contract has been independently checked.
  if (run.provider !== "openai" || typeof text !== "string" || /[^\x00-\x7F]/.test(text) || n?.type !== "url_citation") return null;
  if (!Number.isInteger(n.start_index) || !Number.isInteger(n.end_index) || n.start_index < 0 || n.end_index <= n.start_index || n.end_index > text.length) return null;
  return { start: n.start_index, end: n.end_index };
}
export function inspectClaim(run: Run, claim: SelectedClaim, records: ResearchRecord[]) {
  const citations = (run.normalized?.citations || []).filter(c => c.segment_index === claim.segmentIndex);
  const located = citations.filter(c => { const span = citationSpan(run, c); return span && span.start < claim.end && span.end > claim.start; });
  const block = citations.filter(c => !citationSpan(run, c));
  const elsewhere = citations.filter(c => { const span = citationSpan(run, c); return span && !(span.start < claim.end && span.end > claim.start); });
  const reviews = records.filter(r => r.kind === "review" && r.payload.runId === run.id && r.payload.anchor && validAnchor(run, r.payload.anchor, r.payload.claim) && r.payload.anchor.segmentIndex === claim.segmentIndex && r.payload.anchor.start < claim.end && r.payload.anchor.end > claim.start);
  return { located, block, elsewhere, reviews };
}

export function reviewFacts(review: ResearchRecord, records: ResearchRecord[]): ResearchRecord[] {
  if (Array.isArray(review.payload.factSnapshots)) return review.payload.factSnapshots;
  return (review.payload.factIds || []).map((id: string) => records.find(r => r.id === id && r.kind === "fact")).filter(Boolean);
}

// Cross-panel links open an exact unique quote, never a guessed occurrence.
export function uniqueQuoteAnchor(run:Run,quote:string):SelectedClaim|null {
  if(!quote)return null;const matches:SelectedClaim[]=[];
  for(const [segmentIndex,segment] of (run.normalized?.segments||[]).entries()){
    let start=segment.text.indexOf(quote);while(start!==-1){matches.push({segmentIndex,start,end:start+quote.length,text:quote});if(matches.length>1)return null;start=segment.text.indexOf(quote,start+1);}
  }
  return matches[0]||null;
}
