import './handoff.css';

type Target = 'demo-evidence' | 'review-controls' | 'implementation-evidence';
const steps: { label: string; target: Target }[] = [
  { label: 'Inspect policy', target: 'demo-evidence' },
  { label: 'Open human review', target: 'review-controls' },
  { label: 'Inspect code and tests', target: 'implementation-evidence' },
];

/** Navigation only: never creates a round, signs off, approves, or changes evidence. */
export default function DemoGuide({ ready, onAction }: { ready: boolean; onAction: (target: Target) => void }) {
  return <section className="demo-guide" aria-label="Five-minute demo path">
    <div className="demo-guide-heading"><h2>One renewal. One accountable decision.</h2><span>5-minute fixture demo</span></div>
    <p>20% for standard terms. 15% for custom terms. Approval must match the reviewed evidence.</p>
    <nav aria-label="Demo evidence shortcuts">{steps.map((step, index) =>
      <button key={step.target} disabled={!ready} onClick={() => onAction(step.target)}>
        <span aria-hidden="true">0{index + 1}</span> {step.label} <span aria-hidden="true">→</span>
      </button>
    )}</nav>
    <small>Prepared policy/code example · real persisted review gates · no billing deployment or live agent stream</small>
  </section>;
}
