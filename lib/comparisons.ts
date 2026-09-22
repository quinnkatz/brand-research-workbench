import { answerOf, type Run } from "./research";
import { eligible, mentioned, observedAt } from "./analytics";

export function stableJson(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(stableJson).join(",")}]`;
  if(value&&typeof value==="object")return `{${Object.keys(value).sort().filter(k=>(value as Record<string,unknown>)[k]!==undefined).map(k=>`${JSON.stringify(k)}:${stableJson((value as Record<string,unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(value??null);
}
export function protocolOf(run:Run){
  const s=run.settings||{};
  return {provider:run.provider,environment:run.environment,model:run.normalized?.model_reported||run.model,requestedModel:run.model,prompt:run.prompt,search:run.search,
    questionVersion:s.questionVersion??null,questionContext:s.questionContext??null,purpose:s.purpose||s.questionContext?.purpose||"unclassified",intent:s.intent??null,
    maxTokens:s.maxTokens??null,repeatIndex:s.repeatIndex??null,profile:s.brandProfileSnapshot??null,userLocation:s.userLocation??s.location??null,locale:s.locale??null,
    mode:s.mode??null,memory:s.memory??null,conversation:s.conversation??null,domainFilters:s.domainFilters??null};
}
export type Period={from:string;to:string};
export function createComparison(aliases:string[],before:Period,after:Period){
  const periods=[before,after],maps=[new Map<string,Run>(),new Map<string,Run>()];let invalid=0,superseded=0;
  return {
    add(run:Run){const day=observedAt(run).slice(0,10),side=periods.findIndex(p=>day>=p.from&&day<=p.to);if(side<0)return;
      if(!eligible(run)){invalid++;return;}const key=stableJson(protocolOf(run)),old=maps[side].get(key);
      if(old)superseded++;if(!old||observedAt(run)>observedAt(old)||observedAt(run)===observedAt(old)&&run.id>old.id)maps[side].set(key,run);
    },
    result(){const pairs=[...maps[0]].flatMap(([key,a])=>{const b=maps[1].get(key);if(!b)return[];
      const aMention=mentioned(answerOf(a),aliases),bMention=mentioned(answerOf(b),aliases);
      const aSources=[...new Set(a.normalized?.sources.filter(s=>s.role==="cited").map(s=>s.url))],bSources=[...new Set(b.normalized?.sources.filter(s=>s.role==="cited").map(s=>s.url))];
      return [{before:{id:a.id,at:observedAt(a),mention:aMention},after:{id:b.id,at:observedAt(b),mention:bMention},provider:a.provider,environment:a.environment,model:a.model,prompt:a.prompt,questionVersion:a.settings?.questionVersion||null,purpose:a.settings?.questionContext?.purpose||"unclassified",addedCitations:bSources.filter(s=>!aSources.includes(s)),removedCitations:aSources.filter(s=>!bSources.includes(s))}];});
      const n=pairs.length,a=pairs.filter(p=>p.before.mention).length,b=pairs.filter(p=>p.after.mention).length;
      return {pairs,denominator:n,beforeMentions:a,afterMentions:b,beforeRate:n?a/n*100:null,afterRate:n?b/n*100:null,change:n?(b-a)/n*100:null,
        excluded:{failedOrEmpty:invalid,earlierWithinProtocol:superseded,onlyBefore:maps[0].size-n,onlyAfter:maps[1].size-n},
        method:"Latest eligible observation per exact recorded protocol in each period. Each matched protocol has equal weight. Consumer conditions and missing metadata remain limited to what was recorded; matching does not control hidden personalization or establish causality."};
    }
  };
}

export type ComparisonResult=ReturnType<ReturnType<typeof createComparison>["result"]>;
