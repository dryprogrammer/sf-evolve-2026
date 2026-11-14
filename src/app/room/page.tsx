'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { FactoryView } from '@/lib/contracts';
import type { PresenceEntry, RoomEvent } from '@/lib/room';
import WorkInspector, { type SyncRequest } from '@/components/WorkInspector';
import FactoryScene, { type PositionCorrection } from '@/components/factory/FactoryScene';
import type { Point, RemoteAvatar, SceneState } from '@/components/factory/world';
import '../factory.css';
import '../native.css';
import './room.css';

/** Per-tab credential: sessionStorage, never a cookie or URL. Refresh restores; other tabs are independent. */
const STORAGE_KEY = 'factory-room-session';
const CHANNEL = 'factory-room-tabs';
interface Stored { token: string; sessionId: string; participantId: string; expiresAt: string; }
const PEOPLE = [
  { id: 'maya', name: 'Maya', role: 'Sales Operations · review coordinator' },
  { id: 'alex', name: 'Alex', role: 'Finance' },
  { id: 'river', name: 'River', role: 'Engineering' },
];
const firstName = (id: string) => PEOPLE.find(p => p.id === id)?.name ?? id;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function json(response: Response) { const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error?.message ?? 'The room request failed.'); return data; }

export default function RoomPage() {
  const [session, setSession] = useState<Stored | null>(null);
  const [phase, setPhase] = useState<'checking' | 'entry' | 'room'>('checking');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const current = useRef<Stored | null>(null); current.current = session;
  const tabId = useRef('');

  // Answer duplicate-tab probes: a copied credential must fork rather than share one avatar.
  useEffect(() => {
    tabId.current = crypto.randomUUID();
    const channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = event => { const m = event.data; if (m?.type === 'probe' && m.tabId !== tabId.current && m.sessionId === current.current?.sessionId) channel.postMessage({ type: 'claimed', sessionId: m.sessionId, tabId: m.tabId }); };
    let cancelled = false;
    (async () => {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) { setPhase('entry'); return; }
      let stored: Stored;
      try { stored = JSON.parse(raw); } catch { sessionStorage.removeItem(STORAGE_KEY); setPhase('entry'); return; }
      let claimed = false;
      const listener = (event: MessageEvent) => { if (event.data?.type === 'claimed' && event.data.tabId === tabId.current) claimed = true; };
      channel.addEventListener('message', listener);
      channel.postMessage({ type: 'probe', sessionId: stored.sessionId, tabId: tabId.current });
      await sleep(250);
      channel.removeEventListener('message', listener);
      if (cancelled) return;
      const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${stored.token}` };
      try {
        if (claimed) {
          const data = await json(await fetch('/api/room/session', { method: 'POST', headers: auth, body: JSON.stringify({ action: 'fork' }) }));
          adopt(data.session); setNotice(`Duplicated tab: this tab has its own new ${firstName(data.session.participantId)} demo session.`);
        } else {
          const response = await fetch('/api/room/session', { headers: { Authorization: auth.Authorization }, cache: 'no-store' });
          if (response.status === 401) { sessionStorage.removeItem(STORAGE_KEY); setNotice('Your previous room session ended. Choose who to enter as.'); setPhase('entry'); return; }
          const data = await json(response);
          adopt({ ...stored, ...data.session, token: stored.token });
        }
      } catch (e) { setNotice(e instanceof Error ? e.message : 'Unable to restore the room session.'); setPhase('entry'); }
    })();
    return () => { cancelled = true; channel.close(); };
  }, []);

  function adopt(next: Stored) {
    const stored = { token: next.token, sessionId: next.sessionId, participantId: next.participantId, expiresAt: next.expiresAt };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(stored)); setSession(stored); setPhase('room');
  }
  async function enter(participantId: string) {
    setBusy(true); setNotice('');
    try { const data = await json(await fetch('/api/room/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'enter', participantId }) })); adopt(data.session); }
    catch (e) { setNotice(e instanceof Error ? e.message : 'Unable to enter.'); }
    finally { setBusy(false); }
  }
  const ended = useCallback((message: string) => { sessionStorage.removeItem(STORAGE_KEY); setSession(null); setPhase('entry'); setNotice(message); }, []);
  async function leave() {
    const stored = current.current; if (!stored) return;
    setBusy(true);
    // Clear protected state immediately; a lost leave response still expires server-side.
    ended('You left the room. Other sessions are unaffected.');
    try { await fetch('/api/room/session', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${stored.token}` }, body: JSON.stringify({ action: 'leave' }) }); } catch { /* best effort */ }
    finally { setBusy(false); }
  }

  return <div className="room-app">
    <header className="room-header">
      <a className="room-back" href="/">← Work Orders</a>
      <h1>Project Room <small>learn sf · DEMO-1</small></h1>
      <span className="room-demo-badge">Demo identities — simulated, not authenticated accounts</span>
      {session && <div className="room-identity"><span data-testid="room-identity">You are <strong>{firstName(session.participantId)}</strong> (demo)</span><button onClick={leave} disabled={busy}>Leave room</button></div>}
    </header>
    {notice && <p className="room-notice" role="status">{notice}</p>}
    {phase === 'checking' && <p className="room-checking">Checking this tab’s room session…</p>}
    {phase === 'entry' && <section className="room-entry" aria-labelledby="room-entry-title">
      <h2 id="room-entry-title">Who is in this tab?</h2>
      <p>Each browser tab is an independent demo session. Choosing here never changes anyone else’s tab. Nobody is selected automatically.</p>
      <div className="room-entry-choices">{PEOPLE.map(p => <button key={p.id} disabled={busy} onClick={() => enter(p.id)}><strong>Enter as {p.name}</strong><span>{p.role}</span><em>Simulated demo identity</em></button>)}</div>
    </section>}
    {phase === 'room' && session && <Room key={session.sessionId} session={session} onEnded={ended} />}
  </div>;
}

function Room({ session, onEnded }: { session: Stored; onEnded: (message: string) => void }) {
  const api = useCallback((path: string, init: RequestInit = {}) => fetch(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${session.token}` } }), [session.token]);
  const [view, setView] = useState<FactoryView | null>(null);
  const [roster, setRoster] = useState<PresenceEntry[]>([]);
  const [link, setLink] = useState<'connecting' | 'live' | 'stale'>('connecting');
  const [sync, setSync] = useState<SyncRequest | null>(null);
  const [correction, setCorrection] = useState<PositionCorrection | null>(null);
  const remotes = useRef<RemoteAvatar[]>([]);
  const presence = useRef(new Map<string, PresenceEntry>());
  const instance = useRef(''), eventSeq = useRef(0), revision = useRef(-1);
  const moveSeq = useRef(0), lastSent = useRef<{ x: number; y: number; at: number }>({ x: NaN, y: NaN, at: 0 }), inflight = useRef(false);
  const endedRef = useRef(onEnded); endedRef.current = onEnded;

  const publishRoster = useCallback(() => {
    const all = [...presence.current.values()];
    remotes.current = all.filter(e => e.sessionId !== session.sessionId).map(e => ({ sessionId: e.sessionId, participantId: e.participantId, label: `${firstName(e.participantId)} (demo)`, x: e.x, y: e.y, facing: e.facing, connected: e.connected }));
    setRoster(all);
  }, [session.sessionId]);

  const handle = useCallback((event: RoomEvent) => {
    if (event.type === 'hello') {
      // Fresh authorized snapshot on every (re)connect; a new instance means the server restarted.
      instance.current = event.instanceId; eventSeq.current = event.seq;
      presence.current = new Map(event.presence.map(e => [e.sessionId, e]));
      const own = presence.current.get(session.sessionId);
      if (own) { moveSeq.current = Math.max(moveSeq.current, own.seq); setCorrection({ point: { x: own.x, y: own.y }, nonce: Date.now() }); }
      publishRoster(); setLink('live'); setSync({ nonce: Date.now() });
    } else if (event.type === 'presence') {
      if (event.seq <= eventSeq.current) return; eventSeq.current = event.seq;
      presence.current.set(event.entry.sessionId, event.entry); publishRoster();
    } else if (event.type === 'presence_removed') {
      if (event.seq <= eventSeq.current) return; eventSeq.current = event.seq;
      presence.current.delete(event.sessionId); publishRoster();
    } else if (event.type === 'revision') {
      if (event.revision > revision.current) { revision.current = event.revision; setSync({ nonce: Date.now(), revision: event.revision }); }
    } else if (event.type === 'session_revoked') endedRef.current('This room session was ended.');
  }, [publishRoster, session.sessionId]);

  // Authorized fetch-based SSE with reconnect; any interruption marks the view stale.
  useEffect(() => {
    let stop = false, controller: AbortController | undefined, attempt = 0;
    // Browsers may keep an SSE reader pending across a network outage. Force a
    // fresh authorized hello on either transition instead of leaving it half-open.
    const networkChanged = () => { setLink('stale'); controller?.abort(); };
    window.addEventListener('offline', networkChanged);
    window.addEventListener('online', networkChanged);
    (async () => {
      while (!stop) {
        controller = new AbortController();
        try {
          const response = await api('/api/room/events', { signal: controller.signal, cache: 'no-store' });
          if (response.status === 401) { endedRef.current('Your room session ended. Enter again.'); return; }
          if (!response.ok || !response.body) throw new Error('stream unavailable');
          attempt = 0;
          const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            buffer += decoder.decode(value, { stream: true }); let index;
            while ((index = buffer.indexOf('\n\n')) >= 0) {
              const chunk = buffer.slice(0, index); buffer = buffer.slice(index + 2);
              const data = chunk.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
              if (data) { try { handle(JSON.parse(data)); } catch { /* ignore malformed */ } }
            }
          }
        } catch { /* fall through to reconnect */ }
        if (stop) return;
        setLink('stale'); attempt++;
        await sleep(Math.min(5000, 400 * attempt));
      }
    })();
    return () => {
      stop = true; controller?.abort();
      window.removeEventListener('offline', networkChanged);
      window.removeEventListener('online', networkChanged);
    };
  }, [api, handle]);

  // Five-second heartbeats; periodic reconciliation covers any missed revision notifications.
  useEffect(() => {
    const beat = setInterval(async () => {
      try { const r = await api('/api/room/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }); if (r.status === 401) endedRef.current('Your room session ended. Enter again.'); } catch { setLink('stale'); }
    }, 5000);
    const reconcile = setInterval(() => setSync({ nonce: Date.now() }), 20000);
    return () => { clearInterval(beat); clearInterval(reconcile); };
  }, [api]);

  const onPosition = useCallback((point: Point, facing: SceneState['facing']) => {
    const now = performance.now(), last = lastSent.current;
    if (inflight.current || now - last.at < 100 || (Math.abs(point.x - last.x) < .5 && Math.abs(point.y - last.y) < .5)) return;
    inflight.current = true; lastSent.current = { x: point.x, y: point.y, at: now };
    const body = JSON.stringify({ x: Math.round(point.x * 10) / 10, y: Math.round(point.y * 10) / 10, facing, seq: ++moveSeq.current });
    api('/api/room/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }).then(async r => {
      if (r.status === 401) { endedRef.current('Your room session ended. Enter again.'); return; }
      const data = await r.json();
      if (data.accepted === false && data.entry) {
        if (data.reason === 'stale') moveSeq.current = Math.max(moveSeq.current, data.entry.seq);
        if (data.reason === 'blocked' || data.reason === 'too_far') setCorrection({ point: { x: data.entry.x, y: data.entry.y }, nonce: Date.now() });
      }
    }).catch(() => setLink('stale')).finally(() => { inflight.current = false; });
  }, [api]);

  const round = view?.rounds.at(-1);
  const responsibility = (participantId: string) => {
    if (!view || !round) return 'No review assignment';
    const assignments = round.assignments.filter(a => a.reviewerId === participantId);
    if (round.decisionMakerId === participantId && !assignments.length) return round.decision ? `Decision recorded: ${round.decision.outcome.replaceAll('_', ' ')}` : 'Decision-maker';
    if (!assignments.length) return 'No review assignment';
    const open = assignments.filter(a => round.signoffs.filter(s => s.assignmentId === a.id && s.generation === a.generation).at(-1)?.outcome !== 'approve').length;
    return open ? `${open} sign-off${open === 1 ? '' : 's'} not yet approved` : 'Assigned sign-offs approved';
  };
  const people = PEOPLE.map(p => ({ ...p, sessions: roster.filter(e => e.participantId === p.id) }));

  return <div className="room-layout">
    {link !== 'live' && <p className="room-stale" role="alert" data-testid="room-link">{link === 'connecting' ? 'Connecting to the shared room…' : 'Disconnected — the shared view may be out of date. Reconnecting…'}</p>}
    {link === 'live' && <p className="sr-only" data-testid="room-link">Live</p>}
    <section className="room-floor" aria-label="Shared factory floor">
      <FactoryScene view={view} request={null} paused={false} onNearby={() => {}} onInspect={() => document.getElementById('room-inspector')?.focus()} roomMode remotes={remotes} onPosition={onPosition} correction={correction} />
      <p className="room-presence-note">Presence shows only who is connected and where they stand. It never means assignment progress, approval or agent execution.</p>
    </section>
    <aside className="room-side">
      <section className="room-roster" aria-labelledby="roster-title">
        <h2 id="roster-title">People in this room</h2>
        <ul>{people.map(p => <li key={p.id} data-testid={`roster-${p.id}`}>
          <div><strong>{p.name}</strong> <span className="room-demo-tag">demo</span>{p.id === session.participantId && <span className="room-you">you</span>}</div>
          <div className="room-connectivity" data-state={p.sessions.some(s => s.connected) ? 'connected' : p.sessions.length ? 'offline' : 'absent'}>Presence: {p.sessions.some(s => s.connected) ? `connected${p.sessions.filter(s => s.connected).length > 1 ? ` in ${p.sessions.filter(s => s.connected).length} tabs` : ''}` : p.sessions.length ? 'offline' : 'not in room'}</div>
          <div className="room-work">Review (persisted): {responsibility(p.id)}</div>
        </li>)}</ul>
      </section>
      <section id="room-inspector" tabIndex={-1} className="room-inspector" aria-label="Shared work inspector">
        <WorkInspector api={api} syncRequest={sync} onViewChange={setView} onBlockedChange={() => {}} personaRequest={null} onAccessLost={m => endedRef.current(m)} />
      </section>
    </aside>
  </div>;
}
