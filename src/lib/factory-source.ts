import { createHash } from 'node:crypto';
import { canonical } from './canonical';
import { FactoryError, type Evidence, type Work } from './contracts';

const API = 'https://api.factory.8090.dev/v2/external-api';
const PROJECT = 'https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export interface EvidenceSource { scope: string; read(): Promise<Work>; }
type RecordData = Record<string, unknown>;
type Link = { resourceType: string; resourceId: string };
export const contentDigest = (value: unknown) => createHash('sha256').update(canonical(value)).digest('hex');
function invalid(): never { throw new FactoryError('unverifiable_evidence', 'Factory evidence is missing, incomplete, unsupported, or changed during retrieval. No review mutation was accepted.', 503); }
function string(value: unknown): string { if (typeof value !== 'string' || !value.trim()) invalid(); return value; }
function links(value: unknown): Link[] {
 if (!Array.isArray(value) || value.length > 20) invalid();
 return value.map(raw => { if (!raw || typeof raw !== 'object') invalid(); const x=raw as RecordData; const resourceId=string(x.resourceId); if(!UUID.test(resourceId)) invalid(); return {resourceId,resourceType:string(x.resourceType)}; });
}
/** Server-only, project-key-scoped read adapter. No write API or caller-selected URL. */
export class FactoryApiSource implements EvidenceSource {
 readonly scope: string;
 constructor(private workId: string, private supplementalIds: string[] = [], private key = process.env.FACTORY_API_KEY, private transport: typeof fetch = fetch) {
  if (!UUID.test(workId) || supplementalIds.length>5 || supplementalIds.some(id=>!UUID.test(id))) throw new FactoryError('disabled','Configure a work-order UUID and at most five supplemental document UUIDs.',503);
  this.scope=`factory:${workId}:${contentDigest([...supplementalIds].sort()).slice(0,16)}`;
 }
 private async readRecord(path: string): Promise<RecordData> {
  if(!this.key) throw new FactoryError('disabled','Factory API key is not available server-side.',503);
  let response: Response;
  try { response=await this.transport(API+path,{headers:{Authorization:`Bearer ${this.key}`,Accept:'application/json'},cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)}); }
  catch { throw new FactoryError('unverifiable_evidence','Factory retrieval failed or timed out. Cached evidence cannot authorize a review mutation.',503); }
  if(!response.ok) throw new FactoryError(response.status===401||response.status===403||response.status===404?'source_denied':'unverifiable_evidence',`Factory evidence could not be verified (HTTP ${response.status}). Cached evidence cannot authorize a review mutation.`,response.status===401||response.status===403||response.status===404?403:503);
  let json: unknown; try { const text=await response.text(); if(text.length>500000) invalid(); json=JSON.parse(text); } catch { invalid(); }
  if(!json||typeof json!=='object'||!('data' in json)) invalid();
  const data=(json as {data:unknown}).data; if(!data||typeof data!=='object'||Array.isArray(data)) invalid(); return data as RecordData;
 }
 private evidence(data: RecordData, type: string, expectedId: string): Evidence {
  const id=string(data.id); if(id!==expectedId) invalid();
  const title=string(type==='artifact'?data.name:data.title),content=string(data.markdown_content);
  if(content.length>150000) invalid();
  if(type==='artifact'&&data.type!=='document') invalid();
  const updatedAt=string(data.updated_at);
  const route=type==='artifact'?'knowledge-base':type==='requirements_document'?'requirements':type==='blueprint'?'blueprints':'work-orders';
  const number=type==='work_order'?data.work_order_number:data.version_number;
  if(type==='work_order'&&(!Number.isSafeInteger(number)||Number(number)<1)) invalid();
  if(type!=='artifact'&&type!=='work_order'&&(!Number.isSafeInteger(number)||Number(number)<1||!UUID.test(string(data.version_id)))) invalid();
  return {id:`${type}:${id}`,title,content,version:type==='work_order'||type==='artifact'?1:Number(number),complete:true,permitted:true,sourceRef:`${PROJECT}/${route}/${type==='work_order'?number:id}`,provenance:{provider:'factory',resourceId:id,resourceType:type,revisionId:typeof data.version_id==='string'?data.version_id:undefined,updatedAt,contentDigest:contentDigest({title,content}),supplemental:this.supplementalIds.includes(id)}};
 }
 private async collect(): Promise<Work> {
  const work=await this.readRecord(`/work_orders/${this.workId}`);
  const direct=links(work.connectedContext);
  // Scope is deliberately direct documents only; unsupported direct evidence fails closed.
  const required=[...direct,...this.supplementalIds.map(resourceId=>({resourceType:'artifact',resourceId}))];
  const unique=[...new Map(required.map(x=>[`${x.resourceType}:${x.resourceId}`,x])).values()].sort((a,b)=>`${a.resourceType}:${a.resourceId}`.localeCompare(`${b.resourceType}:${b.resourceId}`));
  const evidence=[this.evidence(work,'work_order',this.workId)];
  for(const link of unique) {
   const prefix=link.resourceType==='requirements_document'?'requirements':link.resourceType==='blueprint'?'blueprints':link.resourceType==='artifact'?'artifacts':null;
   if(!prefix) invalid();
   evidence.push(this.evidence(await this.readRecord(`/${prefix}/${link.resourceId}`),link.resourceType,link.resourceId));
  }
  return {id:`WO-${work.work_order_number}`,title:string(work.title),description:string(work.markdown_content),status:string(work.status).replaceAll('_',' '),sourceVersion:1,sourceAvailable:true,evidence,sourceRetrievedAt:new Date().toISOString(),sourceCoverage:'Full work-order Markdown + all directly linked requirements, blueprints and document-backed Knowledge Base resources + explicitly configured supplemental documents. No transitive records, comments, code, or native approval authority.'};
 }
 async read(): Promise<Work> {
  // Two matching complete reads provide a bounded stable cut, not an API transaction.
  const first=await this.collect(),second=await this.collect();
  const basis=(w:Work)=>({id:w.id,title:w.title,description:w.description,status:w.status,evidence:w.evidence});
  if(contentDigest(basis(first))!==contentDigest(basis(second))) invalid();
  return second;
 }
}
export function configuredSource(): EvidenceSource | undefined {
 if(!process.env.FACTORY_SOURCE||process.env.FACTORY_SOURCE==='fixture') return undefined;
 if(process.env.FACTORY_SOURCE!=='api') throw new FactoryError('disabled','Select FACTORY_SOURCE=fixture or api.',503);
 return new FactoryApiSource(process.env.FACTORY_WORK_ORDER_ID??'',(process.env.FACTORY_SUPPLEMENTAL_IDS??'').split(',').filter(Boolean));
}
