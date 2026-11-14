import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { Aggregate, Command, Draft, FactoryError, FactoryView, Principal, principals } from './contracts';
import { seed } from './fixtures';
import { canonical } from './canonical';
import { transition } from './review';
const SCOPE='fixture-project:DEMO-1';
export class FactoryStore {
 readonly db:PGlite;
 private ready:Promise<void>;
 constructor(directory?:string) {
  if(directory) mkdirSync(path.dirname(path.resolve(directory)),{recursive:true});
  this.db=new PGlite(directory);
  this.ready=this.initialize();
 }
 private async initialize() {
  const sql=await readFile(path.join(process.cwd(),'migrations/001_initial.sql'),'utf8'); await this.db.exec(sql);
  await this.db.query('INSERT INTO factory_state (scope, version, document) VALUES ($1,0,$2) ON CONFLICT DO NOTHING',[SCOPE,JSON.stringify(seed())]);
  const existing=await this.db.query<{document:Aggregate}>('SELECT document FROM factory_state WHERE scope=$1',[SCOPE]);
  for(const snap of [existing.rows[0].document.snapshot,...existing.rows[0].document.rounds.map(r=>r.snapshot)]) await this.db.query('INSERT INTO factory_snapshots (scope,snapshot_id,document) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[SCOPE,snap.id,JSON.stringify(snap)]);
 }
 async close(){ await this.ready; await this.db.close(); }
 async get(actor:Principal):Promise<FactoryView> {
  await this.ready;
  const result=await this.db.query<{document:Aggregate}>('SELECT document FROM factory_state WHERE scope=$1',[SCOPE]);
  const row=await this.db.query<{text:string;snapshot_id:string;version:number}>('SELECT text,snapshot_id,version FROM factory_drafts WHERE scope=$1 AND author_id=$2',[SCOPE,actor.id]);
  const draft:Draft|null=row.rows[0]?{text:row.rows[0].text,snapshotId:row.rows[0].snapshot_id,version:row.rows[0].version}:null;
  const a=structuredClone(result.rows[0].document);
  // Permission loss redacts protected evidence in EVERY historical/current projection.
  const denied=a.work.evidence.some(e=>!e.permitted);
  if(denied){ for(const evidence of [a.work.evidence,a.snapshot.evidence,...a.rounds.map(r=>r.snapshot.evidence)]) for(const e of evidence){ e.content=''; e.title='Restricted evidence'; e.permitted=false; } a.rounds=[]; a.history=a.history.filter(e=>e.type.startsWith('simulate_')); }
  return {...a,principal:actor,principals,draft:denied?null:draft,sourceMode:'fixture'};
 }
 async execute(actor:Principal,command:Command):Promise<FactoryView> {
  await this.ready;
  if(command.expectedPrincipalId!==actor.id) throw new FactoryError('persona_changed','Fixture persona changed in another tab. Reload and check prior history before resubmitting.',409);
  if(typeof command.operation!=='string') throw new FactoryError('validation','An operation name is required.');
  if(typeof command.idempotencyKey!=='string'||command.idempotencyKey.length<1||command.idempotencyKey.length>200||!Number.isSafeInteger(command.expectedVersion)||!command.payload||typeof command.payload!=='object'||Array.isArray(command.payload)) throw new FactoryError('validation','A command needs a key, expected version and object payload.');
  const digest=createHash('sha256').update(canonical(command)).digest('hex');
  await this.db.transaction(async tx=>{
   const data=await tx.query<{document:Aggregate}>('SELECT document FROM factory_state WHERE scope=$1 FOR UPDATE',[SCOPE]); const current=data.rows[0].document;
   const privilegedSimulation=command.operation.startsWith('simulate_')&&actor.kind==='human'&&actor.coordinator;
   const receipt=await tx.query<{digest:string}>('SELECT digest FROM factory_receipts WHERE scope=$1 AND author_id=$2 AND command_key=$3',[SCOPE,actor.id,command.idempotencyKey]);
   if(receipt.rows.length){ if(receipt.rows[0].digest!==digest) throw new FactoryError('key_reuse','The command key was already used for different content.',409); return; }
   if(!privilegedSimulation&&(!current.work.sourceAvailable||current.work.evidence.some(e=>!e.permitted))) throw new FactoryError(current.work.sourceAvailable?'source_denied':'unverifiable_evidence','Source permission/freshness cannot be verified. No mutation was accepted.',current.work.sourceAvailable?403:503);
   if(command.operation==='save_draft'||command.operation==='discard_draft') {
    if(actor.kind!=='human') throw new FactoryError('denied','Private drafts are human-only in this pilot.',403);
    const saved=await tx.query<{version:number}>('SELECT version FROM factory_drafts WHERE scope=$1 AND author_id=$2',[SCOPE,actor.id]); const version=saved.rows[0]?.version??0;
    if(command.payload.draftVersion!==version) throw new FactoryError('conflict','Your saved draft changed in another session. Reload without discarding attempted text.',409);
    if(command.operation==='discard_draft') await tx.query('INSERT INTO factory_drafts (scope,author_id,version,snapshot_id,text) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (scope,author_id) DO UPDATE SET version=$3,text=$5',[SCOPE,actor.id,version+1,current.snapshot.id,'']);
    else {
     const value=command.payload.text; if(typeof value!=='string'||[...value].length>10000) throw new FactoryError('validation','Drafts support at most 10,000 characters.');
     if(command.payload.snapshotId!==current.snapshot.id) throw new FactoryError('changed_evidence','Save against the current inspected context. Refresh first.',409);
     await tx.query('INSERT INTO factory_drafts (scope,author_id,version,snapshot_id,text) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (scope,author_id) DO UPDATE SET version=$3,snapshot_id=$4,text=$5',[SCOPE,actor.id,version+1,current.snapshot.id,value]);
    }
   } else {
    const next=transition(current,actor,command);
    await tx.query('UPDATE factory_state SET version=$2,document=$3 WHERE scope=$1',[SCOPE,next.version,JSON.stringify(next)]);
    await tx.query('INSERT INTO factory_snapshots (scope,snapshot_id,document) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[SCOPE,next.snapshot.id,JSON.stringify(next.snapshot)]);
   }
   const version=await tx.query<{version:number}>('SELECT version FROM factory_state WHERE scope=$1',[SCOPE]);
   await tx.query('INSERT INTO factory_receipts (scope,author_id,command_key,digest,result_version) VALUES ($1,$2,$3,$4,$5)',[SCOPE,actor.id,command.idempotencyKey,digest,version.rows[0].version]);
  });
  return this.get(actor);
 }
}
const globalStore=globalThis as typeof globalThis & { factoryStore?:FactoryStore };
export function store():FactoryStore {
 if(process.env.FACTORY_MODE!=='fixture') throw new FactoryError('disabled','Live mode is not implemented. Set FACTORY_MODE=fixture to run the labeled pilot.',503);
 return globalStore.factoryStore??=(new FactoryStore(process.env.FACTORY_DATA_DIR??path.join(process.cwd(),'.data/factory')));
}
