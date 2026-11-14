import type { DriftSnapshot } from './contracts';

function record(value: unknown): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid evidence object.');
 return value as Record<string, unknown>;
}
function text(value: unknown, required = false): asserts value is string {
 if (typeof value !== 'string' || (required && !value.trim())) throw new Error('Invalid evidence text.');
}
function list(value: unknown): unknown[] {
 if (!Array.isArray(value)) throw new Error('Invalid evidence list.');
 return value;
}
function choice(value: unknown, options: readonly unknown[]) {
 if (!options.includes(value)) throw new Error('Invalid evidence classification.');
}
function timestamp(value: unknown) {
 text(value, true);
 if (!Number.isFinite(Date.parse(value))) throw new Error('Invalid evidence timestamp.');
}
function unique(value: unknown, seen: Set<string>) {
 text(value, true);
 if (seen.has(value)) throw new Error(`Duplicate evidence ID: ${value}`);
 seen.add(value);
}

/** Validate the whole trust boundary, including literal citation associations. */
export function validateSnapshot(input: unknown): DriftSnapshot {
 const snapshot = record(input);
 if (snapshot.schemaVersion !== 1) throw new Error('Unsupported evidence schema.');
 text(snapshot.id, true); timestamp(snapshot.capturedAt);
 text(snapshot.title, true); text(snapshot.coverage);
 list(snapshot.limitations).forEach(value => text(value));
 const sourceIds = new Set<string>(), reviewIds = new Set<string>(), findingIds = new Set<string>(), roles = new Set<string>();
 const sources = new Map<string, Record<string, unknown>>();
 for (const value of list(snapshot.sources)) {
  const source = record(value); unique(source.id, sourceIds);
  for (const field of ['type', 'title']) text(source[field], true);
  for (const field of ['excerpt', 'content', 'note']) text(source[field]);
  for (const field of ['url', 'revision', 'digest']) if (source[field] !== null) text(source[field]);
  timestamp(source.retrievedAt);
  choice(source.access, ['available', 'unavailable']); choice(source.completeness, ['complete', 'excerpt', 'unknown']);
  sources.set(source.id as string, source);
 }
 for (const value of list(snapshot.reviews)) {
  const review = record(value); unique(review.id, reviewIds);
  choice(review.role, ['intent', 'delivery', 'skeptic']); unique(review.role, roles);
  if (review.snapshotId !== snapshot.id) throw new Error('Review belongs to a different snapshot.');
  choice(review.mode, ['recorded agent review']); timestamp(review.reviewedAt);
  text(review.name, true); text(review.summary); text(review.dissent);
  for (const value of list(review.findings)) {
   const finding = record(value); unique(finding.id, findingIds);
   for (const field of ['title', 'claim', 'uncertainty', 'correction']) text(finding[field], true);
   choice(finding.kind, ['conflict', 'gap', 'caution', 'alignment']); choice(finding.confidence, ['high', 'medium', 'low']);
   const citations = list(finding.citations);
   if (!citations.length) throw new Error('Finding has no citations.');
   for (const value of citations) {
    const citation = record(value); text(citation.sourceId, true); text(citation.quote, true);
    const source = sources.get(citation.sourceId);
    if (!source || source.access !== 'available' || !(source.content as string).includes(citation.quote)) {
     throw new Error(`Unverifiable literal citation: ${citation.sourceId}`);
    }
   }
  }
 }
 return input as DriftSnapshot;
}
