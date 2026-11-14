/** v1 frozen contract. Content digests are local fingerprints, not authoritative revisions. */
export type ReviewerRole = 'intent' | 'delivery' | 'skeptic';
export interface DriftSource {
 id: string; type: string; title: string; url: string | null;
 excerpt: string; content: string; retrievedAt: string;
 revision: string | null; digest: string | null;
 completeness: 'complete' | 'excerpt' | 'unknown';
 access: 'available' | 'unavailable'; note: string;
}
export interface DriftCitation { sourceId: string; quote: string; }
export interface DriftFinding {
 id: string; title: string; claim: string;
 kind: 'conflict' | 'gap' | 'caution' | 'alignment';
 confidence: 'high' | 'medium' | 'low';
 citations: DriftCitation[]; uncertainty: string; correction: string;
}
export interface DriftReview {
 id: string; role: ReviewerRole; name: string;
 mode: 'recorded agent review'; snapshotId: string; reviewedAt: string;
 summary: string; findings: DriftFinding[]; dissent: string;
}
export interface DriftSnapshot {
 schemaVersion: 1; id: string; capturedAt: string;
 title: string; coverage: string; limitations: string[];
 sources: DriftSource[]; reviews: DriftReview[];
}
export interface DriftDecision {
 schemaVersion: 1; snapshotId: string; findingId: string; reviewerId: string;
 correction: string; rationale: string; selectedAt: string;
 snapshot: DriftSnapshot;
}
