import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { type Aggregate, type Command, type Principal, principals } from '../src/lib/contracts';
import { seed, snapshot } from '../src/lib/fixtures';
import { transition } from '../src/lib/review';
import { FactoryStore } from '../src/lib/store';

const [maya, alex, , agent] = principals;
const setup = { decisionMakerId: maya.id, assignments: [{ reviewerId: alex.id, role: 'Security', question: 'Is this evidence ready?', responsibility: 'required' }] };
function command(a: Aggregate, actor: Principal, operation: Command['operation'], payload: Command['payload'] = {}, roundId?: string): Command {
  return { operation, payload, roundId, expectedVersion: a.version, expectedPrincipalId: actor.id, idempotencyKey: randomUUID() };
}

describe('handoff evidence gates', () => {
  // Run the same contract against pure transitions and transactional JSONB persistence.
  for (const backend of ['transition', 'store'] as const) {
    it(`${backend}: rejects stale approval and requires a fresh review without losing attribution`, async () => {
      const store = backend === 'store' ? new FactoryStore() : undefined;
      let a: Aggregate = store ? await store.get(maya) : seed();
      async function send(actor: Principal, operation: Command['operation'], payload: Command['payload'] = {}, roundId?: string) {
        const c = command(a, actor, operation, payload, roundId);
        a = store ? await store.execute(actor, c) : transition(a, actor, c);
      }
      async function reject(code: string, roundId: string) {
        const before = structuredClone(a);
        await expect(send(maya, 'decide', { outcome: 'approve', rationale: 'Ready.' }, roundId)).rejects.toMatchObject({ code, status: 409 });
        expect(a).toEqual(before);
        if (store) expect(await store.get(maya)).toEqual(before);
      }
      try {
        await send(maya, 'create_round');
        const oldId = a.rounds.at(-1)!.id;
        await send(maya, 'configure_round', setup, oldId);
        await send(maya, 'publish', {}, oldId);
        await send(agent, 'feedback', { disposition: 'advice', text: 'Advisory evidence observation.' }, oldId);
        await send(alex, 'feedback', { disposition: 'support', text: 'Human evidence observation.' }, oldId);
        await send(alex, 'signoff', { assignmentId: a.rounds[0].assignments[0].id, outcome: 'approve', rationale: 'Reviewed original evidence.' }, oldId);
        const old = structuredClone(a.rounds[0]);
        expect(old.feedback).toEqual([
          expect.objectContaining({ actorId: agent.id, kind: 'agent', snapshotId: old.snapshot.id }),
          expect.objectContaining({ actorId: alex.id, kind: 'human', snapshotId: old.snapshot.id }),
        ]);
        expect(old.signoffs[0]).toMatchObject({ actorId: alex.id, snapshotId: old.snapshot.id, generation: 1, outcome: 'approve' });
        await send(maya, 'simulate_change');
        await reject('changed_evidence', oldId);
        await send(maya, 'refresh');
        expect(a.snapshot.digest).not.toBe(old.snapshot.digest);
        expect(a.rounds[0]).toEqual(old);
        await reject('changed_evidence', oldId);
        await send(maya, 'cancel', { reason: 'Review changed evidence in a fresh round.' }, oldId);
        await send(maya, 'create_round');
        const newId = a.rounds.at(-1)!.id;
        await send(maya, 'configure_round', setup, newId);
        await send(maya, 'publish', {}, newId);
        expect(a.rounds.at(-1)!.signoffs).toEqual([]);
        await reject('pending_signoffs', newId);
        await send(alex, 'signoff', { assignmentId: a.rounds.at(-1)!.assignments[0].id, outcome: 'approve', rationale: 'Re-reviewed current evidence.' }, newId);
        await send(maya, 'decide', { outcome: 'approve', rationale: 'Current evidence verified.' }, newId);
        const current = a.rounds.at(-1)!;
        expect(current.decision).toMatchObject({ actorId: maya.id, outcome: 'approve', digest: snapshot(a.work).digest, verifiedAt: expect.any(String) });
        expect(current.snapshot).toEqual(a.snapshot);
        expect(current.signoffs[0]).toMatchObject({ actorId: alex.id, snapshotId: current.snapshot.id });
        expect(a.rounds[0]).toEqual({ ...old, state: 'cancelled' });
        expect(a.history.filter(h => h.type === 'decide')).toEqual([expect.objectContaining({ actorId: maya.id, roundId: newId, snapshotId: current.snapshot.id })]);
        expect(a.work.status).toBe('In Progress');
        if (store) {
          expect((await store.get(maya)).rounds).toEqual(a.rounds);
          const archived = await store.db.query<{ document: unknown }>('SELECT document FROM factory_snapshots WHERE snapshot_id=$1', [old.snapshot.id]);
          expect(archived.rows[0].document).toEqual(old.snapshot);
        }
      } finally { await store?.close(); }
    });
  }
});
