import { FactoryError, type Command, type FactoryView, type Principal, type Provenance } from './contracts';
import { fixtureOnly, principal as fixturePrincipal } from './http';
import { RoomService, type RoomSession } from './room';
import { store } from './store';

const globalRoom = globalThis as typeof globalThis & { factoryRoom?: RoomService };
/** Demo room exists only in explicit fixture/demo mode, bound to the store's project/work scope. */
export function room(): RoomService {
  fixtureOnly();
  if (!globalRoom.factoryRoom) { const s = store(); globalRoom.factoryRoom = new RoomService(s.db, s.ready, s.scope).start(); }
  return globalRoom.factoryRoom;
}

export interface Actor { actor: Principal; session?: RoomSession; origin: Provenance; }
/**
 * A request carrying a room credential is resolved ONLY from that credential; an
 * invalid one is rejected rather than falling back to the shared persona cookie.
 * Requests without one keep the original single-tab fixture persona behaviour.
 */
export async function resolveActor(request: Request): Promise<Actor> {
  const authorization = request.headers.get('authorization');
  if (authorization !== null) {
    fixtureOnly();
    const session = await room().resolve(authorization);
    return { actor: room().principal(session), session, origin: { mode: 'demo_session', sessionId: session.sessionId } };
  }
  return { actor: fixturePrincipal(request), origin: { mode: 'fixture_persona' } };
}

/** Execute, then notify the room after the transaction committed. Notification failure cannot undo it. */
export async function executeAndNotify(actor: Actor, command: Command): Promise<FactoryView> {
  const view = await store().execute(actor.actor, command, actor.origin);
  try { if (globalRoom.factoryRoom) globalRoom.factoryRoom.notifyRevision(view.version); } catch { /* Periodic client reconciliation covers missed invalidations. */ }
  return view;
}
export function requireSession(actor: Actor): RoomSession { if (!actor.session) throw new FactoryError('session_required', 'Enter the room as a demo participant first.', 401); return actor.session; }
