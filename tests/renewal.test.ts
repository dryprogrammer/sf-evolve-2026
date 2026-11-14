import { describe, it, expect } from 'vitest';
import { renewalDiscountPercent } from '../src/lib/renewal';
describe('fictional renewal acceptance examples', () => {
  it('raises standard-term renewals to 20%', () => expect(renewalDiscountPercent('standard')).toBe(20));
  it('preserves the 15% limit for custom payment terms', () => expect(renewalDiscountPercent('custom')).toBe(15));
  it('rejects unknown terms instead of guessing intent', () => expect(() => renewalDiscountPercent('unknown' as 'standard')).toThrow('Unknown'));
});
