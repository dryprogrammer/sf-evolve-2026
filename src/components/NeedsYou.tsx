import type { FactoryView } from '@/lib/contracts';
import { obligation } from '@/lib/attention';
import './handoff.css';
export default function NeedsYou({ view, onAction }: { view: FactoryView; onAction: (target: string) => void }) {
 const item = obligation(view);
 return <section className={`needs-you ${item.state}`} aria-label="Human attention obligation"><div className="attention-heading"><span aria-hidden="true">{item.state === 'resolved' ? '✓' : '!'}</span><p>{item.state === 'resolved' ? 'Resolved for this revision' : 'Needs you'}</p><small>Confirmed fixture review state</small></div><h2>{item.title}</h2><p><strong>Why:</strong> {item.why}</p><p><strong>Who:</strong> {item.owner}</p><p><strong>Evidence:</strong> {view.work.id} · source v{view.work.sourceVersion}{view.rounds.at(-1) && ` · reviewed v${view.rounds.at(-1)!.snapshot.sourceVersion}`} · immutable snapshots and attributed contributions.</p><button aria-label={`Resolve obligation: ${item.title}`} onClick={() => onAction(item.target)}>{item.action} <span aria-hidden="true">→</span></button><p className="attention-boundary">Fictional selectable personas; a solo operator is not independent multi-person approval. This is a review obligation, not a paused agent or Start work gate.</p></section>;
}
