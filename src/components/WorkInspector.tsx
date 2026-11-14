'use client';
import NeedsYou from './NeedsYou';
import EvidenceChain from './EvidenceChain';

import { useEffect, useRef, useState } from 'react';
import type { Assignment, Command, FactoryView, Outcome, Round } from '@/lib/contracts';

type Setup = Pick<Assignment, 'reviewerId' | 'role' | 'question' | 'responsibility'>;
type Send = (operation: Command['operation'], payload: Command['payload'], roundId?: string) => Promise<boolean>;

function date(value: string) { return new Date(value).toLocaleString(); }
async function responseView(response: Response): Promise<FactoryView> {
  const data = await response.json();
  if (!response.ok) throw new Error(`${data.error?.code ?? response.status}: ${data.error?.message ?? 'The request could not be completed.'}`);
  return data as FactoryView;
}

export default function WorkInspector({ onViewChange, onBlockedChange, personaRequest, attentionRequest }: { onViewChange: (view:FactoryView|null)=>void; onBlockedChange: (blocked:boolean)=>void; personaRequest:{id:string}|null; attentionRequest?:{target:string;nonce:number}|null }) {
  const [view, setView] = useState<FactoryView | null>(null);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState('');
  const [feedback, setFeedback] = useState('');
  const [disposition, setDisposition] = useState('advice');
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [retry, setRetry] = useState<Command | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { onViewChange(view); }, [view, onViewChange]);
  useEffect(() => { onBlockedChange(busy || !!retry); }, [busy, retry, onBlockedChange]);
  useEffect(() => { if (personaRequest) void reload(personaRequest.id); }, [personaRequest]);

  useEffect(() => {
    let active = true;
    fetch('/api/factory', { cache: 'no-store' }).then(responseView).then(next => {
      if (!active) return;
      setView(next); setDraft(next.draft?.text ?? '');
      setSelected(next.rounds.at(-1)?.id ?? '');
    }).catch(e => { if (active) setError(String(e.message)); }).finally(() => { if (active) setLoaded(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!attentionRequest) return;
    setSelected(view?.rounds.at(-1)?.id ?? '');
    const timer=setTimeout(() => {const target=document.getElementById(attentionRequest.target);target?.scrollIntoView({block:'start'});}, 50);
    return () => clearTimeout(timer);
  }, [attentionRequest]);

  const round = view?.rounds.find(item => item.id === selected);
  const blocked = busy || !!retry;
  const human = view?.principal.kind === 'human';
  const coordinator = human && view?.principal.coordinator;
  const name = (id: string) => view?.principals.find(p => p.id === id)?.name ?? (id || 'Not assigned');

  async function submit(command: Command): Promise<boolean> {
    if (lock.current) return false;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      let response: Response;
      try {
        response = await fetch('/api/factory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(command) });
      } catch {
        setRetry(command);
        throw new Error('Network interrupted. The outcome is unknown. Retry below uses the same command and idempotency key; your text is retained.');
      }
      let next: FactoryView;
      try { next = await responseView(response); }
      catch (e) {
        if (response.ok || (e instanceof Error && e.message.startsWith('unavailable:'))) setRetry(command); // The response may be lost after commit.
        else setRetry(null);
        throw e;
      }
      if (view && next.principal.id !== view.principal.id) {
        setDraft(next.draft?.text ?? ''); setFeedback(''); setDisposition('advice');
        setSelected(next.rounds.at(-1)?.id ?? '');
      }
      if (next.work.evidence.some(e => !e.permitted)) { setDraft(''); setFeedback(''); }
      setView(next); setRetry(null);
      if (command.operation === 'create_round') setSelected(next.rounds.at(-1)?.id ?? '');
      if (command.operation === 'discard_draft') setDraft('');
      setNotice(command.operation === 'save_draft' ? 'Private draft saved to the server.' : 'Server confirmed the action.');
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Request failed. Your text has been retained.';
      if(message.startsWith('unverifiable_evidence:')) setView(null);
      if (message.startsWith('source_denied:') || message.startsWith('persona_changed:')) {
        // Detected access/session changes invalidate every old protected projection immediately.
        setView(null); setDraft(''); setFeedback(''); setSelected(''); setDisposition('advice'); setRetry(null);
        try {
          const current = await responseView(await fetch('/api/factory', { cache: 'no-store' }));
          setView(current); setDraft(current.draft?.text ?? ''); setSelected(current.rounds.at(-1)?.id ?? '');
        } catch { /* Keep the protected view hidden if reconciliation is unavailable. */ }
      }
      setError(message); return false;
    }
    finally { lock.current = false; setBusy(false); }
  }

  const send: Send = async (operation, payload, roundId) => {
    if (!view || blocked || lock.current) return false;
    return submit({ operation, payload, roundId, expectedVersion: view.version, expectedPrincipalId: view.principal.id, idempotencyKey: crypto.randomUUID() });
  };

  async function reload(principalId?: string) {
    if (lock.current || retry) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try {
      if (principalId) {
        // A lost session response may still change the cookie: hide the old persona first.
        setView(null); setDraft(''); setFeedback(''); setSelected(''); setDisposition('advice');
        const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ principalId }) });
        if (!response.ok) { const data = await response.json(); throw new Error(data.error?.message ?? 'Persona switch failed.'); }
      }
      const next = await responseView(await fetch('/api/factory', { cache: 'no-store' }));
      if (next.work.evidence.some(e => !e.permitted)) { setDraft(''); setFeedback(''); }
      setView(next);
      if (principalId || !view || next.principal.id !== view.principal.id) {
        setDraft(next.draft?.text ?? ''); setFeedback(''); setSelected(next.rounds.at(-1)?.id ?? '');
      }
      setSelected(previous => next.rounds.some(r => r.id === previous) ? previous : (next.rounds.at(-1)?.id ?? ''));
      setNotice('Latest server state loaded.');
    } catch (e) { if(e instanceof Error&&(e.message.startsWith('source_denied:')||e.message.startsWith('unverifiable_evidence:'))) setView(null); setError(e instanceof Error ? e.message : 'Unable to load source state.'); }
    finally { lock.current = false; setBusy(false); }
  }

  return <>
    <header className="inspector-head"><div><p className="eyebrow">Shared work context</p><h2>Work inspector</h2><p className="muted">Evidence, feedback, and accountable decisions.</p></div>
      {view && <div className="persona"><label htmlFor="persona">Fixture persona</label><select id="persona" value={view.principal.id} disabled={blocked} onChange={e => void reload(e.target.value)}>{view.principals.map(p => <option key={p.id} value={p.id}>{p.name} · {p.kind}</option>)}</select><small>{view.principal.kind === 'human' ? 'Human participant' : 'Agent — advice is not approval'}{coordinator ? ' · fixture coordinator' : ''}</small></div>}
    </header>
    <div className="work-inspector-content">
      <div className="messages" aria-live="polite" aria-atomic="true">{error && <div className="alert error" role="alert">{error}</div>}{notice && <div className="alert success">{notice}</div>}</div>
      {retry && <div className="alert warning"><p>Unconfirmed command: <strong>{retry.operation}</strong>. Other actions are paused to prevent accidental duplication.</p><button disabled={busy} onClick={() => void submit(retry)}>Retry same command</button></div>}
      {!view ? <section className="panel"><h2>{loaded ? 'Fixture state unavailable' : 'Loading fixture context…'}</h2><p>Private review content is not shown until the server confirms the active persona.</p>{loaded && <button disabled={busy} onClick={() => void reload()}>Try loading again</button>}</section> : <>
        <div className="work-heading"><div><p className="eyebrow">{view.work.id} · {view.work.status}</p><h2>{view.work.title}</h2></div><button disabled={blocked} onClick={() => void reload()}>Reload server state</button></div>
        <NeedsYou view={view} onAction={target => { setSelected(view.rounds.at(-1)?.id ?? ''); setTimeout(() => document.getElementById(target)?.scrollIntoView({ block: 'start' }), 0); }} /><div className="columns"><div className="context-column">
          <section className="panel" id="demo-evidence"><div className="section-heading"><h2>Context & evidence</h2><span className="badge">{view.sourceMode==='factory'?'Factory API source':'Fixture source'}</span></div><details><summary>Read full work-order context</summary><p className="preserve">{view.work.description}</p></details>
            <div className="source-status" role="status"><strong>{view.work.sourceAvailable ? 'Source available' : 'Source unavailable — verification blocked'}</strong><p>Source v{view.work.sourceVersion} · saved context v{view.snapshot.sourceVersion}</p>{view.work.sourceVersion !== view.snapshot.sourceVersion && <p className="warning-text">Source changed. Refresh the saved context before continuing.</p>}{round && round.snapshot.sourceVersion !== view.work.sourceVersion && <p className="warning-text">Selected round reviews an older snapshot. Server verification determines whether an outcome is available.</p>}</div>
            <button disabled={blocked} onClick={() => void send('refresh', {})}>Refresh saved context</button>
            <p className="muted small">{view.sourceMode==='factory'?'Refresh saves the verified Factory basis. Old sign-offs remain stale; a new review is required.':'Refresh is a fixture command, not live synchronization.'} Unsent text is preserved.</p>
            {view.work.sourceCoverage&&<details><summary>Evidence coverage & limits</summary><p className="small">{view.work.sourceCoverage}</p><p className="small">Last complete retrieval {date(view.work.sourceRetrievedAt??view.snapshot.retrievedAt)}. Stable double-read, not an atomic Factory transaction. Review identities are fictional local personas.</p></details>}<EvidencePanel view={view} round={round} />
          </section>
          <section className="panel"><div className="section-heading"><h2>Private draft</h2><span className="badge">Only {name(view.principal.id)}</span></div><p className="muted">Not shared with reviewers. Saving does not submit feedback.</p>
            <label htmlFor="private-draft">Your working notes</label><textarea id="private-draft" rows={7} value={draft} disabled={busy} onChange={e => setDraft(e.target.value)} />
            <p className="small" role="status">{draft === (view.draft?.text ?? '') && view.draft ? `Saved · draft v${view.draft.version}` : draft ? 'Unsaved text' : 'No private draft saved'}{view.draft && <> · snapshot {view.draft.snapshotId.slice(0, 8)}{view.draft.snapshotId !== view.snapshot.id ? ' (older context)' : ''}</>}</p>
            <div className="actions"><button disabled={blocked} onClick={() => void send('save_draft', { text: draft, snapshotId: view.snapshot.id, draftVersion: view.draft?.version ?? 0 })}>Save private draft</button><button className="secondary" disabled={blocked || (!draft && !view.draft)} onClick={() => { if (window.confirm('Discard your saved private draft and unsent draft text? This cannot be undone.')) void send('discard_draft', { draftVersion: view.draft?.version ?? 0 }); }}>Discard draft…</button></div>
          </section>
          {coordinator && view.sourceMode==='fixture' && <section className="panel simulation"><h2>Fixture coordinator controls</h2><p className="muted">Simulation only. These controls are not authority over live work.</p><div className="actions"><button className="secondary" disabled={blocked} onClick={() => void send('simulate_change', {})}>Simulate source change</button><button className="secondary" disabled={blocked} onClick={() => void send('simulate_outage', { available: !view.work.sourceAvailable })}>{view.work.sourceAvailable ? 'Simulate outage' : 'Restore source'}</button><button className="secondary" disabled={blocked} onClick={() => void send('simulate_revoke', { permitted: !view.work.evidence.every(e => e.permitted) })}>{view.work.evidence.every(e => e.permitted) ? 'Revoke evidence access' : 'Restore evidence access'}</button></div></section>}
        </div>
        <div className="review-column">
          <section className="panel" id="review-controls"><div className="section-heading"><h2>Review rounds</h2>{coordinator && <button disabled={blocked} onClick={() => void send('create_round', {})}>New round</button>}</div><p className="muted">UI actions do not confer authority. The server checks actor, version, evidence, and review gates.</p>
            {view.rounds.length ? <><label htmlFor="round">Current & prior rounds</label><select id="round" value={selected} disabled={blocked} onChange={e => setSelected(e.target.value)}>{view.rounds.map((r, i) => <option key={r.id} value={r.id}>Round {i + 1} · {r.state.replaceAll('_', ' ')}{i === view.rounds.length - 1 ? ' · newest' : ''}</option>)}</select></> : <div className="empty">No review round yet. The fixture coordinator can start one with an empty assignment setup.</div>}
          </section>
          {round && <RoundControls key={`${view.principal.id}:${round.id}`} view={view} round={round} send={send} blocked={blocked} />}
          {round?.state === 'open' && <section className="panel" id="shared-feedback"><h2>Shared feedback</h2><p className="muted">{human ? 'Advice and concerns are separate from a required sign-off.' : 'Agent contributions are advisory only and cannot approve work.'}</p><form onSubmit={e => { e.preventDefault(); void send('feedback', { text: feedback, disposition }, round.id); }}><label htmlFor="feedback">Your contribution</label><textarea id="feedback" rows={5} required value={feedback} disabled={busy} onChange={e => setFeedback(e.target.value)} /><div className="actions"><button type="button" className="secondary" disabled={blocked || !view.draft || !!feedback} onClick={() => setFeedback(view.draft?.text ?? '')}>Copy saved draft</button></div><label htmlFor="disposition">Disposition</label><select id="disposition" value={disposition} disabled={blocked} onChange={e => setDisposition(e.target.value)}><option value="advice">Advice</option><option value="support">Support (not a sign-off)</option><option value="request_changes">Request changes</option></select><button disabled={blocked || !feedback.trim()}>Submit feedback</button><p className="small muted">Text is retained after submission. Check history before submitting again.</p></form></section>}
          {round && <Contributions view={view} round={round} />}
          <section className="panel"><h2>Audit history</h2>{view.history.length ? <ol className="timeline">{[...view.history].reverse().map(item => <li key={item.id}><strong>{item.type.replaceAll('_', ' ')}</strong><p>{item.detail}</p><small>{name(item.actorId)} · {date(item.createdAt)}{item.roundId ? ` · round ${view.rounds.findIndex(r => r.id === item.roundId) + 1}` : ''}</small></li>)}</ol> : <p className="muted">Confirmed fixture actions will appear here.</p>}</section>
        </div></div>
        <EvidenceChain view={view} round={round} /><footer>Demo identities · aggregate version {view.version} · {view.sourceMode==='factory'?'authoritative Factory evidence; local review enforcement, not native Factory approval':'server-confirmed fixture state, not live Software Factory data'}</footer>
      </>}
    </div>
  </>;
}

function EvidencePanel({ view, round }: { view: FactoryView; round?: Round }) {
  const snapshot = round?.snapshot ?? view.snapshot;
  return <div className="evidence"><h3>{round ? 'Selected round’s immutable evidence' : 'Saved evidence snapshot'}</h3><p className="small muted">Retrieved {date(snapshot.retrievedAt)} · snapshot {snapshot.id.slice(0, 8)}</p>{snapshot.evidence.map(e => {
    const current = view.work.evidence.find(item => item.id === e.id);
    const permitted = e.permitted && current?.permitted === true;
    return <article key={e.id} className="evidence-card"><div className="section-heading"><h4>{permitted ? e.title : 'Restricted evidence'}</h4><span className="badge">{permitted ? e.provenance&&!e.provenance.revisionId?'Digest-bound':`v${e.version}` : 'Access denied'}</span></div>{permitted ? <><details><summary>Read captured source content</summary><p className="preserve">{e.content}</p></details>{e.sourceRef && <p className="small"><a href={e.sourceRef} target="_blank" rel="noreferrer">{e.provenance?'Inspect authoritative Factory source':'Inspect committed seed source'}</a>{e.provenance?<> · resource {e.provenance.resourceId}{e.provenance.supplemental?' · explicitly configured supplemental demo evidence':''}<br/>Revision {e.provenance.revisionId??'no revision ID exposed; content digest used'} · updated {e.provenance.updatedAt}<br/><code className="digest">{e.provenance.contentDigest}</code></>:<> · local fixture v{e.version}; simulated revisions do not update this Git source.</>}</p>}{!e.complete && <p className="warning-text">Evidence incomplete — server verification may block approval.</p>}</> : <p className="warning-text">You do not have permission to view this evidence. Its contents are hidden.</p>}</article>;
  })}<details><summary>Snapshot fingerprint</summary><code className="digest">{snapshot.digest}</code></details></div>;
}

function isCurrentSignoff(round: Round, id: string, assignmentId: string, generation: number) {
  return round.assignments.some(a => a.id === assignmentId && a.generation === generation)
    && [...round.signoffs].reverse().find(s => s.assignmentId === assignmentId && s.generation === generation)?.id === id;
}

function RoundControls({ view, round, send, blocked }: { view: FactoryView; round: Round; send: Send; blocked: boolean }) {
  const [assignments, setAssignments] = useState<Setup[]>(() => round.assignments.map(({ reviewerId, role, question, responsibility }) => ({ reviewerId, role, question, responsibility })));
  const [maker, setMaker] = useState(round.decisionMakerId);
  const [outcome, setOutcome] = useState<Outcome>('approve');
  const [rationale, setRationale] = useState('');
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [cancelReason, setCancelReason] = useState('');
  const humans = view.principals.filter(p => p.kind === 'human');
  const coordinator = view.principal.kind === 'human' && view.principal.coordinator;
  const decisionMaker = view.principal.kind === 'human' && round.decisionMakerId === view.principal.id;
  const concerns = [
    ...round.feedback.filter(f => f.kind === 'human' && f.disposition === 'request_changes').map(f => ({ id: f.id, text: f.text, actorId: f.actorId, historical: false })),
    ...round.signoffs.filter(s => s.outcome === 'request_changes').map(s => ({ id: s.id, text: s.rationale, actorId: s.actorId, historical: !isCurrentSignoff(round, s.id, s.assignmentId, s.generation) })),
  ];
  const name = (id: string) => view.principals.find(p => p.id === id)?.name ?? (id || 'Not assigned');
  const update = (i: number, patch: Partial<Setup>) => setAssignments(old => old.map((a, index) => index === i ? { ...a, ...patch } : a));
  return <section className="panel"><div className="section-heading"><h2>Review controls</h2><span className="badge">{round.state.replaceAll('_', ' ')}</span></div><p className="small muted">Round {round.id.slice(0, 8)} · snapshot v{round.snapshot.sourceVersion}</p>
    {round.state === 'draft' && (coordinator ? <form onSubmit={e => { e.preventDefault(); void send('configure_round', { decisionMakerId: maker, assignments }, round.id); }}><h3>Set up human review</h3><p className="muted">Choose people explicitly. No reviewers or decision maker are preselected for a new round.</p><label htmlFor="maker">Human decision maker</label><select id="maker" required value={maker} disabled={blocked} onChange={e => setMaker(e.target.value)}><option value="">Choose a human…</option>{humans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      {assignments.map((a, i) => <fieldset key={i} disabled={blocked}><legend>Reviewer {i + 1}</legend><label htmlFor={`reviewer-${i}`}>Human reviewer</label><select id={`reviewer-${i}`} required value={a.reviewerId} onChange={e => update(i, { reviewerId: e.target.value })}><option value="">Choose a human…</option>{humans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><label htmlFor={`role-${i}`}>Review role</label><input id={`role-${i}`} required value={a.role} onChange={e => update(i, { role: e.target.value })} /><label htmlFor={`question-${i}`}>Question to answer</label><textarea id={`question-${i}`} required rows={2} value={a.question} onChange={e => update(i, { question: e.target.value })} /><label htmlFor={`responsibility-${i}`}>Responsibility</label><select id={`responsibility-${i}`} value={a.responsibility} onChange={e => update(i, { responsibility: e.target.value as Setup['responsibility'] })}><option value="advisory">Advisory</option><option value="required">Required human sign-off</option></select><button type="button" className="secondary" onClick={() => setAssignments(old => old.filter((_, index) => index !== i))}>Remove reviewer {i + 1}</button></fieldset>)}
      <div className="actions"><button type="button" className="secondary" disabled={blocked} onClick={() => setAssignments(old => [...old, { reviewerId: '', role: '', question: '', responsibility: 'advisory' }])}>Add human reviewer</button><button disabled={blocked}>Save round setup</button></div><p className="small muted">Publish uses the saved server setup, not unsaved form edits.</p><button type="button" disabled={blocked || !round.decisionMakerId || JSON.stringify(assignments) !== JSON.stringify(round.assignments.map(({ reviewerId, role, question, responsibility }) => ({ reviewerId, role, question, responsibility }))) || maker !== round.decisionMakerId} onClick={() => void send('publish', {}, round.id)}>Publish saved round</button></form> : <p className="muted">The fixture coordinator is setting up this draft round.</p>)}
    {round.state !== 'draft' && <><h3>People & required gates</h3><p>Decision maker: <strong>{name(round.decisionMakerId)}</strong> · human</p>{!round.assignments.length && <p className="muted">No reviewers assigned.</p>}{round.assignments.map(a => {
      const signoff = [...round.signoffs].reverse().find(s => s.assignmentId === a.id && s.generation === a.generation);
      const currentHuman = view.principals.find(p => p.id === a.reviewerId)?.kind === 'human';
      return <article key={`${a.id}:${a.generation}`} className="assignment"><h4>{name(a.reviewerId)} · {currentHuman ? 'human' : 'agent'}</h4><p>{a.role} · <strong>{a.responsibility}</strong></p><p>{a.question}</p>{a.responsibility === 'required' && <p className={signoff?.outcome === 'approve' ? 'success-text' : 'warning-text'}>{signoff ? `Sign-off: ${signoff.outcome.replaceAll('_', ' ')}` : 'Required sign-off pending'}</p>}{round.state === 'open' && a.responsibility === 'required' && currentHuman && a.reviewerId === view.principal.id && <SignoffForm assignment={a} round={round} send={send} blocked={blocked} />}{round.state === 'open' && coordinator && a.responsibility === 'required' && <ReassignForm humans={humans} currentId={a.reviewerId} assignmentId={a.id} roundId={round.id} send={send} blocked={blocked} />}</article>;
    })}</>}
    {round.state === 'open' && decisionMaker && <form className="decision-form" onSubmit={e => { e.preventDefault(); void send('decide', { outcome, rationale, responses }, round.id); }}><h3>Human decision</h3><p className="muted">Approval requires current human sign-offs, addressed human concerns, and source verification. Server errors leave your text intact.</p><OutcomeField id="decision-outcome" value={outcome} setValue={setOutcome} disabled={blocked} /><label htmlFor="decision-rationale">Decision rationale</label><textarea id="decision-rationale" required rows={4} value={rationale} disabled={blocked} onChange={e => setRationale(e.target.value)} />{concerns.map(c => <div className="concern" key={c.id}><h4>Concern Response · {name(c.actorId)}</h4><p className="preserve">{c.text}</p><p className="small muted">Contribution {c.id}{c.historical ? ' · historical / superseded sign-off' : ''}</p><label htmlFor={`concern-${c.id}`}>Response to this concern</label><textarea id={`concern-${c.id}`} rows={3} value={responses[c.id] ?? ''} disabled={blocked} onChange={e => setResponses(old => ({ ...old, [c.id]: e.target.value }))} /></div>)}<button disabled={blocked || !rationale.trim()}>Submit human decision</button></form>}
    {round.state === 'open' && coordinator && <ReassignForm humans={humans} currentId={round.decisionMakerId} roundId={round.id} send={send} blocked={blocked} />}
    {(round.state === 'open' || round.state === 'draft') && coordinator && <details className="cancel"><summary>Cancel this round</summary><form onSubmit={e => { e.preventDefault(); if (window.confirm('Cancel this review round? Its history will remain available.')) void send('cancel', { reason: cancelReason }, round.id); }}><label htmlFor="cancel-reason">Cancellation reason</label><textarea id="cancel-reason" required rows={2} value={cancelReason} disabled={blocked} onChange={e => setCancelReason(e.target.value)} /><button className="secondary" disabled={blocked || !cancelReason.trim()}>Cancel round…</button></form></details>}
    {!['draft', 'open'].includes(round.state) && <p className="muted">Closed round — preserved for reference. Start a new round to review again.</p>}
  </section>;
}

function OutcomeField({ id, value, setValue, disabled }: { id: string; value: Outcome; setValue: (value: Outcome) => void; disabled: boolean }) {
  return <><label htmlFor={id}>Outcome</label><select id={id} value={value} disabled={disabled} onChange={e => setValue(e.target.value as Outcome)}><option value="approve">Approve</option><option value="request_changes">Request changes</option></select></>;
}

function SignoffForm({ assignment, round, send, blocked }: { assignment: Assignment; round: Round; send: Send; blocked: boolean }) {
  const [outcome, setOutcome] = useState<Outcome>('approve');
  const [rationale, setRationale] = useState('');
  return <form onSubmit={e => { e.preventDefault(); void send('signoff', { assignmentId: assignment.id, outcome, rationale }, round.id); }}><h4>Your required human sign-off</h4><OutcomeField id={`outcome-${assignment.id}`} value={outcome} setValue={setOutcome} disabled={blocked} /><label htmlFor={`rationale-${assignment.id}`}>Sign-off rationale</label><textarea id={`rationale-${assignment.id}`} rows={3} required value={rationale} disabled={blocked} onChange={e => setRationale(e.target.value)} /><button disabled={blocked || !rationale.trim()}>Submit sign-off</button></form>;
}

function ReassignForm({ humans, currentId, assignmentId, roundId, send, blocked }: { humans: FactoryView['principals']; currentId: string; assignmentId?: string; roundId: string; send: Send; blocked: boolean }) {
  const [replacement, setReplacement] = useState('');
  const [reason, setReason] = useState('');
  const id = assignmentId ?? 'decision-maker';
  return <details className="reassign"><summary>Reassign {assignmentId ? 'required reviewer' : 'human decision maker'}</summary><form onSubmit={e => { e.preventDefault(); void send('reassign', assignmentId ? { assignmentId, reviewerId: replacement, reason } : { decisionMakerId: replacement, reason }, roundId); }}><p className="small muted">{assignmentId ? 'Required responsibility is preserved; prior sign-offs remain in history.' : 'Only another human can become decision maker.'}</p><label htmlFor={`replacement-${id}`}>Replacement human</label><select id={`replacement-${id}`} required value={replacement} disabled={blocked} onChange={e => setReplacement(e.target.value)}><option value="">Choose a human…</option>{humans.filter(p => p.id !== currentId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><label htmlFor={`reason-${id}`}>Reassignment reason</label><textarea id={`reason-${id}`} required rows={2} value={reason} disabled={blocked} onChange={e => setReason(e.target.value)} /><button disabled={blocked || !replacement || !reason.trim()}>Confirm reassignment</button></form></details>;
}

function Contributions({ view, round }: { view: FactoryView; round: Round }) {
  const actor = (id: string) => { const p = view.principals.find(p => p.id === id); return `${p?.name ?? id} · ${p?.kind ?? 'unknown actor'}`; };
  return <section className="panel"><h2>Round contributions</h2>{!round.feedback.length && !round.signoffs.length && <p className="muted">No contributions yet.</p>}{round.feedback.map(f => <article className="contribution" key={f.id} id={`contribution-${f.id}`}><h3>{f.disposition.replaceAll('_', ' ')} <span className="badge">{f.kind === 'agent' ? 'Agent advice only' : 'Human feedback'}</span></h3><p className="preserve">{f.text}</p><small>{actor(f.actorId)} · {date(f.createdAt)} · snapshot {f.snapshotId.slice(0, 8)}</small></article>)}{round.signoffs.map(s => <article className="contribution" key={s.id}><h3>Human sign-off · {s.outcome.replaceAll('_', ' ')}</h3>{!isCurrentSignoff(round, s.id, s.assignmentId, s.generation) && <span className="badge">Historical / superseded</span>}<p className="preserve">{s.rationale}</p><small>{actor(s.actorId)} · generation {s.generation} · {date(s.createdAt)}</small></article>)}{round.decision && <article className="contribution decision" id="recorded-decision"><h3>Human decision · {round.decision.outcome.replaceAll('_', ' ')}</h3><p className="preserve">{round.decision.rationale}</p><small>{actor(round.decision.actorId)} · {date(round.decision.createdAt)}</small>{Object.entries(round.decision.responses).map(([id, text]) => <div key={id}><h4>Concern Response · {id}</h4><p className="preserve">{text}</p></div>)}{round.decision.verifiedAt && <p className="small">Evidence verified {date(round.decision.verifiedAt)}</p>}</article>}</section>;
}
