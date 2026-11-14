import type { Aggregate, Snapshot, Work } from './contracts';
import { canonical } from './canonical';
import { createHash, randomUUID } from 'node:crypto';
export function snapshot(work: Work): Snapshot {
 const substantive = { id:work.id, title:work.title, description:work.description, status:work.status, sourceVersion:work.sourceVersion, evidence:work.evidence };
 return { id:randomUUID(), digest:createHash('sha256').update(canonical(substantive)).digest('hex'), retrievedAt:new Date().toISOString(), evidence:structuredClone(work.evidence), sourceVersion:work.sourceVersion };
}
export function seed(): Aggregate {
 const work: Work = { id:'DEMO-1', title:'The renewal exception that became the rule', description:'Fictional Sales Operations requests 15% → 20% renewal discounts. Finance says custom payment terms must stay at 15%. Inspect the policy and real acceptance examples, then record an attributed clarification and revision-bound review. Seeded fiction, not live Software Factory data.', status:'In Progress', sourceVersion:1, sourceAvailable:true, evidence:[
 { id:'requirements',title:'Fictional renewal policy and exception',version:1,complete:true,permitted:true,sourceRef:'https://github.com/dryprogrammer/sf-evolve-2026/blob/5ba2f24f874ff933fd4000c9c409f7aba38e5cc4/docs/scenario/renewal-policy.md',content:'Seeded policy: raise standard-term renewal discounts from 15% to 20%. Custom payment terms remain at 15%. Clarification is a human contribution to record, not automatic consensus. Required sign-offs and final approval are separate actions.' },
 { id:'blueprint',title:'Implementation evidence',version:1,complete:true,permitted:true,sourceRef:'https://github.com/dryprogrammer/sf-evolve-2026/blob/5ba2f24f874ff933fd4000c9c409f7aba38e5cc4/src/lib/renewal.ts',content:'Real prepared acceptance example at commit 5ba2f24: renewalDiscountPercent returns 20 for standard terms, 15 for custom terms and rejects unknown terms. tests/renewal.test.ts verifies these examples. Review server retains immutable snapshots and rejects stale evidence at approval. Not connected to billing or deployed.' }
 ] };
 return { version:0, work, snapshot:snapshot(work), rounds:[], history:[] };
}
