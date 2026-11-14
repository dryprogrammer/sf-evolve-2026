import { describe, expect, it } from 'vitest';
import recorded from '../src/lib/drift/data/snapshot.json';
import { validateSnapshot } from '../src/lib/drift/validate';

describe('Recorded project export (not live integration)', () => {
 it('contains three valid independent recorded reviews on the same evidence', () => {
  const snapshot = validateSnapshot(recorded);
  expect(snapshot.sources).toHaveLength(3);
  expect(snapshot.reviews.map(review => review.role)).toEqual(['intent','delivery','skeptic']);
  expect(snapshot.sources.every(source => !!source.revision && !!source.digest)).toBe(true);
 });
});
