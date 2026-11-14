import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Command, type FactoryView, type Principal } from '../src/lib/contracts';
import { HEARTBEAT_TIMEOUT_MS, RoomService, SESSION_TTL_MS, type RoomEvent, type RoomSession } from '../src/lib/room';
import { executeAndNotify } from '../src/lib/room-server';
import { FactoryStore } from '../src/lib/store';
import { GET as sessionGET, POST as sessionPOST } from '../src/app/api/room/session/route';
import { GET as factoryGET, POST as factoryPOST } from '../src/app/api/factory/route';

// Vitest has no Next.js @ alias; map route imports to their real modules.
vi.mock('@/lib/contracts', () => import('../src/lib/contracts'));
vi.mock('@/lib/http', () => import('../src/lib/http'));
vi.mock('@/lib/room-server', () => import('../src/lib/room-server'));
vi.mock('@/lib/store', () => import('../src/lib/store'));

const globals = globalThis as typeof globalThis & { factoryStore?: FactoryStore; factoryRoom?: RoomService };
const originalEnv = { mode: process.env.FACTORY_MODE, directory: process.env.FACTORY_DATA_DIR };
const stores = new Set<FactoryStore>();
const services = new Set<RoomService>();
const directories: string[] = [];

async function setup(directory?: string) {
  let clock = Date.UTC(2026, 10, 14);
  const store = new FactoryStore(directory);
  stores.add(store);
  const service = new RoomService(store.db, store.ready, store.scope, () => clock);
  services.add(service);
  await store.ready;
  return { store, service, advance: (milliseconds: number) => { clock += milliseconds; }, now: () => clock };
}
async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), 'factory-room-test-'));
  directories.push(directory);
  return directory;
}
function subscribe(service: RoomService, session: RoomSession) {
  const events: RoomEvent[] = [];
  const close = vi.fn();
  const send = vi.fn((event: RoomEvent) => { events.push(event); return true; });
  const unsubscribe = service.subscribe(session, send, close);
  return { events, close, send, unsubscribe };
}
function command(view: FactoryView, actor: Principal, operation: Command['operation'], payload: Command['payload'] = {}, roundId?: string): Command {
  return { operation, expectedVersion: view.version, expectedPrincipalId: actor.id, idempotencyKey: randomUUID(), payload, ...(roundId ? { roundId } : {}) };
}
function request(path: string, method = 'GET', input?: unknown, authorization?: string) {
  return new Request(`http://localhost:3100${path}`, {
    method,
    headers: { Host: 'localhost:3100', Origin: 'http://localhost:3100', 'Content-Type': 'application/json', Cookie: 'factory_persona=maya', ...(authorization === undefined ? {} : { Authorization: authorization }) },
    ...(method === 'POST' ? { body: JSON.stringify(input ?? {}) } : {}),
  });
}
function installGlobals(store: FactoryStore, service: RoomService) {
  process.env.FACTORY_MODE = 'fixture';
  globals.factoryStore = store;
  globals.factoryRoom = service;
}

afterEach(async () => {
  for (const service of services) service.stop();
  if (globals.factoryRoom && !services.has(globals.factoryRoom)) globals.factoryRoom.stop();
  if (globals.factoryStore && !stores.has(globals.factoryStore)) await globals.factoryStore.close();
  delete globals.factoryRoom;
  delete globals.factoryStore;
  for (const store of stores) await store.close();
  services.clear();
  stores.clear();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
  if (originalEnv.mode === undefined) delete process.env.FACTORY_MODE; else process.env.FACTORY_MODE = originalEnv.mode;
  if (originalEnv.directory === undefined) delete process.env.FACTORY_DATA_DIR; else process.env.FACTORY_DATA_DIR = originalEnv.directory;
});

describe('independent demo room sessions', () => {
  it('AC-SPR-001.2/.3: Maya, Alex and River resolve independently and leaving one changes neither other session', async () => {
    const { service } = await setup();
    const sessions = await Promise.all(['maya', 'alex', 'river'].map(id => service.enter(id)));
    expect(new Set(sessions.map(s => s.sessionId)).size).toBe(3);
    const resolved = await Promise.all(sessions.map(s => service.resolve(`Bearer ${s.token}`)));
    expect(resolved.map(s => s.participantId)).toEqual(['maya', 'alex', 'river']);
    await service.leave(resolved[0]);
    await expect(service.resolve(`Bearer ${sessions[0].token}`)).rejects.toMatchObject({ code: 'session_revoked', status: 401 });
    for (const index of [1, 2]) expect(await service.resolve(`Bearer ${sessions[index].token}`)).toEqual(resolved[index]);
  });

  it('AC-SPR-001.3: two tabs for the same participant get independent session IDs and credentials', async () => {
    const { service } = await setup();
    const first = await service.enter('maya'), second = await service.enter('maya');
    expect(first.sessionId).not.toBe(second.sessionId);
    expect(first.token).not.toBe(second.token);
    const secondResolved = await service.resolve(`Bearer ${second.token}`);
    await service.leave(first);
    expect(await service.resolve(`Bearer ${second.token}`)).toEqual(secondResolved);
  });

  it.each([null, '', 'Basic abc', 'Bearer short', 'bearer abcdefghijklmnopqrstuvwxyz', 'Bearer abcdefghijklmnopqrstuvwxyz extra'])('AC-SPR-001.4: absent/malformed header %s is session_required, never a default identity', async authorization => {
    const { service } = await setup();
    await expect(service.resolve(authorization)).rejects.toMatchObject({ code: 'session_required', status: 401 });
  });

  it('AC-SPR-001.4: syntactically valid unknown credentials are session_invalid', async () => {
    const { service } = await setup();
    await expect(service.resolve(`Bearer ${'x'.repeat(43)}`)).rejects.toMatchObject({ code: 'session_invalid', status: 401 });
  });

  it('AC-SPR-001.4: revoked and expired credentials have distinct rejection codes', async () => {
    const { service, advance } = await setup();
    const revoked = await service.enter('maya'), expired = await service.enter('alex');
    await service.leave(revoked);
    await expect(service.resolve(`Bearer ${revoked.token}`)).rejects.toMatchObject({ code: 'session_revoked', status: 401 });
    advance(SESSION_TTL_MS + 1);
    await expect(service.resolve(`Bearer ${expired.token}`)).rejects.toMatchObject({ code: 'session_expired', status: 401 });
  });

  it.each(['observer', 'unknown', undefined, null])('AC-SPR-001.4: participant %s cannot enter; explicit human selection is required', async id => {
    const { service, store } = await setup();
    await expect(service.enter(id)).rejects.toMatchObject({ code: 'validation' });
    expect((await store.db.query('SELECT session_id FROM room_sessions')).rows).toEqual([]);
  });

  it('AC-SPR-001.6: disk restart preserves session identity but replaces instanceId and forgets presence', async () => {
    const directory = await temporaryDirectory();
    const first = await setup(directory);
    const issued = await first.service.enter('river');
    const resolved = await first.service.resolve(`Bearer ${issued.token}`);
    first.service.heartbeat(resolved);
    expect(first.service.snapshot()).toHaveLength(1);
    first.service.stop();
    await first.store.close();
    stores.delete(first.store);
    const restarted = await setup(directory);
    expect(await restarted.service.resolve(`Bearer ${issued.token}`)).toEqual(resolved);
    expect(restarted.service.instanceId).not.toBe(first.service.instanceId);
    expect(restarted.service.snapshot()).toEqual([]);
  });

  it('AC-SPR-002.3: a persisted credential belonging to another project is denied with 403', async () => {
    const { service, store, now } = await setup();
    const token = 'foreign_project_token_1234567890';
    await store.db.query('INSERT INTO room_sessions (session_id,token_hash,participant_id,project_id,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6)', [randomUUID(), createHash('sha256').update(token).digest('hex'), 'maya', 'another-project', new Date(now()).toISOString(), new Date(now() + SESSION_TTL_MS).toISOString()]);
    await expect(service.resolve(`Bearer ${token}`)).rejects.toMatchObject({ code: 'denied', status: 403 });
    expect(service.projectId).toBe(store.scope);
  });
});

describe('shared confirmed state and private drafts', () => {
  it('AC-SPR-002.1/.2/.5: sessions share confirmed rounds, isolate drafts, and preserve historical provenance', async () => {
    const { service, store } = await setup();
    const mayaSession = await service.enter('maya'), alexSession = await service.enter('alex');
    const maya = service.principal(mayaSession), alex = service.principal(alexSession);
    const mayaOrigin = { mode: 'demo_session' as const, sessionId: mayaSession.sessionId };
    const alexOrigin = { mode: 'demo_session' as const, sessionId: alexSession.sessionId };
    let view = await store.get(maya);
    view = await store.execute(maya, command(view, maya, 'refresh'));
    const earlierHistory = structuredClone(view.history);
    expect(earlierHistory.at(-1)?.provenance).toEqual({ mode: 'fixture_persona' });
    view = await store.execute(maya, command(view, maya, 'create_round'), mayaOrigin);
    const roundId = view.rounds[0].id;
    view = await store.execute(maya, command(view, maya, 'configure_round', { decisionMakerId: 'maya', assignments: [{ reviewerId: 'alex', role: 'Finance', question: 'Safe?', responsibility: 'required' }] }, roundId), mayaOrigin);
    view = await store.execute(maya, command(view, maya, 'publish', {}, roundId), mayaOrigin);
    const alexView = await store.get(alex);
    await store.execute(alex, command(alexView, alex, 'feedback', { text: 'Alex confirmed feedback', disposition: 'support' }, roundId), alexOrigin);
    view = await store.get(maya);
    await store.execute(maya, command(view, maya, 'save_draft', { text: 'Maya private draft', snapshotId: view.snapshot.id, draftVersion: 0 }), mayaOrigin);
    view = await store.get(alex);
    await store.execute(alex, command(view, alex, 'save_draft', { text: 'Alex private draft', snapshotId: view.snapshot.id, draftVersion: 0 }), alexOrigin);
    const m = await store.get(maya), a = await store.get(alex);
    expect(m.rounds).toEqual(a.rounds);
    expect(m.rounds[0].state).toBe('open');
    expect(m.rounds[0].feedback[0].actorId).toBe('alex');
    expect(m.draft?.text).toBe('Maya private draft');
    expect(a.draft?.text).toBe('Alex private draft');
    expect(JSON.stringify(m)).not.toContain('Alex private draft');
    expect(JSON.stringify(a)).not.toContain('Maya private draft');
    expect(m.history.slice(0, earlierHistory.length)).toEqual(earlierHistory);
    for (const entry of m.history.slice(earlierHistory.length)) expect(entry.provenance).toEqual(entry.actorId === 'maya' ? mayaOrigin : alexOrigin);
  });

  it('AC-SPR-004.5/.6: stale versions conflict without mutation, identical retries reconcile, and changed payloads reject key reuse', async () => {
    const { service, store } = await setup();
    const session = await service.enter('maya'), actor = service.principal(session);
    const origin = { mode: 'demo_session' as const, sessionId: session.sessionId };
    const before = await store.get(actor);
    const original = command(before, actor, 'create_round');
    const committed = await store.execute(actor, original, origin);
    const stale = command(before, actor, 'refresh');
    await expect(store.execute(actor, stale, origin)).rejects.toMatchObject({ code: 'conflict', status: 409 });
    expect(await store.get(actor)).toEqual(committed);
    expect(await store.execute(actor, original, origin)).toEqual(committed);
    await expect(store.execute(actor, { ...original, payload: { different: true } }, origin)).rejects.toMatchObject({ code: 'key_reuse', status: 409 });
    expect((await store.get(actor)).history).toEqual(committed.history);
    expect((await store.db.query('SELECT command_key FROM factory_receipts')).rows).toHaveLength(1);
  });
});

describe('presence and revision events', () => {
  it('AC-SPR-003.1/.2/.3/.6: heartbeat connects; accepted movement broadcasts only the resolved session and no review fields', async () => {
    const { service, advance } = await setup();
    const maya = await service.enter('maya'), alex = await service.enter('alex');
    const listener = subscribe(service, alex);
    const alexBefore = service.snapshot().find(p => p.sessionId === alex.sessionId);
    const initial = service.heartbeat(maya);
    expect(initial).toMatchObject({ sessionId: maya.sessionId, participantId: 'maya', connected: true });
    advance(80);
    // Extra untrusted identity fields cannot redirect a movement to another entry.
    const input = { x: initial.x + 20, y: initial.y, facing: 'right' as const, seq: 1, sessionId: alex.sessionId, participantId: 'alex' };
    const moved = service.move(maya, input);
    expect(moved.accepted).toBe(true);
    expect(moved.entry).toMatchObject({ sessionId: maya.sessionId, x: initial.x + 20, seq: 1, facing: 'right' });
    expect(service.snapshot().find(p => p.sessionId === alex.sessionId)).toEqual(alexBefore);
    expect(listener.events.at(-1)).toMatchObject({ type: 'presence', entry: moved.entry });
    const presenceEvents = listener.events.filter((event): event is Extract<RoomEvent, { type: 'presence' }> => event.type === 'presence');
    expect(presenceEvents).toHaveLength(2);
    for (const event of presenceEvents) {
      expect(Object.keys(event).sort()).toEqual(['entry', 'seq', 'type']);
      expect(Object.keys(event.entry).sort()).toEqual(['connected', 'facing', 'name', 'participantId', 'seq', 'sessionId', 'x', 'y']);
    }
  });

  it.each(['blocked', 'too_far', 'stale', 'rate_limited', 'invalid'] as const)('AC-SPR-003.2/.3: %s movement keeps the last accepted position without broadcasting', async reason => {
    const { service, advance } = await setup();
    const session = await service.enter('maya');
    const listener = subscribe(service, session);
    const initial = service.snapshot()[0];
    const accepted = service.move(session, { x: initial.x + 20, y: initial.y, facing: 'right', seq: 1 });
    expect(accepted.accepted).toBe(true);
    if (reason !== 'rate_limited') advance(80);
    const inputs = {
      blocked: { x: 400, y: 200, facing: 'right', seq: 2 },
      too_far: { x: 1040, y: 600, facing: 'right', seq: 2 },
      stale: { x: accepted.entry.x + 1, y: initial.y, facing: 'right', seq: 1 },
      rate_limited: { x: accepted.entry.x + 1, y: initial.y, facing: 'right', seq: 2 },
      invalid: { x: Number.NaN, y: initial.y, facing: 'right', seq: 2 },
    };
    const eventCount = listener.events.length;
    expect(service.move(session, inputs[reason])).toEqual({ accepted: false, entry: accepted.entry, reason });
    expect(service.snapshot()[0]).toEqual(accepted.entry);
    expect(listener.events).toHaveLength(eventCount);
  });

  it('AC-SPR-003.4/.6: 15 seconds without heartbeat disconnects and broadcasts; heartbeat reconnects', async () => {
    const { service, advance } = await setup();
    const session = await service.enter('river');
    const listener = subscribe(service, session);
    const connected = service.snapshot()[0];
    advance(HEARTBEAT_TIMEOUT_MS - 1);
    service.sweep();
    expect(service.snapshot()[0].connected).toBe(true);
    expect(listener.events).toHaveLength(1);
    advance(1);
    service.sweep();
    expect(service.snapshot()[0]).toEqual({ ...connected, connected: false });
    expect(listener.events.at(-1)).toEqual({ type: 'presence', seq: 2, entry: { ...connected, connected: false } });
    service.heartbeat(session);
    expect(listener.events.at(-1)).toEqual({ type: 'presence', seq: 3, entry: connected });
  });

  it('AC-SPR-003.5: leave removes presence, broadcasts removal, and revokes/closes only that session subscriber', async () => {
    const { service } = await setup();
    const first = await service.enter('maya'), other = await service.enter('maya');
    const leaving = subscribe(service, first), remaining = subscribe(service, other);
    await service.leave(first);
    expect(leaving.events.at(-1)).toEqual({ type: 'session_revoked' });
    expect(leaving.close).toHaveBeenCalledTimes(1);
    expect(remaining.close).not.toHaveBeenCalled();
    expect(remaining.events.at(-1)).toMatchObject({ type: 'presence_removed', sessionId: first.sessionId });
    expect(service.snapshot().map(p => p.sessionId)).toEqual([other.sessionId]);
    expect(service.subscriberCount()).toBe(1);
    const leavingCount = leaving.events.length;
    service.notifyRevision(7);
    expect(leaving.events).toHaveLength(leavingCount);
    expect(remaining.events.at(-1)).toEqual({ type: 'revision', revision: 7 });
  });

  it('AC-SPR-004.1: hello carries instanceId, sequence and snapshot; revisions reach every live subscriber with no draft payload', async () => {
    const { service } = await setup();
    const maya = await service.enter('maya'), alex = await service.enter('alex'), river = await service.enter('river');
    service.heartbeat(maya);
    const listeners = [subscribe(service, maya), subscribe(service, alex), subscribe(service, river)];
    expect(listeners[2].events[0]).toEqual({ type: 'hello', instanceId: service.instanceId, sessionId: river.sessionId, seq: 3, presence: service.snapshot() });
    service.notifyRevision(42);
    for (const listener of listeners) expect(listener.events.at(-1)).toEqual({ type: 'revision', revision: 42 });
    listeners[0].unsubscribe();
    const count = listeners[0].events.length;
    service.notifyRevision(43);
    expect(listeners[0].events).toHaveLength(count);
    expect(listeners[1].events.at(-1)).toEqual({ type: 'revision', revision: 43 });
  });

  it('AC-SPR-004.1: subscriber queue overflow drops and closes only the slow subscriber', async () => {
    const { service } = await setup();
    const slow = subscribe(service, await service.enter('maya'));
    const healthy = subscribe(service, await service.enter('alex'));
    slow.send.mockReturnValue(false);
    service.notifyRevision(10);
    expect(slow.close).toHaveBeenCalledTimes(1);
    expect(healthy.close).not.toHaveBeenCalled();
    expect(service.subscriberCount()).toBe(1);
    const calls = slow.send.mock.calls.length;
    service.notifyRevision(11);
    expect(slow.send).toHaveBeenCalledTimes(calls);
    expect(healthy.events.at(-1)).toEqual({ type: 'revision', revision: 11 });
  });

  it('AC-SPR-004.1: an overflowing initial hello also drops and closes the subscriber immediately', async () => {
    const { service } = await setup();
    const send = vi.fn(() => false), close = vi.fn();
    service.subscribe(await service.enter('maya'), send, close);
    expect(send).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(service.subscriberCount()).toBe(0);
  });

  it('AC-SPR-001.4/004.1: expired subscribers stop receiving revision events', async () => {
    const { service, advance } = await setup();
    const listener = subscribe(service, await service.enter('maya'));
    advance(SESSION_TTL_MS + 1);
    service.notifyRevision(1);
    expect(listener.events).toHaveLength(1);
    expect(listener.close).toHaveBeenCalledTimes(1);
    expect(service.subscriberCount()).toBe(0);
  });

  it('AC-SPR-004.1: executeAndNotify sends revisions after durable commit, never for failed commands or private draft text', async () => {
    const { service, store } = await setup();
    installGlobals(store, service);
    const session = await service.enter('maya'), actor = service.principal(session);
    const origin = { mode: 'demo_session' as const, sessionId: session.sessionId };
    const listener = subscribe(service, session);
    const persistedReads: Promise<FactoryView>[] = [];
    const notify = vi.spyOn(service, 'notifyRevision').mockImplementation(revision => {
      persistedReads.push(store.get(actor));
      RoomService.prototype.notifyRevision.call(service, revision);
    });
    const before = await store.get(actor);
    const committed = await executeAndNotify({ actor, session, origin }, command(before, actor, 'create_round'));
    expect((await persistedReads[0]).rounds).toEqual(committed.rounds);
    expect(listener.events.at(-1)).toEqual({ type: 'revision', revision: committed.version });
    await expect(executeAndNotify({ actor, session, origin }, command(before, actor, 'refresh'))).rejects.toMatchObject({ code: 'conflict' });
    expect(notify).toHaveBeenCalledTimes(1);
    await executeAndNotify({ actor, session, origin }, command(committed, actor, 'save_draft', { text: 'Do not broadcast this draft', snapshotId: committed.snapshot.id, draftVersion: 0 }));
    expect(listener.events.at(-1)).toEqual({ type: 'revision', revision: committed.version });
    expect(JSON.stringify(listener.events)).not.toContain('Do not broadcast this draft');
    await Promise.all(persistedReads);
    notify.mockRestore();
  });
});

describe('room HTTP credential boundary', () => {
  it('AC-SPR-001.4: GET/POST session and factory handlers reject invalid Bearer instead of falling back to the Maya cookie', async () => {
    process.env.FACTORY_MODE = 'fixture';
    process.env.FACTORY_DATA_DIR = await temporaryDirectory();
    const invalid = `Bearer ${'x'.repeat(43)}`;
    const calls = [
      () => sessionGET(request('/api/room/session', 'GET', undefined, invalid)),
      () => sessionPOST(request('/api/room/session', 'POST', { action: 'fork' }, invalid)),
      () => factoryGET(request('/api/factory', 'GET', undefined, invalid)),
      () => factoryPOST(request('/api/factory', 'POST', {}, invalid)),
    ];
    for (const call of calls) {
      const response = await call();
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: { code: 'session_invalid' } });
    }
    const malformed = await factoryGET(request('/api/factory', 'GET', undefined, 'Bearer short'));
    expect(malformed.status).toBe(401);
    expect(await malformed.json()).toMatchObject({ error: { code: 'session_required' } });
    const missing = await sessionGET(request('/api/room/session'));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: { code: 'session_required' } });
    const cookieOnly = await factoryGET(request('/api/factory'));
    expect(cookieOnly.status).toBe(200);
    expect(await cookieOnly.json()).toMatchObject({ principal: { id: 'maya' } });
  });

  it('AC-SPR-001.2/.3/.4: routes require explicit enter, restore each tab and fork without revoking the original', async () => {
    process.env.FACTORY_MODE = 'fixture';
    process.env.FACTORY_DATA_DIR = await temporaryDirectory();
    const absent = await sessionPOST(request('/api/room/session', 'POST', { action: 'enter' }));
    expect(absent.status).toBe(400);
    const entered = await sessionPOST(request('/api/room/session', 'POST', { action: 'enter', participantId: 'alex' }));
    expect(entered.status).toBe(201);
    const { session } = await entered.json();
    const authorization = `Bearer ${session.token}`;
    const restored = await sessionGET(request('/api/room/session', 'GET', undefined, authorization));
    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ session: { sessionId: session.sessionId, participantId: 'alex' } });
    const forked = await sessionPOST(request('/api/room/session', 'POST', { action: 'fork' }, authorization));
    expect(forked.status).toBe(201);
    const { session: fork } = await forked.json();
    expect(fork.participantId).toBe('alex');
    expect(fork.sessionId).not.toBe(session.sessionId);
    const left = await sessionPOST(request('/api/room/session', 'POST', { action: 'leave' }, `Bearer ${fork.token}`));
    expect(left.status).toBe(200);
    expect((await sessionGET(request('/api/room/session', 'GET', undefined, authorization))).status).toBe(200);
    const revoked = await sessionGET(request('/api/room/session', 'GET', undefined, `Bearer ${fork.token}`));
    expect(revoked.status).toBe(401);
    expect(await revoked.json()).toMatchObject({ error: { code: 'session_revoked' } });
  });
});
