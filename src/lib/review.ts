import { randomUUID } from 'node:crypto';
import { Aggregate, Assignment, Command, FactoryError, Principal, Round, principals } from './contracts';
import { snapshot } from './fixtures';
import { buildJudgmentAnswer, judgmentQuestion, supportsJudgmentDemo } from './judgment';
function fail(code:string,message:string,status=400): never { throw new FactoryError(code,message,status); }
export function text(value:unknown,max=4000):string { if(typeof value!=='string'||!value.trim()||[...value].length>max) fail('validation',`Text must contain 1–${max.toLocaleString()} characters.`); return value.trim(); }
function human(id:unknown):string { const p=principals.find(p=>p.id===id&&p.kind==='human'); if(!p) fail('validation','Assign a known human participant.'); return p.id; }
function outcome(value:unknown):'approve'|'request_changes' { if(value!=='approve'&&value!=='request_changes') fail('validation','Choose approve or request changes.'); return value; }
function coordinator(actor:Principal) { if(actor.kind!=='human'||!actor.coordinator) fail('denied','Only an explicitly granted human coordinator can perform this action.',403); }
export function transition(current:Aggregate,actor:Principal,command:Command):Aggregate {
 const a=structuredClone(current), p=command.payload, now=new Date().toISOString();
 if(command.expectedVersion!==a.version) fail('conflict','The work changed. Refresh before retrying; your attempted text is unchanged.',409);
 const record=(type:string,detail:string,round?:Round)=>a.history.push({id:randomUUID(),type,detail,actorId:actor.id,createdAt:now,roundId:round?.id,snapshotId:round?.snapshot.id??a.snapshot.id});
 const sourceAccessible=()=>{ if(!a.work.sourceAvailable) fail('unverifiable_evidence','Source access cannot be verified. Restore access and retry.',503); if(a.work.evidence.some(e=>!e.permitted)) fail('denied','Source evidence is no longer accessible.',403); };
 const evidenceComplete=()=>{ sourceAccessible(); if(a.work.evidence.some(e=>!e.complete)) fail('unverifiable_evidence','Required evidence is incomplete.',409); };
 if(command.operation==='simulate_change'||command.operation==='simulate_outage'||command.operation==='simulate_revoke') {
  coordinator(actor);
  if(command.operation==='simulate_change') { a.work.sourceVersion++; a.work.evidence[0].version++; a.work.evidence[0].content+='\nSimulated policy addendum: custom payment terms require an explicit Finance review of the exception. This is a local fixture revision, not a committed policy update.'; }
  if(command.operation==='simulate_outage') { if(typeof p.available!=='boolean') fail('validation','Availability must be a boolean.'); a.work.sourceAvailable=p.available; }
  if(command.operation==='simulate_revoke') { if(typeof p.permitted!=='boolean') fail('validation','Permission must be a boolean.'); a.work.evidence.forEach(e=>e.permitted=p.permitted as boolean); }
  record(command.operation,'Fixture source condition changed.');
 } else if(command.operation==='refresh') {
  sourceAccessible(); const next=snapshot(a.work); if(next.digest===a.snapshot.digest) next.id=a.snapshot.id; a.snapshot=next; record('refresh',a.work.evidence.some(e=>e.provenance)?'Saved verified authoritative Factory evidence.':'Retrieved current persisted fixture evidence.');
 } else if(command.operation==='create_round') {
  coordinator(actor); sourceAccessible(); const r:Round={id:randomUUID(),state:'draft',snapshot:structuredClone(a.snapshot),decisionMakerId:'',assignments:[],feedback:[],signoffs:[]}; a.rounds.push(r); record('create_round','Created an unassigned draft review.',r);
 } else {
  sourceAccessible(); const r=a.rounds.find(r=>r.id===command.roundId); if(!r) fail('missing','Review round not found.',404);
  if(['approved','changes_requested','cancelled'].includes(r.state)) fail('closed','This review is closed. Start a new round.',409);
  switch(command.operation) {
   case 'configure_round': {
    coordinator(actor); if(r.state!=='draft') fail('validation','Published obligations cannot be edited. Cancel and create a new round.');
    const assignments=p.assignments; if(!Array.isArray(assignments)||assignments.length>20) fail('validation','A round supports at most 20 assignments.');
    r.decisionMakerId=human(p.decisionMakerId);
    r.assignments=assignments.map((raw):Assignment=>{ if(!raw||typeof raw!=='object') fail('validation','Invalid assignment.'); const item=raw as Record<string,unknown>; if(item.responsibility!=='advisory'&&item.responsibility!=='required') fail('validation','Choose advisory or required review.'); return {id:randomUUID(),reviewerId:human(item.reviewerId),role:text(item.role,200),question:text(item.question,1000),responsibility:item.responsibility,generation:1}; });
    record('configure_round','Saved explicit review assignments.',r); break;
   }
   case 'publish': {
    coordinator(actor); evidenceComplete(); if(r.state!=='draft') fail('validation','Only a draft can be published.');
    human(r.decisionMakerId); if(!r.assignments.some(x=>x.responsibility==='required')) fail('validation','Assign at least one required human sign-off.');
    if(a.rounds.some(x=>x.state==='open')) fail('conflict','There is already an open review for this work.',409);
    if(snapshot(a.work).digest!==r.snapshot.digest) fail('changed_evidence','Draft evidence changed. Cancel and start a new round.',409);
    r.state='open'; record('publish','Opened review with fixed role obligations.',r); break;
   }
   case 'judgment_answer': {
    if(!supportsJudgmentDemo(a)) fail('unsupported','This prepared judgment question belongs only to the fictional renewal demo.');
    if(r.state!=='open') fail('validation','Answer in an open review.');
    if(actor.kind!=='human'||actor.id!=='alex'||!r.assignments.some(x=>x.reviewerId===actor.id&&x.responsibility==='required')) fail('denied','The assigned Finance reviewer must answer this business question.',403);
    evidenceComplete();
    if(p.evidenceDigest!==r.snapshot.digest||snapshot(a.work).digest!==r.snapshot.digest) fail('changed_evidence','The question basis changed. Start a fresh review before answering.',409);
    const judgment=buildJudgmentAnswer(p.choice,p.reason,r.snapshot);
    r.feedback.push({id:randomUUID(),actorId:actor.id,kind:'human',text:`${judgmentQuestion}\n${judgment.proposal}\nWhy: ${judgment.reason}`,disposition:'advice',createdAt:now,snapshotId:r.snapshot.id,judgment});
    record('judgment_answer','Recorded Finance clarification and deterministic acceptance proposal; not a sign-off or code change.',r); break;
   }
   case 'feedback': {
    if(r.state!=='open') fail('validation','Feedback needs an open review.');
    if(typeof p.disposition!=='string'||!['advice','support','request_changes'].includes(p.disposition)) fail('validation','Choose a feedback disposition.');
    r.feedback.push({id:randomUUID(),actorId:actor.id,kind:actor.kind,text:text(p.text,10000),disposition:p.disposition as 'advice'|'support'|'request_changes',createdAt:now,snapshotId:r.snapshot.id}); record('feedback','Saved an attributed contribution; not a sign-off.',r); break;
   }
   case 'signoff': {
    if(r.state!=='open') fail('validation','Sign-off needs an open review.'); const assignment=r.assignments.find(x=>x.id===p.assignmentId);
    if(!assignment||assignment.responsibility!=='required'||assignment.reviewerId!==actor.id||actor.kind!=='human') fail('denied','Only the assigned human can sign off this obligation.',403);
    r.signoffs.push({id:randomUUID(),assignmentId:assignment.id,generation:assignment.generation,actorId:actor.id,outcome:outcome(p.outcome),rationale:text(p.rationale),createdAt:now,snapshotId:r.snapshot.id}); record('signoff','Recorded a human response; prior responses remain in history.',r); break;
   }
   case 'decide': {
    if(r.state!=='open'||actor.kind!=='human'||r.decisionMakerId!==actor.id) fail('denied','Only the assigned human decision-maker can close an open review.',403);
    const choice=outcome(p.outcome), rationale=text(p.rationale); const responses:Record<string,string>={};
    const supplied=p.responses; if(supplied!==undefined&&(supplied===null||typeof supplied!=='object'||Array.isArray(supplied))) fail('validation','Concern responses must be keyed by contribution ID.');
    const concerns=[...r.feedback.filter(f=>f.kind==='human'&&f.disposition==='request_changes'),...r.signoffs.filter(s=>s.outcome==='request_changes')];
    for(const c of concerns) responses[c.id]=text((supplied as Record<string,unknown>|undefined)?.[c.id]);
    if(choice==='approve') {
     for(const assignment of r.assignments.filter(x=>x.responsibility==='required')) {
      const signoff=r.signoffs.filter(s=>s.assignmentId===assignment.id&&s.generation===assignment.generation).at(-1);
      if(!signoff||signoff.outcome!=='approve') fail('pending_signoffs','All current required human sign-offs must approve.',409);
     }
     evidenceComplete(); if(snapshot(a.work).digest!==r.snapshot.digest) fail('changed_evidence','Source evidence changed. Cancel and review it in a new round.',409);
    }
    r.decision={actorId:actor.id,outcome:choice,rationale,responses,createdAt:now,...(choice==='approve'?{verifiedAt:now,digest:r.snapshot.digest}:{})}; r.state=choice==='approve'?'approved':'changes_requested'; record('decide',`Human decision: ${choice}. Source work status was not changed.`,r); break;
   }
   case 'reassign': {
    coordinator(actor); if(r.state!=='open') fail('validation','Reassignment needs an open review.'); const reason=text(p.reason);
    if(p.decisionMakerId&&p.assignmentId) fail('validation','Reassign one responsibility at a time.');
    if(p.decisionMakerId) r.decisionMakerId=human(p.decisionMakerId);
    else { const assignment=r.assignments.find(x=>x.id===p.assignmentId); if(!assignment) fail('validation','Assignment not found.'); assignment.reviewerId=human(p.reviewerId); assignment.generation++; }
    record('reassign',`Reassigned human responsibility: ${reason}`,r); break;
   }
   case 'cancel': coordinator(actor); r.state='cancelled'; record('cancel',text(p.reason),r); break;
   default: fail('validation','Unsupported review command.');
  }
 }
 a.version++; return a;
}
