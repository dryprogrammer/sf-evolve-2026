import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { FactoryError, principals, type Principal } from './contracts';
import { SPAWN, walkable, type Point } from '../components/factory/world';

/** Only these fictional humans may enter the demo room. Agents cannot claim a room seat. */
export const ROOM_PARTICIPANTS = ['maya', 'alex', 'river'] as const;
export type ParticipantId = typeof ROOM_PARTICIPANTS[number];
export type Facing = 'down' | 'up' | 'left' | 'right';
export const HEARTBEAT_TIMEOUT_MS = 15_000;
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const MIN_MOVE_INTERVAL_MS = 80; // At most ~10 accepted updates per second per session.
const DISCONNECTED_RETENTION_MS = 60_000;

export interface RoomSession { sessionId: string; participantId: ParticipantId; projectId: string; identityMode: 'demo'; expiresAt: string; }
export interface IssuedSession extends RoomSession { token: string; }
export interface PresenceEntry { sessionId: string; participantId: ParticipantId; name: string; x: number; y: number; facing: Facing; connected: boolean; seq: number; }
export type RoomEvent =
  | { type: 'hello'; instanceId: string; sessionId: string; seq: number; presence: PresenceEntry[] }
  | { type: 'presence'; seq: number; entry: PresenceEntry }
  | { type: 'presence_removed'; seq: number; sessionId: string }
  | { type: 'revision'; revision: number }
  | { type: 'session_revoked' };
interface Subscriber { session: RoomSession; send: (event: RoomEvent) => boolean; close: () => void; }
interface Presence extends PresenceEntry { lastSeen: number; lastMove: number; }

const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const START: Record<ParticipantId, Point> = { maya: { x: SPAWN.x - 40, y: SPAWN.y }, alex: { x: SPAWN.x, y: SPAWN.y }, river: { x: SPAWN.x + 40, y: SPAWN.y } };

/**
 * Demo project room: revocable per-tab sessions (persisted), presence (memory only)
 * and post-commit revision notifications. One Node process, one PGlite writer.
 */
export class RoomService {
  /** Changes on every process start so clients can detect lost in-memory state. */
  readonly instanceId = randomUUID();
  private presence = new Map<string, Presence>();
  private subscribers = new Set<Subscriber>();
  private revoked = new Set<string>();
  private seq = 0;
  private sweeper?: ReturnType<typeof setInterval>;
  constructor(private db: PGlite, private ready: Promise<void>, readonly projectId: string, private now: () => number = Date.now) {}

  start() { if (!this.sweeper) { this.sweeper = setInterval(() => this.sweep(), 1000); this.sweeper.unref?.(); } return this; }
  stop() { if (this.sweeper) clearInterval(this.sweeper); this.sweeper = undefined; for (const s of this.subscribers) s.close(); this.subscribers.clear(); }

  /** Explicit selection only; there is no default identity. Each call issues a new session. */
  async enter(participantId: unknown): Promise<IssuedSession> {
    if (typeof participantId !== 'string' || !(ROOM_PARTICIPANTS as readonly string[]).includes(participantId)) throw new FactoryError('validation', 'Choose Maya, Alex or River to enter the demo room.');
    await this.ready;
    const token = randomBytes(32).toString('base64url'), sessionId = randomUUID();
    const expiresAt = new Date(this.now() + SESSION_TTL_MS).toISOString();
    await this.db.query('INSERT INTO room_sessions (session_id,token_hash,participant_id,project_id,identity_mode,created_at,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)', [sessionId, hash(token), participantId, this.projectId, 'demo', new Date(this.now()).toISOString(), expiresAt]);
    return { token, sessionId, participantId: participantId as ParticipantId, projectId: this.projectId, identityMode: 'demo', expiresAt };
  }

  /** Resolve an `Authorization: Bearer` header to a live session. Never falls back to another identity. */
  async resolve(authorization: string | null): Promise<RoomSession> {
    const token = /^Bearer ([A-Za-z0-9_-]{20,200})$/.exec(authorization ?? '')?.[1];
    if (!token) throw new FactoryError('session_required', 'Enter the room as a demo participant first.', 401);
    await this.ready;
    const row = (await this.db.query<{ session_id: string; participant_id: ParticipantId; project_id: string; expires_at: string | Date; revoked_at: string | Date | null }>('SELECT session_id,participant_id,project_id,expires_at,revoked_at FROM room_sessions WHERE token_hash=$1', [hash(token)])).rows[0];
    if (!row) throw new FactoryError('session_invalid', 'This room session is unknown. Enter again.', 401);
    if (row.revoked_at || this.revoked.has(row.session_id)) throw new FactoryError('session_revoked', 'This room session was ended. Enter again.', 401);
    const expiresAt = new Date(row.expires_at);
    if (expiresAt.getTime() <= this.now()) throw new FactoryError('session_expired', 'This room session expired. Enter again.', 401);
    if (row.project_id !== this.projectId) throw new FactoryError('denied', 'This session is not permitted in this project room.', 403);
    return { sessionId: row.session_id, participantId: row.participant_id, projectId: row.project_id, identityMode: 'demo', expiresAt: expiresAt.toISOString() };
  }

  principal(session: RoomSession): Principal { return principals.find(p => p.id === session.participantId)!; }

  /** Revoke only this session; other sessions, even for the same participant, are unaffected. */
  async leave(session: RoomSession) {
    await this.db.query('UPDATE room_sessions SET revoked_at=$2 WHERE session_id=$1 AND revoked_at IS NULL', [session.sessionId, new Date(this.now()).toISOString()]);
    this.revoked.add(session.sessionId);
    for (const s of [...this.subscribers]) if (s.session.sessionId === session.sessionId) { s.send({ type: 'session_revoked' }); s.close(); this.subscribers.delete(s); }
    if (this.presence.delete(session.sessionId)) this.broadcast({ type: 'presence_removed', seq: ++this.seq, sessionId: session.sessionId });
  }

  private entry(p: Presence): PresenceEntry { const { lastSeen: _s, lastMove: _m, ...entry } = p; return { ...entry }; }
  snapshot(): PresenceEntry[] { return [...this.presence.values()].map(p => this.entry(p)); }

  /** Join or heartbeat. Connectivity is all presence means: not progress, approval or execution. */
  heartbeat(session: RoomSession): PresenceEntry {
    let p = this.presence.get(session.sessionId);
    const now = this.now();
    if (!p) {
      const start = START[session.participantId];
      p = { sessionId: session.sessionId, participantId: session.participantId, name: this.principal(session).name, x: start.x, y: start.y, facing: 'down', connected: true, seq: 0, lastSeen: now, lastMove: 0 };
      this.presence.set(session.sessionId, p);
      this.publish(p);
    } else {
      p.lastSeen = now;
      if (!p.connected) { p.connected = true; this.publish(p); }
    }
    return this.entry(p);
  }

  /**
   * Movement is bound to the resolved session, so one session cannot move another.
   * Blocked, too-fast, out-of-order or too-frequent updates keep the last accepted position.
   */
  move(session: RoomSession, input: { x?: unknown; y?: unknown; facing?: unknown; seq?: unknown }): { accepted: boolean; entry: PresenceEntry; reason?: string } {
    this.heartbeat(session);
    const p = this.presence.get(session.sessionId)!, now = this.now();
    const reject = (reason: string) => ({ accepted: false, entry: this.entry(p), reason });
    const { x, y, facing, seq } = input;
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isSafeInteger(seq) || !['down', 'up', 'left', 'right'].includes(facing as string)) return reject('invalid');
    if ((seq as number) <= p.seq) return reject('stale');
    if (now - p.lastMove < MIN_MOVE_INTERVAL_MS) return reject('rate_limited');
    if (!walkable({ x, y })) return reject('blocked');
    const elapsed = p.lastMove ? (now - p.lastMove) / 1000 : 1;
    if (Math.hypot(x - p.x, y - p.y) > 48 + 220 * Math.min(elapsed, 2)) return reject('too_far');
    Object.assign(p, { x, y, facing, seq, lastMove: now, lastSeen: now, connected: true });
    this.publish(p);
    return { accepted: true, entry: this.entry(p) };
  }

  /** Mark sessions without a heartbeat for 15 seconds as disconnected; later forget them. */
  sweep() {
    const now = this.now();
    for (const p of [...this.presence.values()]) {
      if (p.connected && now - p.lastSeen >= HEARTBEAT_TIMEOUT_MS) { p.connected = false; this.publish(p); }
      else if (!p.connected && now - p.lastSeen >= HEARTBEAT_TIMEOUT_MS + DISCONNECTED_RETENTION_MS) { this.presence.delete(p.sessionId); this.broadcast({ type: 'presence_removed', seq: ++this.seq, sessionId: p.sessionId }); }
    }
  }

  /** Called only after a durable commit. Carries the revision number, never projections or drafts. */
  notifyRevision(revision: number) { this.broadcast({ type: 'revision', revision }); }

  subscribe(session: RoomSession, send: Subscriber['send'], close: Subscriber['close']): () => void {
    const subscriber: Subscriber = { session, send, close };
    // Join first (broadcast to others), then hand this client a snapshot at a known sequence.
    this.heartbeat(session);
    this.subscribers.add(subscriber);
    if (!send({ type: 'hello', instanceId: this.instanceId, sessionId: session.sessionId, seq: this.seq, presence: this.snapshot() })) {
      close();
      this.subscribers.delete(subscriber);
    }
    return () => { this.subscribers.delete(subscriber); };
  }
  subscriberCount() { return this.subscribers.size; }

  private publish(p: Presence) { this.broadcast({ type: 'presence', seq: ++this.seq, entry: this.entry(p) }); }
  private broadcast(event: RoomEvent) {
    const now = this.now();
    for (const s of [...this.subscribers]) {
      // Recheck access on every delivery: revoked or expired sessions stop receiving.
      if (this.revoked.has(s.session.sessionId) || new Date(s.session.expiresAt).getTime() <= now || s.session.projectId !== this.projectId) { s.close(); this.subscribers.delete(s); continue; }
      // A slow client whose queue overflows is dropped; it must reconnect and resync.
      if (!s.send(event)) { s.close(); this.subscribers.delete(s); }
    }
  }
}
