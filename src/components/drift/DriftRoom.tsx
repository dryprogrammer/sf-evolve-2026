'use client';

import { useEffect, useRef, useState } from 'react';
import type { DriftDecision, DriftFinding, DriftReview, DriftSnapshot, DriftSource, ReviewerRole } from '@/lib/drift/contracts';
import { readDecision, saveDecision } from '@/lib/drift/decision';
import FactoryScene, { type NavigationRequest } from '@/components/factory/FactoryScene';
import { DRIFT_STATIONS, type StationId } from '@/components/factory/world';
import { validateSnapshot } from '@/lib/drift/validate';
import styles from './DriftRoom.module.css';

const stations: { role: ReviewerRole; number: string; title: string; question: string }[] = [
 { role: 'intent', number: '01', title: 'Intent', question: 'What did we mean to build?' },
 { role: 'delivery', number: '02', title: 'Delivery', question: 'What did we actually ship?' },
 { role: 'skeptic', number: '03', title: 'Skeptic', question: 'What can’t we conclude?' },
];
function Stamp({ value }: { value: string }) { return <time dateTime={value}>{value}</time>; }
function PixelPerson({ role }: { role: ReviewerRole }) { return <span className={`${styles.person} ${styles[role]}`} aria-hidden="true"><i/><i/><i/><i/><i/></span>; }
function errorMessage(error: unknown) { return error instanceof Error ? error.message : 'An unexpected error occurred.'; }

export default function DriftRoom() {
 const [snapshot, setSnapshot] = useState<DriftSnapshot | null>(null);
 const [loading, setLoading] = useState(true), [error, setError] = useState('');
 const [role, setRole] = useState<ReviewerRole>('intent');
 const [findingId, setFindingId] = useState<string | null>(null);
 const [source, setSource] = useState<DriftSource | null>(null);
 const [decision, setDecision] = useState<DriftDecision | null>(null);
 const [rationale, setRationale] = useState(''), [decisionMessage, setDecisionMessage] = useState('');
 const [walkRequest, setWalkRequest] = useState<NavigationRequest | null>(null);
 const [nearby, setNearby] = useState<StationId | null>(null);
 const [retry, setRetry] = useState(0);
 const inspector = useRef<HTMLElement>(null), dialog = useRef<HTMLDialogElement>(null);
 const sourceTrigger = useRef<HTMLElement | null>(null);
 useEffect(() => {
  const controller = new AbortController();
  setLoading(true); setError(''); setSnapshot(null); setDecision(null); setDecisionMessage(''); setSource(null);
  (async () => {
   try {
    const response = await fetch('/api/drift', { signal: controller.signal, cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `Evidence request failed (${response.status}).`);
    const next = validateSnapshot(payload);
    if (controller.signal.aborted) return;
    setSnapshot(next);
    const first = next.reviews.find(review => review.role === 'intent') ?? next.reviews[0];
    setRole(first?.role ?? 'intent'); setFindingId(first?.findings[0]?.id ?? null); setRationale('');
    try { setDecision(readDecision(next)); }
    catch (storageError) { setDecisionMessage(`Local decision could not be restored: ${errorMessage(storageError)}`); }
   } catch (requestError) { if (!controller.signal.aborted) setError(errorMessage(requestError)); }
   finally { if (!controller.signal.aborted) setLoading(false); }
  })();
  return () => controller.abort();
 }, [retry]);
 useEffect(() => {
  const element = dialog.current;
  if (source && !element?.open) element?.showModal();
  if (!source && element?.open) element.close();
 }, [source]);
 const review = snapshot?.reviews.find(item => item.role === role);
 const finding = review?.findings.find(item => item.id === findingId);
 const cited = new Set(finding?.citations.map(citation => citation.sourceId) ?? []);
 function select(review: DriftReview, finding?: DriftFinding) {
  setRole(review.role); setFindingId(finding?.id ?? review.findings[0]?.id ?? null); setRationale('');
  requestAnimationFrame(() => inspector.current?.focus());
 }
 function openSource(item: DriftSource, trigger: HTMLElement) { sourceTrigger.current = trigger; setSource(item); }
 function closeSource() { setSource(null); requestAnimationFrame(() => sourceTrigger.current?.focus()); }
 return <div className={styles.room}>
  <a className={styles.skip} href="#drift-inspector">Skip to finding inspector</a>
  <header className={styles.header}><a href="/drift-room" className={styles.brand}><span className={styles.mark} aria-hidden="true">▦</span> Software Factory</a><span className={styles.project}>learn sf / Drift Room</span><span className={styles.recorded}>RECORDED REVIEW · NOT LIVE</span></header>
  <main className={styles.main}>
   <div className={styles.heading}><div><p className={styles.eyebrow}>THE COUNCIL ROOM / EVIDENCE BEFORE ACTION</p><h1>One snapshot.<br/><span>Three perspectives.</span></h1><p className={styles.intro}>Put intent and delivery on the same table. Inspect the disagreement, then choose what should change.</p></div><div className={styles.boundary}><span className={styles.light} aria-hidden="true"/><strong>No live agents in this room.</strong><p>These are recorded reviews. A selected correction is a local decision, not a repair or a Factory edit.</p><span>Live challenges unavailable · no runtime agent endpoint</span></div></div>
   {loading && <section className={styles.load} role="status"><span className={styles.eyebrow}>COLLECTED EVIDENCE</span><h2>Opening the evidence room…</h2><p>Waiting for the server snapshot. No findings are inferred while loading.</p></section>}
   {error && <section className={styles.load} role="alert"><h2>Evidence unavailable</h2><p>{error}</p><p>Coverage unknown. No review can be shown without a snapshot.</p><button onClick={() => setRetry(value => value + 1)}>Retry evidence request</button></section>}
   {snapshot && <>
    <section className={styles.snapshot} aria-label="Snapshot provenance"><div><span className={styles.eyebrow}>PRESERVED SNAPSHOT</span><h2>{snapshot.title}</h2><code>{snapshot.id}</code><p>Captured <Stamp value={snapshot.capturedAt}/></p></div><div><strong>Coverage</strong><p>{snapshot.coverage || 'Unknown — no coverage statement supplied.'}</p><small>Anything not represented in these sources is unknown. Digests are local fingerprints, not authoritative revisions.</small></div></section>
    <section className={styles.spriteRoom} aria-label="Recorded reviewer floor">
     <div className={styles.sectionTitle}><h2>Walk the Drift Room</h2><span>LOCAL MOVEMENT · RECORDED FINDINGS</span></div>
     <FactoryScene drift view={null} request={walkRequest} onNearby={setNearby} paused={!!source}
      onInspect={id => { const index = DRIFT_STATIONS.findIndex(station => station.id === id); const item = snapshot.reviews.find(item => item.role === stations[index]?.role); if (item) select(item); }}/>
     <div className={styles.walkButtons}>{DRIFT_STATIONS.map((station, index) => <button key={station.id} disabled={!snapshot.reviews.some(item => item.role === stations[index].role)} onClick={() => setWalkRequest({ id:station.id, nonce:Date.now() })}>Walk to {station.title}</button>)}<button onClick={() => { const first = snapshot.reviews.find(item => item.role === 'intent'); if(first) select(first); }}>Replay recorded review</button></div>
     <p>{nearby ? `${DRIFT_STATIONS.find(item => item.id === nearby)?.title} nearby — press E to inspect.` : 'Walk to a reviewer, or use the direct reviewer buttons below.'} Movement is presentation, not live agent activity.</p>
    </section>
    <div className={styles.workroom}>
     <section className={styles.council} aria-label="Reviewer council">
      <div className={styles.sectionTitle}><h2>Reviewer stations</h2><span>DIRECT NAVIGATION · KEYBOARD READY</span></div>
      <nav className={styles.stations} aria-label="Reviewer stations">{stations.map(station => {
       const stationReview = snapshot.reviews.find(item => item.role === station.role);
       const conflicts = stationReview?.findings.filter(item => item.kind === 'conflict').length ?? 0;
       return <button key={station.role} aria-label={station.role === 'skeptic' ? 'Skeptic' : `${station.title} reviewer`} className={`${styles.station} ${role === station.role ? styles.active : ''}`} aria-pressed={role === station.role} disabled={!stationReview} onClick={() => stationReview && select(stationReview)}>
        <span className={styles.stationTop}><span>{station.number} / REVIEW STATION</span><span>{stationReview ? `${stationReview.findings.length} finding${stationReview.findings.length === 1 ? '' : 's'}` : 'Unavailable'}</span></span><PixelPerson role={station.role}/><strong>{station.title}</strong><span className={styles.question}>{station.question}</span><span className={styles.reviewer}>{stationReview?.name ?? 'No recorded reviewer'}</span>{conflicts > 0 && <span className={styles.conflictCount}>{conflicts} conflict{conflicts === 1 ? '' : 's'}</span>}
       </button>;
      })}</nav>
      <section className={styles.evidenceMap} aria-label="Evidence map"><div className={styles.sectionTitle}><h2>Shared evidence table</h2><span>{snapshot.sources.length} SOURCES</span></div><p className={styles.mapNote}>Highlighted sources are cited by the selected finding. Open a source to inspect the full collected content.</p><div className={styles.mapCore}><span aria-hidden="true">▦</span><strong>{finding ? `${finding.citations.length} citations on the table` : 'No finding selected'}</strong><small>{finding?.kind === 'conflict' ? 'CONFLICT · INSPECT BOTH SIDES' : 'ONE PRESERVED SNAPSHOT · NO LIVE FEED'}</small></div><div className={styles.sourceGrid}>{snapshot.sources.map(item => <button className={`${styles.sourceNode} ${cited.has(item.id) ? styles.cited : ''}`} key={item.id} onClick={event => openSource(item, event.currentTarget)}><span className={styles.sourceType}>{item.type} {cited.has(item.id) ? '· CITED' : ''}</span><strong>{item.title}</strong><span>{item.access} · {item.completeness}</span><span className={styles.sourceOpen}>Inspect source ↗</span></button>)}</div>{snapshot.sources.length === 0 && <p>No sources collected. Coverage unknown.</p>}</section>
      <section className={styles.limitations}><h2>Limits of this room</h2>{snapshot.limitations.length ? <ul>{snapshot.limitations.map((limit, index) => <li key={index}>{limit}</li>)}</ul> : <p>No limitations supplied. This does not establish complete coverage.</p>}<details><summary>Exact recorded review timestamps</summary>{snapshot.reviews.map(item => <div key={item.id} className={styles.reviewStamp}><strong>{item.role} · {item.name}</strong><p>{item.mode} · <Stamp value={item.reviewedAt}/></p><code>{item.snapshotId}</code></div>)}</details></section>
     </section>
     <section id="drift-inspector" className={styles.inspector} ref={inspector} tabIndex={-1} aria-label="Finding inspector">
      <div className={styles.sectionTitle}><h2>Finding inspector</h2><span>{role.toUpperCase()} / RECORDED</span></div>
      {review ? <><h3 className={styles.reviewName}>{review.name}</h3><p className={styles.summary}>{review.summary}</p><p className={styles.timestamp}>Reviewed <Stamp value={review.reviewedAt}/></p><div className={styles.findings} aria-label="Recorded findings">{review.findings.map(item => <button key={item.id} className={`${styles.findingButton} ${item.id === findingId ? styles.selectedFinding : ''} ${item.kind === 'conflict' ? styles.conflict : ''}`} aria-pressed={item.id === findingId} onClick={() => select(review, item)}><span>{item.kind} · {item.confidence} confidence</span><strong>{item.title}</strong><span aria-hidden="true">→</span></button>)}</div>
       {finding ? <article className={styles.findingDetail}><p className={`${styles.tag} ${finding.kind === 'conflict' ? styles.redTag : ''}`}>{finding.kind} · {finding.confidence} confidence</p><h3>{finding.title}</h3><p className={styles.claim}>{finding.claim}</p><h4>Literal cited evidence</h4>{finding.citations.map((citation, index) => { const item = snapshot.sources.find(candidate => candidate.id === citation.sourceId); const verified = item?.access === 'available' && !!citation.quote && item.content.includes(citation.quote); return <div className={styles.citation} key={`${citation.sourceId}-${index}`}><blockquote>{citation.quote}</blockquote><small>{verified ? 'Literal quote found in collected content' : 'Quote not verifiable against available collected content'}</small>{item ? <button onClick={event => openSource(item, event.currentTarget)}>{item.title} ↗</button> : <p>Source unavailable: {citation.sourceId}</p>}</div>; })}{finding.citations.length === 0 && <p>No citations supplied. Treat this claim as unverified.</p>}<div className={styles.uncertainty}><h4>Uncertainty</h4><p>{finding.uncertainty || 'No uncertainty statement supplied; certainty is not established.'}</p></div><h4>Proposed correction</h4><p className={styles.correction}>{finding.correction || 'No correction proposed.'}</p><form className={styles.decisionForm} onSubmit={event => { event.preventDefault(); try { const saved = saveDecision(snapshot, review, finding, rationale); setDecision(saved); setDecisionMessage('Correction selected and saved locally. No sources were changed.'); } catch (saveError) { setDecisionMessage(`Decision not saved: ${errorMessage(saveError)}`); } }}><label htmlFor="drift-rationale">Why select this correction?</label><textarea id="drift-rationale" value={rationale} onChange={event => setRationale(event.target.value)} placeholder="Explain your reasoning and any unresolved uncertainty…" required maxLength={2000}/><button disabled={!rationale.trim() || !finding.correction.trim()} type="submit">Select proposed correction <span aria-hidden="true">→</span></button><small>Stored in this browser with the full snapshot. This replaces your previous local selection for this snapshot. Not a repair, approval, or Factory edit.</small></form></article> : <p>No recorded findings at this station. Absence of findings does not establish alignment.</p>}
       <div className={styles.dissent}><h4>Reviewer dissent</h4><p>{review.dissent || 'No dissent statement supplied.'}</p></div>
      </> : <p>No recorded review for this station. Coverage unknown.</p>}
      <p className={styles.decisionMessage} role="status" aria-live="polite">{decisionMessage}</p>
      {decision && <section className={styles.saved}><span className={styles.eyebrow}>LOCAL SELECTION · NOT REPAIRED</span><h3>Selected correction</h3><p>{decision.correction}</p><h4>Your rationale</h4><p>{decision.rationale}</p><small>Finding {decision.findingId} · reviewer {decision.reviewerId}<br/>Selected <Stamp value={decision.selectedAt}/></small></section>}
     </section>
    </div>
   </>}
   <footer className={styles.footer}><span>SOFTWARE FACTORY / DRIFT ROOM</span><p>Inspect → decide locally → take action separately. Nothing here silently changes your project.</p></footer>
  </main>
  <dialog className={styles.sourceDialog} ref={dialog} aria-labelledby="drift-source-title" onCancel={event => { event.preventDefault(); closeSource(); }} onClose={() => { if (source) closeSource(); }} onKeyDown={event => {
   if (event.key !== 'Tab') return;
   const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button, a[href], summary, [tabindex]')).filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0);
   const first = controls[0], last = controls.at(-1);
   if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
   else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }}>
   {source && <><div className={styles.dialogHeader}><div><p className={styles.eyebrow}>SOURCE DRILLDOWN / {source.type}</p><h2 id="drift-source-title">{source.title}</h2></div><button autoFocus onClick={closeSource} aria-label="Close source drilldown">×</button></div><div className={styles.dialogBody}><dl className={styles.provenance}><dt>Source ID</dt><dd>{source.id}</dd><dt>Source URL</dt><dd>{source.url && /^https?:\/\//i.test(source.url) ? <a href={source.url} target="_blank" rel="noreferrer">{source.url} ↗</a> : source.url || 'Not supplied'}</dd><dt>Revision</dt><dd>{source.revision ?? 'Unknown / not exposed'}</dd><dt>Content digest</dt><dd>{source.digest ?? 'Not supplied'}<small>Local fingerprint, not an authoritative revision.</small></dd><dt>Retrieved at</dt><dd><Stamp value={source.retrievedAt}/></dd><dt>Access</dt><dd>{source.access}</dd><dt>Completeness</dt><dd>{source.completeness}</dd><dt>Collection note</dt><dd>{source.note || 'No collection note supplied.'}</dd></dl><h3>Collected excerpt</h3><p className={styles.content}>{source.excerpt || 'No excerpt supplied.'}</p><h3>Full collected content</h3><p className={styles.mapNote}>“Full” means everything collected in this snapshot; it does not imply the upstream source is complete.</p>{source.access === 'available' ? <pre className={styles.content} tabIndex={0}>{source.content || 'No content collected.'}</pre> : <p>Source unavailable. Full content cannot be inspected.</p>}</div></>}
  </dialog>
 </div>;
}
