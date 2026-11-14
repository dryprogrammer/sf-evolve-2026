export type Kind = 'human' | 'agent';
export type Disposition = 'advice' | 'support' | 'request_changes';
export type Outcome = 'approve' | 'request_changes';
export interface Principal { id: string; name: string; kind: Kind; coordinator: boolean; }
export interface Evidence { id: string; title: string; content: string; version: number; complete: boolean; permitted: boolean; sourceRef?: string; provenance?: { provider: 'factory'; resourceId: string; resourceType: string; revisionId?: string; updatedAt: string; contentDigest: string; supplemental: boolean }; }
export interface Snapshot { id: string; digest: string; retrievedAt: string; evidence: Evidence[]; sourceVersion: number; }
export interface Work { id: string; title: string; description: string; status: string; sourceVersion: number; sourceAvailable: boolean; evidence: Evidence[]; sourceRetrievedAt?: string; sourceCoverage?: string; }
export interface Assignment { id: string; reviewerId: string; role: string; question: string; responsibility: 'advisory' | 'required'; generation: number; }
export interface Feedback { id: string; actorId: string; kind: Kind; text: string; disposition: Disposition; createdAt: string; snapshotId: string; judgment?: import('./judgment').JudgmentAnswer; }
export interface Signoff { id: string; assignmentId: string; generation: number; actorId: string; outcome: Outcome; rationale: string; createdAt: string; snapshotId: string; }
export interface Decision { actorId: string; outcome: Outcome; rationale: string; responses: Record<string,string>; verifiedAt?: string; digest?: string; createdAt: string; }
export interface Round { id: string; state: 'draft'|'open'|'approved'|'changes_requested'|'cancelled'; snapshot: Snapshot; decisionMakerId: string; assignments: Assignment[]; feedback: Feedback[]; signoffs: Signoff[]; decision?: Decision; }
export interface History { id: string; actorId: string; createdAt: string; type: string; roundId?: string; snapshotId?: string; detail: string; }
export interface Aggregate { version: number; work: Work; snapshot: Snapshot; rounds: Round[]; history: History[]; }
export interface Draft { text: string; snapshotId: string; version: number; }
export interface FactoryView extends Aggregate { principal: Principal; principals: Principal[]; draft: Draft | null; sourceMode: 'fixture' | 'factory'; }
export interface Command { operation: 'judgment_answer'|'create_round'|'configure_round'|'publish'|'feedback'|'signoff'|'decide'|'reassign'|'cancel'|'refresh'|'save_draft'|'discard_draft'|'simulate_change'|'simulate_outage'|'simulate_revoke'; expectedVersion: number; expectedPrincipalId: string; idempotencyKey: string; roundId?: string; payload: Record<string,unknown>; }
export class FactoryError extends Error { constructor(public code: string, message: string, public status = 400) { super(message); } }
export const principals: Principal[] = [
 { id:'maya', name:'Maya · Sales Operations', kind:'human', coordinator:true },
 { id:'alex', name:'Alex · Finance', kind:'human', coordinator:false },
 { id:'river', name:'River · Engineering', kind:'human', coordinator:false },
 { id:'observer', name:'Observer · agent', kind:'agent', coordinator:false }
];
