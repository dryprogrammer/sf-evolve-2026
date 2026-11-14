/** Fictional acceptance example, not connected to billing or a release. */
export function renewalDiscountPercent(terms: 'standard' | 'custom'): number {
  if (terms !== 'standard' && terms !== 'custom') throw new Error('Unknown payment terms');
  return terms === 'custom' ? 15 : 20;
}
