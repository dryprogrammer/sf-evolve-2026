/** Explicit opt-in live demo proof. Never edits requirements, blueprints, decisions or work status. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const probeId='0a8c2f35-4b39-4033-b6d0-81655e05d1e4';
const workId='c8127cba-c26f-4eb6-8183-e5e09d36f732';
const app=process.env.FACTORY_PROOF_APP??'http://127.0.0.1:3002';
const url=new URL(app);assert(['127.0.0.1','localhost'].includes(url.hostname),'Live proof must target localhost, not expose the demo API.');
const output=process.env.FACTORY_PROOF_OUTPUT??'/tmp/factory-live-proof.json';
const stage=process.argv[2];assert(['prepare','change','verify','recover'].includes(stage),'Choose prepare, change, verify or recover.');
let actor='maya';
async function state(){const r=await fetch(`${app}/api/factory`,{headers:{Cookie:`factory_persona=${actor}`}});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));assert.equal(d.sourceMode,'factory');assert.equal(d.work.id,'WO-2');return d;}
async function command(v,operation,payload={},roundId,expectedCode){
 const body={operation,payload,roundId,expectedVersion:v.version,expectedPrincipalId:actor,idempotencyKey:randomUUID()};
 const r=await fetch(`${app}/api/factory`,{method:'POST',headers:{Cookie:`factory_persona=${actor}`,Origin:app,'Content-Type':'application/json'},body:JSON.stringify(body)});
 const d=await r.json();
 if(expectedCode){assert.equal(r.status,409);assert.equal(d.error.code,expectedCode);return {status:r.status,...d,attempted:body};}
 assert.equal(r.status,200,JSON.stringify(d));return d;
}
async function source(method='GET',body){
 assert(process.env.FACTORY_API_KEY,'Server-side API key is required.');
 const r=await fetch(`https://api.factory.8090.dev/v2/external-api/artifacts/${probeId}`,{method,headers:{Authorization:`Bearer ${process.env.FACTORY_API_KEY}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 const d=await r.json();assert.equal(r.status,200);assert.equal(d.data.id,probeId);assert.equal(d.data.name,'DEMO — API revision probe for WO-2 (non-sensitive supplemental evidence)');return d.data;
}
const revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const save=async data=>{await writeFile(output,JSON.stringify(data,null,2)+'\n');console.log(JSON.stringify({stage,output,revision,round:data.oldRound?.id,oldDigest:data.oldSnapshot?.digest,newDigest:data.changedSnapshot?.digest,rejections:data.rejections?.map(x=>({status:x.status,code:x.error.code})),recovery:data.recovery?.state},null,2));};
if(stage==='prepare'){
 const original=await source();let v=await state();assert(v.work.evidence.some(e=>e.provenance?.resourceId===probeId));assert(!v.rounds.some(r=>r.state==='open'),'Use fresh isolated proof storage; do not cancel unrelated reviews.');
 v=await command(v,'refresh');v=await command(v,'create_round');const id=v.rounds.at(-1).id;
 v=await command(v,'configure_round',{decisionMakerId:'maya',assignments:[{reviewerId:'alex',role:'Finance',question:'Does this exact Factory evidence basis support the bounded demo integration?',responsibility:'required'}]},id);
 v=await command(v,'publish',{},id);
 v=await command(v,'feedback',{disposition:'advice',text:'Scripted demo-persona contribution: standard payment terms use 20%; custom terms remain 15%. This is not an actual MCP human answer or approval.'},id);
 actor='alex';v=await state();v=await command(v,'signoff',{assignmentId:v.rounds.at(-1).assignments[0].id,outcome:'approve',rationale:'Programmatic fictional Alex sign-off for the original Factory evidence basis; not independent human authentication.'},id);
 actor='maya';v=await state();
 await save({kind:'live Factory API source read/change; local programmatic demo-persona review',codeRevision:revision,startedAt:new Date().toISOString(),workId,probeId,probeOriginalContent:original.markdown_content,probeOriginalUpdatedAt:original.updated_at,oldRound:v.rounds.at(-1),oldSnapshot:v.snapshot,sourceEvidence:v.work.evidence.map(e=>({id:e.id,title:e.title,sourceRef:e.sourceRef,provenance:e.provenance})),mcp:'DEFERRED: no verified Factory-to-app connection; no human answer fabricated.'});
}else{
 const proof=JSON.parse(await readFile(output,'utf8'));let v;
 if(stage==='change'){
  assert.equal(process.env.FACTORY_ALLOW_DEMO_PROBE_EDIT,'1','Explicit demo-probe edit opt-in is required.');
  const current=await source();assert.equal(current.markdown_content,proof.probeOriginalContent,'Probe changed since preparation; do not overwrite it.');
  const changed=current.markdown_content+'\n\n## Demo acceptance addendum — revision B\n\nActual Factory API proof edit, '+new Date().toISOString()+'. Custom payment-term exceptions now require an explicit Finance review of this exact evidence revision. The fictional limits remain 20% standard and 15% custom. This added demo evidence must invalidate the old Project Driver review basis; it is not a production requirement or native Factory approval.\n';
  const written=await source('PATCH',{markdown_content:changed});const reread=await source();assert.equal(reread.markdown_content,changed);proof.sourceChange={at:new Date().toISOString(),method:'PATCH /artifacts/{probeId}',verifiedReadAfterWrite:true,updatedAt:written.updated_at};await save(proof);
 }else if(stage==='verify'){
  v=await state();assert(v.work.sourceVersion>proof.oldSnapshot.sourceVersion);assert.deepEqual(v.rounds.find(r=>r.id===proof.oldRound.id),proof.oldRound);
  const rejection=await command(v,'decide',{outcome:'approve',rationale:'Attempted approval must remain rejected against the old basis.'},proof.oldRound.id,'changed_evidence');
  v=await state();v=await command(v,'refresh');assert.notEqual(v.snapshot.digest,proof.oldSnapshot.digest);assert.deepEqual(v.rounds.find(r=>r.id===proof.oldRound.id),proof.oldRound);
  const afterRefresh=await command(v,'decide',{outcome:'approve',rationale:'Refresh cannot renew old approvals.'},proof.oldRound.id,'changed_evidence');
  proof.rejections=[rejection,afterRefresh];proof.changedSnapshot=v.snapshot;proof.finishedAt=new Date().toISOString();await save(proof);
 }else{
  v=await state();v=await command(v,'cancel',{reason:'Old evidence rejected. Start a separate freshly reviewed demo basis.'},proof.oldRound.id);v=await command(v,'create_round');const id=v.rounds.at(-1).id;
  v=await command(v,'configure_round',{decisionMakerId:'maya',assignments:[{reviewerId:'alex',role:'Finance',question:'Is the revised Factory demo evidence basis reviewed?',responsibility:'required'}]},id);v=await command(v,'publish',{},id);
  const pending=await command(v,'decide',{outcome:'approve',rationale:'A fresh sign-off is required.'},id,'pending_signoffs');
  actor='alex';v=await state();v=await command(v,'signoff',{assignmentId:v.rounds.at(-1).assignments[0].id,outcome:'approve',rationale:'Programmatic demo persona re-review of revised Factory content; not an independent authenticated human.'},id);
  actor='maya';v=await state();v=await command(v,'decide',{outcome:'approve',rationale:'New demo review basis verified; no native Factory work status, release or approval changed.'},id);
  proof.recovery=v.rounds.at(-1);proof.recoveryPendingGate=pending;proof.recoveredAt=new Date().toISOString();await save(proof);
 }
}
