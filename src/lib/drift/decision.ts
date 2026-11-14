import type { DriftDecision, DriftFinding, DriftReview, DriftSnapshot } from './contracts';
import { validateSnapshot } from './validate';

const key = (id: string) => `drift-room:decision:${id}`;
function checkRationale(value: unknown): asserts value is string {
 if (typeof value !== 'string' || !value.trim() || value.length > 2000) throw new Error('Enter a rationale of 1–2000 characters.');
}
function recordedFinding(snapshot: DriftSnapshot, reviewerId: string, findingId: string) {
 const review = snapshot.reviews.find(item => item.id === reviewerId);
 const finding = review?.findings.find(item => item.id === findingId);
 if (!review || !finding) throw new Error('The selected finding is not in this recorded review.');
 return { review, finding };
}
export function saveDecision(snapshot: DriftSnapshot, review: DriftReview, finding: DriftFinding, rationale: string): DriftDecision {
 validateSnapshot(snapshot); checkRationale(rationale);
 const recorded = recordedFinding(snapshot, review.id, finding.id);
 if (JSON.stringify(recorded.review) !== JSON.stringify(review) || JSON.stringify(recorded.finding) !== JSON.stringify(finding)) {
  throw new Error('Selection differs from the recorded snapshot.');
 }
 const decision: DriftDecision = {
  schemaVersion: 1, snapshotId: snapshot.id, reviewerId: review.id, findingId: finding.id,
  correction: recorded.finding.correction, rationale: rationale.trim(), selectedAt: new Date().toISOString(),
  snapshot: structuredClone(snapshot),
 };
 window.localStorage.setItem(key(snapshot.id), JSON.stringify(decision));
 return decision;
}
export function readDecision(snapshot: DriftSnapshot): DriftDecision | null {
 validateSnapshot(snapshot);
 const raw = window.localStorage.getItem(key(snapshot.id));
 if (raw === null) return null;
 const saved = JSON.parse(raw) as DriftDecision;
 if (!saved || saved.schemaVersion !== 1 || saved.snapshotId !== snapshot.id) throw new Error('Invalid saved selection.');
 validateSnapshot(saved.snapshot); checkRationale(saved.rationale);
 if (JSON.stringify(saved.snapshot) !== JSON.stringify(snapshot)) throw new Error('Saved selection belongs to different evidence.');
 const { finding } = recordedFinding(snapshot, saved.reviewerId, saved.findingId);
 if (saved.correction !== finding.correction || typeof saved.selectedAt !== 'string' || !Number.isFinite(Date.parse(saved.selectedAt))) {
  throw new Error('Invalid saved selection details.');
 }
 return saved;
}
