import type { Aggregate, Snapshot, Work } from './contracts';
import { createHash, randomUUID } from 'node:crypto';
export function snapshot(work: Work): Snapshot {
 const substantive = { id:work.id, title:work.title, description:work.description, status:work.status, sourceVersion:work.sourceVersion, evidence:work.evidence };
 return { id:randomUUID(), digest:createHash('sha256').update(JSON.stringify(substantive)).digest('hex'), retrievedAt:new Date().toISOString(), evidence:structuredClone(work.evidence), sourceVersion:work.sourceVersion };
}
export function seed(): Aggregate {
 const work: Work = { id:'DEMO-1', title:'Introduce a human review checkpoint', description:'Review the security and maintainability of a saved work context before approving the integration. This is fixture evidence, not a live Software Factory work order.', status:'In Progress', sourceVersion:1, sourceAvailable:true, evidence:[
 { id:'requirements',title:'Review requirements',version:1,complete:true,permitted:true,content:'Required human sign-offs must approve. Agent advice cannot approve work. Preserve concerns, source status, private drafts and the evidence reviewed.' },
 { id:'blueprint',title:'Implementation evidence',version:1,complete:true,permitted:true,content:'Use immutable evidence snapshots, optimistic concurrency and transactional command receipts. Reverify evidence at approval. Retry failed verification without losing review history.' }
 ] };
 return { version:0, work, snapshot:snapshot(work), rounds:[], history:[] };
}
