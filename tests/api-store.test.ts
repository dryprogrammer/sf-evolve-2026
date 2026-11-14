import { afterEach, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Aggregate, Command, FactoryError, FactoryView, Principal, Work, principals } from '../src/lib/contracts';
import { contentDigest, type EvidenceSource } from '../src/lib/factory-source';
import { FactoryStore } from '../src/lib/store';

// Mutable in-process source + real PGlite transactions. NOT live API integration evidence.
class MutableSource implements EvidenceSource {
  readonly scope = 'factory:mock-work:mock-supplement';
  reads = 0;
  unavailable = false;
  work: Work = {
    id: 'WO-42', title: 'Mock API review', description: 'Mock authoritative content, never fetched from a live service.',
    status: 'in progress', sourceVersion: 1, sourceAvailable: true,
    evidence: [{ id: 'requirements:mock', title: 'Mock requirements', content: 'Original required policy.', version: 1, complete: true, permitted: true,
      provenance: { provider: 'factory', resourceId: 'mock', resourceType: 'requirements_document', revisionId: 'revision-1', updatedAt: '2026-11-14T12:00:00.000Z', contentDigest: contentDigest({ title: 'Mock requirements', content: 'Original required policy.' }), supplemental: false } }],
  };
  async read(): Promise<Work> {
    this.reads++;
    if (this.unavailable) throw new FactoryError('unverifiable_evidence', 'Mock source unavailable; fail closed.', 503);
    return { ...structuredClone(this.work), sourceRetrievedAt: new Date().toISOString() };
  }
  change() {
    const evidence = this.work.evidence[0];
    evidence.content = 'Changed authoritative mock policy: additional Finance review.';
    evidence.version++;
    evidence.provenance!.revisionId = 'revision-2';
    evidence.provenance!.updatedAt = '2026-11-14T13:00:00.000Z';
    evidence.provenance!.contentDigest = contentDigest({ title: evidence.title, content: evidence.content });
  }
}
const maya = principals[0], alex = principals[1];
const stores: FactoryStore[] = [];
const directories: string[] = [];
function make(source?: EvidenceSource, directory?: string) {
  const store = new FactoryStore(directory, source);
  stores.push(store);
  return store;
}
function command(view: FactoryView, operation: Command['operation'], payload: Record<string, unknown> = {}, roundId?: string, actor: Principal = view.principal): Command {
  return { operation, payload, roundId, expectedVersion: view.version, expectedPrincipalId: actor.id, idempotencyKey: randomUUID() };
}
async function configured(store: FactoryStore) {
  let view = await store.get(maya);
  view = await store.execute(maya, command(view, 'create_round'));
  const roundId = view.rounds.at(-1)!.id;
  view = await store.execute(maya, command(view, 'configure_round', { decisionMakerId: maya.id, assignments: [{ reviewerId: alex.id, role: 'Finance', question: 'Is this exact policy safe?', responsibility: 'required' }] }, roundId));
  return { view, roundId };
}
afterEach(async () => {
  for (const store of stores.splice(0)) await store.close();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('FactoryStore mocked authoritative source transactions (NOT live integration evidence)', () => {
  it('syncs get and reverifies execute, retaining old signoffs, contributions and immutable snapshots after real mock-source change', async () => {
    const source = new MutableSource(), store = make(source);
    let { view, roundId } = await configured(store);
    expect(view.sourceMode).toBe('factory');
    view = await store.execute(maya, command(view, 'publish', {}, roundId));
    await expect(store.execute(maya, command(view, 'decide', { outcome: 'approve', rationale: 'Not signed yet.' }, roundId))).rejects.toMatchObject({ code: 'pending_signoffs' });
    view = await store.execute(alex, command(view, 'feedback', { text: 'Inspected original policy.', disposition: 'support' }, roundId, alex));
    view = await store.execute(alex, command(view, 'signoff', { assignmentId: view.rounds[0].assignments[0].id, outcome: 'approve', rationale: 'Original policy is acceptable.' }, roundId, alex));
    const oldRound = structuredClone(view.rounds[0]), oldSnapshot = structuredClone(view.snapshot);
    const attemptedApproval = command(view, 'decide', { outcome: 'approve', rationale: 'Use original approval.' }, roundId, maya);
    const reads = source.reads;
    source.change(); // No simulate_* command: this is a genuine change of the injected source.
    await expect(store.execute(maya, attemptedApproval)).rejects.toMatchObject({ code: 'changed_evidence', status: 409 });
    expect(source.reads).toBe(reads + 1);
    view = await store.get(maya);
    expect(view.work.evidence[0].content).toBe(source.work.evidence[0].content);
    expect(view.work.sourceVersion).toBe(2);
    expect(view.snapshot).toEqual(oldSnapshot);
    expect(view.rounds[0]).toEqual(oldRound);
    expect(view.history.filter(event => event.type === 'source_observed')).toHaveLength(1);
    view = await store.execute(maya, command(view, 'refresh'));
    expect(view.snapshot.id).not.toBe(oldSnapshot.id);
    expect(view.snapshot.digest).not.toBe(oldSnapshot.digest);
    expect(view.snapshot.evidence).toEqual(view.work.evidence);
    expect(view.rounds[0]).toEqual(oldRound);
    const staleAfterRefresh = command(view, 'decide', { outcome: 'approve', rationale: 'Refresh cannot renew a signoff.' }, roundId, maya);
    await expect(store.execute(maya, staleAfterRefresh)).rejects.toMatchObject({ code: 'changed_evidence' });
    const persisted = await store.db.query<{ document: Aggregate }>('SELECT document FROM factory_state WHERE scope=$1', [source.scope]);
    expect(persisted.rows[0].document.rounds[0]).toEqual(oldRound);
    expect(persisted.rows[0].document.rounds[0].decision).toBeUndefined();
    const snapshots = await store.db.query<{ snapshot_id: string; document: typeof oldSnapshot }>('SELECT snapshot_id,document FROM factory_snapshots WHERE scope=$1', [source.scope]);
    expect(snapshots.rows.find(row => row.snapshot_id === oldSnapshot.id)?.document).toEqual(oldSnapshot);
    expect(snapshots.rows.find(row => row.snapshot_id === view.snapshot.id)?.document).toEqual(view.snapshot);
    const receipts = await store.db.query('SELECT command_key FROM factory_receipts WHERE scope=$1 AND command_key IN ($2,$3)', [source.scope, attemptedApproval.idempotencyKey, staleAfterRefresh.idempotencyKey]);
    expect(receipts.rows).toHaveLength(0);
  });

  it('observes changed content on get without replacing the saved inspected snapshot', async () => {
    const source = new MutableSource(), store = make(source);
    const before = await store.get(maya);
    source.change();
    const after = await store.get(maya);
    expect(after.version).toBe(before.version + 1);
    expect(after.work.evidence).not.toEqual(before.work.evidence);
    expect(after.snapshot).toEqual(before.snapshot);
    expect((await store.get(maya)).version).toBe(after.version);
  });

  it('rejects publishing a stale draft even after refreshing the saved snapshot', async () => {
    const source = new MutableSource(), store = make(source);
    let { view, roundId } = await configured(store);
    const originalRound = structuredClone(view.rounds[0]);
    source.change();
    await expect(store.execute(maya, command(view, 'publish', {}, roundId))).rejects.toMatchObject({ code: 'changed_evidence' });
    view = await store.get(maya);
    view = await store.execute(maya, command(view, 'refresh'));
    await expect(store.execute(maya, command(view, 'publish', {}, roundId))).rejects.toMatchObject({ code: 'changed_evidence' });
    expect((await store.get(maya)).rounds[0]).toEqual(originalRound);
  });

  it('approves unchanged verified evidence only after the required human signoff', async () => {
    const source = new MutableSource(), store = make(source);
    let { view, roundId } = await configured(store);
    view = await store.execute(maya, command(view, 'publish', {}, roundId));
    view = await store.execute(alex, command(view, 'signoff', { assignmentId: view.rounds[0].assignments[0].id, outcome: 'approve', rationale: 'Exact mock revision reviewed.' }, roundId, alex));
    const reads = source.reads;
    view = await store.execute(maya, command(view, 'decide', { outcome: 'approve', rationale: 'Required approval verified.' }, roundId, maya));
    expect(source.reads).toBe(reads + 1);
    expect(view.rounds[0]).toMatchObject({ state: 'approved', decision: { digest: view.rounds[0].snapshot.digest } });
    expect(view.rounds[0].decision?.verifiedAt).toBeTruthy();
    expect(view.work.status).toBe('in progress');
  });

  it('fails closed on unavailable source for reads, commands and receipt replay without changing persisted state', async () => {
    const source = new MutableSource(), store = make(source);
    let view = await store.get(maya);
    const committed = command(view, 'create_round');
    view = await store.execute(maya, committed);
    const before = await store.db.query('SELECT document FROM factory_state WHERE scope=$1', [source.scope]);
    const rejected = command(view, 'refresh');
    source.unavailable = true;
    await expect(store.get(maya)).rejects.toMatchObject({ code: 'unverifiable_evidence', status: 503 });
    await expect(store.execute(maya, rejected)).rejects.toMatchObject({ code: 'unverifiable_evidence' });
    await expect(store.execute(maya, committed)).rejects.toMatchObject({ code: 'unverifiable_evidence' });
    expect((await store.db.query('SELECT document FROM factory_state WHERE scope=$1', [source.scope])).rows).toEqual(before.rows);
    expect((await store.db.query('SELECT command_key FROM factory_receipts WHERE scope=$1 AND command_key=$2', [source.scope, rejected.idempotencyKey])).rows).toEqual([]);
    source.unavailable = false;
    expect((await store.get(maya)).rounds).toHaveLength(1);
  });

  it.each(['simulate_change', 'simulate_outage', 'simulate_revoke'] as const)('denies %s even to a coordinator in factory scope', async operation => {
    const source = new MutableSource(), store = make(source);
    const view = await store.get(maya), reads = source.reads;
    await expect(store.execute(maya, command(view, operation, { available: false, permitted: false }))).rejects.toMatchObject({ code: 'denied', status: 403 });
    expect(source.reads).toBe(reads);
    expect((await store.get(maya)).version).toBe(view.version);
    expect((await store.db.query('SELECT command_key FROM factory_receipts WHERE scope=$1', [source.scope])).rows).toEqual([]);
  });

  it('keeps fixture state unchanged when the same database is reopened with a separate factory scope', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'mock-api-store-'));
    directories.push(directory);
    const fixture = make(undefined, directory);
    let fixtureView = await fixture.get(maya);
    fixtureView = await fixture.execute(maya, command(fixtureView, 'create_round'));
    fixtureView = await fixture.execute(maya, command(fixtureView, 'save_draft', { text: 'Fixture-only draft', snapshotId: fixtureView.snapshot.id, draftVersion: 0 }));
    await fixture.close();
    stores.splice(stores.indexOf(fixture), 1);
    const source = new MutableSource(), apiStore = make(source, directory);
    let apiView = await apiStore.get(maya);
    expect(apiView.rounds).toEqual([]);
    expect(apiView.draft).toBeNull();
    source.change();
    apiView = await apiStore.get(maya);
    await apiStore.execute(maya, command(apiView, 'refresh'));
    expect((await apiStore.db.query('SELECT scope FROM factory_state')).rows).toHaveLength(2);
    await apiStore.close();
    stores.splice(stores.indexOf(apiStore), 1);
    const reopenedFixture = make(undefined, directory);
    expect(await reopenedFixture.get(maya)).toEqual(fixtureView);
  });
});
