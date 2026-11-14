import { FactoryError, type Aggregate, type Snapshot } from './contracts';
import { renewalDiscountPercent } from './renewal';
export type JudgmentChoice = 'keep_custom_limit' | 'include_custom_terms';
export interface JudgmentAnswer { choice: JudgmentChoice; reason: string; evidenceDigest: string; proposal: string; examples: { terms: 'standard'|'custom'; expected: number; actual: number }[]; }
export const judgmentQuestion = 'Does the 20% renewal discount also apply to custom payment terms?';
export const judgmentChoices = [
 { id: 'keep_custom_limit' as const, label: 'Keep custom terms at 15%', consequence: 'Standard renewals get 20%; custom terms retain the existing limit.' },
 { id: 'include_custom_terms' as const, label: 'Include custom terms at 20%', consequence: 'Changes the custom-term policy and requires an implementation change.' }
];
/** Fixed fictional scenario, not an inferred question or an agent completion. */
export function supportsJudgmentDemo(a: Pick<Aggregate, 'work'>): boolean {
 return a.work.id === 'DEMO-1' && a.work.evidence.every(e => !e.provenance && e.permitted) && a.work.evidence.some(e => e.id === 'requirements');
}
/** Deterministic proposal. Human clarification never changes code or grants approval. */
export function buildJudgmentAnswer(choice: unknown, reason: unknown, evidence: Snapshot): JudgmentAnswer {
 if(choice !== 'keep_custom_limit' && choice !== 'include_custom_terms') throw new FactoryError('validation','Choose one of the two business policies.');
 if(typeof reason !== 'string' || !reason.trim() || [...reason].length > 2000) throw new FactoryError('validation','Explain the choice in 1–2,000 characters.');
 const custom = choice === 'keep_custom_limit' ? 15 : 20;
 return { choice, reason: reason.trim(), evidenceDigest: evidence.digest,
  proposal: `Standard renewal: 20%. Custom payment terms: ${custom}%. Unknown terms: reject rather than infer policy.`,
  examples: (['standard','custom'] as const).map(terms => ({ terms, expected: terms === 'standard' ? 20 : custom, actual: renewalDiscountPercent(terms) }))
 };
}
