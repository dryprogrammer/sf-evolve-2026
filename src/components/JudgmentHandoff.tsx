'use client';
import { useState } from 'react';
import type { Command, FactoryView, Round } from '@/lib/contracts';
import { judgmentQuestion, judgmentChoices, supportsJudgmentDemo, type JudgmentChoice } from '@/lib/judgment';
export default function JudgmentHandoff({view,round,blocked,send}:{view:FactoryView;round:Round;blocked:boolean;send:(operation:Command['operation'],payload:Command['payload'],roundId?:string)=>Promise<boolean>}) {
 const [choice,setChoice]=useState<JudgmentChoice>('keep_custom_limit');
 const [reason,setReason]=useState('');
 if(!supportsJudgmentDemo(view)) return null;
 const answers=round.feedback.filter(f=>f.judgment);
 const stale=round.snapshot.digest!==view.snapshot.digest||round.snapshot.sourceVersion!==view.work.sourceVersion;
 const canAnswer=view.principal.kind==='human'&&view.principal.id==='alex'&&round.assignments.some(a=>a.reviewerId==='alex'&&a.responsibility==='required')&&round.state==='open';
 return <section className="panel" aria-label="Business judgment handoff"><h2>A question for Finance</h2><p><strong>{judgmentQuestion}</strong></p><p className="muted">Sales requested 20%. The prepared policy keeps custom terms at 15%. Engineering needs a business decision, not another code search.</p><p className="small">Fictional prepared question · evidence {round.snapshot.digest.slice(0,12)} · deterministic proposal, no agent/MCP invocation.</p>
 {stale&&<p role="status">Evidence changed. These answers need reconfirmation in a fresh review.</p>}
 {canAnswer?<form onSubmit={e=>{e.preventDefault();void send('judgment_answer',{choice,reason,evidenceDigest:round.snapshot.digest},round.id);}}>
 <fieldset disabled={blocked||stale}><legend>Which rule should Engineering use?</legend>{judgmentChoices.map(c=><label key={c.id} style={{display:'block',marginBottom:12}}><input type="radio" name="judgment-choice" value={c.id} checked={choice===c.id} onChange={()=>setChoice(c.id)}/>{' '}{c.label}<small style={{display:'block'}}>{c.consequence}</small></label>)}<label htmlFor="judgment-reason">Business reason</label><textarea id="judgment-reason" value={reason} maxLength={2000} required onChange={e=>setReason(e.target.value)}/><button disabled={!reason.trim()}>Record answer & build acceptance examples</button></fieldset></form>:<p className="muted">Publish a round with Alex as a required reviewer, then switch to Alex to answer. Clarification does not sign off or approve work.</p>}
 {answers.map(answer=><article key={answer.id} style={{borderTop:'1px solid #ddd',marginTop:16,paddingTop:12}}><h3>Engineering acceptance proposal</h3><p className="small">From {view.principals.find(p=>p.id===answer.actorId)?.name} · answer {answer.id.slice(0,8)} · evidence {answer.judgment!.evidenceDigest.slice(0,12)}{stale?' · STALE':''}</p><p>{answer.judgment!.reason}</p><p>{answer.judgment!.proposal}</p><ul>{answer.judgment!.examples.map(example=><li key={example.terms}>{example.terms} terms: expected {example.expected}%, prepared code returns {example.actual}% — <strong>{example.expected===example.actual?'matches':'implementation change needed'}</strong></li>)}</ul><p className="small muted">Evaluated against the prepared renewal function, not deployed billing. Source policy is unchanged. Still requires policy reconciliation, review and tests; this answer is not approval.</p></article>)}
 </section>;
}
