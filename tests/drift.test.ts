import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DriftSnapshot } from '../src/lib/drift/contracts';
import { validateSnapshot } from '../src/lib/drift/validate';
import { readDecision, saveDecision } from '../src/lib/drift/decision';

// Synthetic evidence only. These tests exercise real validation/decision code,
// not Factory collection, authoritative revisions, or project drift findings.
function fixture(): DriftSnapshot {
 const id = 'synthetic-drift-snapshot';
 return {
  schemaVersion: 1, id, capturedAt: '2026-11-14T21:00:00.000Z',
  title: 'Synthetic verification snapshot', coverage: 'Two synthetic documents only.',
  limitations: ['Test data, not project evidence; other coverage is unknown.'],
  sources: [
   { id: 'intent-source', type: 'requirement', title: 'Synthetic intent', url: null,
    excerpt: 'A rationale is required.', content: 'A rationale is required. Retain uncertainty.',
    retrievedAt: '2026-11-14T20:58:00.000Z', revision: null, digest: 'local-fingerprint-only',
    completeness: 'complete', access: 'available', note: 'Synthetic test document.' },
   { id: 'delivery-source', type: 'repository', title: 'Synthetic delivery', url: null,
    excerpt: 'A rationale is optional.', content: 'A rationale is optional. This is a bounded observation.',
    retrievedAt: '2026-11-14T20:59:00.000Z', revision: 'synthetic-revision', digest: null,
    completeness: 'excerpt', access: 'available', note: 'Synthetic partial observation.' },
  ],
  reviews: (['intent', 'delivery', 'skeptic'] as const).map(role => ({
   id: `${role}-review`, role, name: `Synthetic ${role} reviewer`, mode: 'recorded agent review',
   snapshotId: id, reviewedAt: '2026-11-14T21:01:00.000Z',
   summary: 'Recorded synthetic comparison, not live analysis.', dissent: 'Other corrections remain possible.',
   findings: [{ id: `${role}-finding`, title: `Synthetic ${role} discrepancy`,
    claim: 'The two synthetic documents differ on rationale requirements.', kind: 'conflict', confidence: 'medium',
    citations: [{ sourceId: 'intent-source', quote: 'A rationale is required.' },
     { sourceId: 'delivery-source', quote: 'A rationale is optional.' }],
    uncertainty: 'No claims beyond these synthetic documents.', correction: 'Require a rationale.' }],
  })),
 };
}

function finding(snapshot: DriftSnapshot) { return snapshot.reviews[0].findings[0]; }

describe('Drift validation — synthetic input, real validator', () => {
 it('accepts a frozen v1 snapshot without discarding provenance, uncertainty, or dissent', () => {
  const snapshot = fixture();
  expect(validateSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
 });
 it.each([null, undefined, true, 42, 'snapshot', [], {}])('rejects non-snapshot input %j', input => {
  expect(() => validateSnapshot(input)).toThrow();
 });
 it.each(['schemaVersion', 'id', 'capturedAt', 'sources', 'reviews'])('rejects a missing %s', field => {
  const input = { ...fixture() } as Record<string, unknown>;
  delete input[field];
  expect(() => validateSnapshot(input)).toThrow();
 });
 it('rejects a different schema version', () => {
  expect(() => validateSnapshot({ ...fixture(), schemaVersion: 2 })).toThrow();
 });
 it('rejects duplicate source IDs', () => {
  const snapshot = fixture(); snapshot.sources[1].id = snapshot.sources[0].id;
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects duplicate reviewer IDs', () => {
  const snapshot = fixture(); snapshot.reviews[1].id = snapshot.reviews[0].id;
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects duplicate finding IDs within a review', () => {
  const snapshot = fixture(); snapshot.reviews[0].findings.push(structuredClone(finding(snapshot)));
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects duplicate finding IDs across reviews', () => {
  const snapshot = fixture(); snapshot.reviews[1].findings[0].id = finding(snapshot).id;
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects a review bound to another snapshot', () => {
  const snapshot = fixture(); snapshot.reviews[0].snapshotId = 'another-snapshot';
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects an unknown citation source', () => {
  const snapshot = fixture(); finding(snapshot).citations[0].sourceId = 'uncollected-source';
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects a quote associated with the wrong existing source', () => {
  const snapshot = fixture(); finding(snapshot).citations[0].sourceId = 'delivery-source';
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it.each(['Invented evidence.', 'A RATIONALE IS REQUIRED.', 'A rationale is required…', ''])('rejects nonliteral or empty quote %j', quote => {
  const snapshot = fixture(); finding(snapshot).citations[0].quote = quote;
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('accepts a literal substring of available collected content even when absent from the excerpt', () => {
  const snapshot = fixture(); snapshot.sources[0].excerpt = 'A different bounded excerpt.';
  snapshot.reviews.forEach(review => { review.findings[0].citations[0].quote = 'Retain uncertainty.'; });
  expect(validateSnapshot(snapshot)).toEqual(snapshot);
 });
 it('rejects a quote present only in the excerpt, not collected content', () => {
  const snapshot = fixture(); snapshot.sources[0].content = 'Different collected content.';
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects a finding without citations', () => {
  const snapshot = fixture(); finding(snapshot).citations = [];
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects a cited inaccessible source even when its stale content contains the quote', () => {
  const snapshot = fixture(); snapshot.sources[0].access = 'unavailable';
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('retains inaccessible uncited evidence with unknown completeness', () => {
  const snapshot = fixture();
  snapshot.sources.push({ ...snapshot.sources[0], id: 'unavailable-source', access: 'unavailable',
   completeness: 'unknown', excerpt: '', content: '', revision: null, digest: null, note: 'Access unavailable.' });
  expect(validateSnapshot(snapshot)).toEqual(snapshot);
 });
 it('does not fabricate findings when evidence or recorded reviews are missing', () => {
  const snapshot = fixture(); snapshot.sources = []; snapshot.reviews = [];
  snapshot.coverage = 'Unknown: no evidence collected.';
  const result = validateSnapshot(snapshot);
  expect(result.sources).toEqual([]); expect(result.reviews).toEqual([]);
 });
 it('keeps a digest-only source revision unknown and preserves an exposed revision separately', () => {
  const result = validateSnapshot(fixture());
  expect(result.sources[0].revision).toBeNull();
  expect(result.sources[0].digest).toBe('local-fingerprint-only');
  expect(result.sources[1].revision).toBe('synthetic-revision');
  expect(result.sources[1].digest).toBeNull();
 });
});

describe('Drift decisions — mocked browser storage, real decision functions', () => {
 let storage: { getItem: ReturnType<typeof vi.fn>; setItem: ReturnType<typeof vi.fn> };
 let values: Map<string, string>;
 beforeEach(() => {
  values = new Map();
  storage = { getItem: vi.fn((key: string) => values.get(key) ?? null),
   setItem: vi.fn((key: string, value: string) => { values.set(key, value); }) };
  vi.stubGlobal('window', { localStorage: storage });
 });
 afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
 it('returns null when no decision exists for this snapshot', () => {
  const snapshot = fixture(); expect(readDecision(snapshot)).toBeNull();
  expect(storage.getItem).toHaveBeenCalledWith(`drift-room:decision:${snapshot.id}`);
 });
 it('persists the complete snapshot under the exact namespaced key and restores it', () => {
  const snapshot = fixture(), review = snapshot.reviews[0], item = finding(snapshot);
  const before = structuredClone(snapshot);
  const decision = saveDecision(snapshot, review, item, 'Keep the requirement and verify the remaining scope.');
  expect(decision).toMatchObject({ schemaVersion: 1, snapshotId: snapshot.id, reviewerId: review.id,
   findingId: item.id, correction: item.correction,
   rationale: 'Keep the requirement and verify the remaining scope.', snapshot: before });
  expect(Number.isNaN(Date.parse(decision.selectedAt))).toBe(false);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  expect(storage.setItem).toHaveBeenCalledWith(`drift-room:decision:${snapshot.id}`, JSON.stringify(decision));
  expect(readDecision(snapshot)).toEqual(decision);
  expect(snapshot).toEqual(before);
  snapshot.sources[0].content = 'Later in-memory mutation';
  expect(JSON.parse(values.get(`drift-room:decision:${snapshot.id}`)!).snapshot).toEqual(before);
 });
 it('replaces the local selection for one snapshot without overwriting another snapshot', () => {
  const first = fixture(); saveDecision(first, first.reviews[0], finding(first), 'First rationale.');
  const second = fixture(); second.id = 'second-synthetic-snapshot';
  second.reviews.forEach(review => { review.snapshotId = second.id; });
  const other = saveDecision(second, second.reviews[0], finding(second), 'Another snapshot.');
  const latest = saveDecision(first, first.reviews[1], first.reviews[1].findings[0], 'Changed local selection.');
  expect(readDecision(first)).toEqual(latest); expect(readDecision(second)).toEqual(other);
  expect(values.size).toBe(2);
 });
 it.each([
  { label: 'empty', rationale: '' }, { label: 'spaces', rationale: ' ' },
  { label: 'whitespace', rationale: '\n\t' }, { label: '2001 characters', rationale: 'x'.repeat(2001) },
 ])('rejects $label rationale without writing', ({ rationale }) => {
  const snapshot = fixture();
  expect(() => saveDecision(snapshot, snapshot.reviews[0], finding(snapshot), rationale)).toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
 });
 it('accepts a rationale at the 2000-character boundary', () => {
  const snapshot = fixture(), rationale = 'x'.repeat(2000);
  expect(saveDecision(snapshot, snapshot.reviews[0], finding(snapshot), rationale).rationale).toBe(rationale);
 });
 it('rejects a review belonging to another snapshot without writing', () => {
  const snapshot = fixture(), review = { ...snapshot.reviews[0], snapshotId: 'other-snapshot' };
  expect(() => saveDecision(snapshot, review, finding(snapshot), 'Reason.')).toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
 });
 it('rejects an unknown reviewer without writing', () => {
  const snapshot = fixture(), review = { ...snapshot.reviews[0], id: 'unrecorded-review' };
  expect(() => saveDecision(snapshot, review, finding(snapshot), 'Reason.')).toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
 });
 it('rejects a finding from a different review of the same snapshot', () => {
  const snapshot = fixture();
  expect(() => saveDecision(snapshot, snapshot.reviews[0], snapshot.reviews[1].findings[0], 'Reason.')).toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
 });
 it('rejects an unrecorded finding without writing', () => {
  const snapshot = fixture(), item = { ...finding(snapshot), id: 'unrecorded-finding' };
  expect(() => saveDecision(snapshot, snapshot.reviews[0], item, 'Reason.')).toThrow();
  expect(storage.setItem).not.toHaveBeenCalled();
 });
 it('propagates storage write failure rather than returning a successful decision', () => {
  const snapshot = fixture(), failure = new Error('Synthetic quota failure');
  storage.setItem.mockImplementation(() => { throw failure; });
  expect(() => saveDecision(snapshot, snapshot.reviews[0], finding(snapshot), 'Reason.')).toThrow(failure);
  expect(values.size).toBe(0);
 });
 it('propagates storage read failure rather than representing it as an absent decision', () => {
  const failure = new Error('Synthetic storage denied');
  storage.getItem.mockImplementation(() => { throw failure; });
  expect(() => readDecision(fixture())).toThrow(failure);
 });
 it('propagates failure to obtain localStorage itself', () => {
  const snapshot = fixture(), failure = new Error('Synthetic SecurityError');
  vi.stubGlobal('window', { get localStorage() { throw failure; } });
  expect(() => readDecision(snapshot)).toThrow(failure);
  expect(() => saveDecision(snapshot, snapshot.reviews[0], finding(snapshot), 'Reason.')).toThrow(failure);
 });
});

// Regressions for corrupt API/localStorage data that previously crashed the UI.
describe('Drift boundary hardening', () => {
 it.each(['limitations', 'title', 'coverage'])('rejects missing rendering field %s', field => {
  const snapshot = { ...fixture() } as Record<string, unknown>; delete snapshot[field];
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects malformed nested reviews before rendering', () => {
  const snapshot = fixture(); (snapshot.reviews[0] as unknown as Record<string, unknown>).findings = null;
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects duplicate reviewer roles', () => {
  const snapshot = fixture(); snapshot.reviews[1].role = 'intent';
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects invalid recorded timestamps', () => {
  const snapshot = fixture(); snapshot.capturedAt = 'not-a-date';
  expect(() => validateSnapshot(snapshot)).toThrow();
 });
 it('rejects a modified correction even with a matching finding ID', () => {
  const snapshot = fixture();
  expect(() => saveDecision(snapshot, snapshot.reviews[0], { ...finding(snapshot), correction: 'Unrecorded edit' }, 'Reason')).toThrow();
 });
 it('reports corrupt local storage without silently losing it', () => {
  const getItem = vi.fn(() => '{broken'); vi.stubGlobal('window', { localStorage: { getItem } });
  try { expect(() => readDecision(fixture())).toThrow(); expect(getItem).toHaveBeenCalledTimes(1); }
  finally { vi.unstubAllGlobals(); }
 });
});
