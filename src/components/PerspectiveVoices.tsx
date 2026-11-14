'use client';

import { useEffect, useId, useRef, useState } from 'react';
import './perspective-voices.css';

const perspectives = [
  {
    name: 'Maya', role: 'Sales Ops', emoji: '🧑🏽‍💼', tone: 'Momentum', color: 'sales',
    caption: 'I want to keep the renewal moving. Going from 15% to 20% could help close the deal, but the extra discount and custom payment terms need a human decision—not my enthusiasm.',
  },
  {
    name: 'Alex', role: 'Finance', emoji: '🧑🏻‍💼', tone: 'Margin & cash', color: 'finance',
    caption: 'That extra five percentage points changes the economics. Before anyone accepts 20% or custom payment terms, show the margin impact, payment schedule, and the applicable approval policy.',
  },
  {
    name: 'River', role: 'Engineering', emoji: '🧑🏿‍💻', tone: 'Delivery risk', color: 'engineering',
    caption: 'A discount is not a delivery commitment. Check whether the renewal or custom payment terms imply new integration work or support promises. Keep those obligations explicit before a human decides.',
  },
] as const;

type Props = { evidenceHref?: string };

/** Scripted demo only: no review, approval, service call, or persisted decision. */
export default function PerspectiveVoices({ evidenceHref = '#demo-evidence' }: Props = {}) {
  const headingId = useId();
  const [selected, setSelected] = useState(0);
  const [available, setAvailable] = useState(false);
  const [muted, setMuted] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [status, setStatus] = useState('Voice is off. All scripted captions are available below.');
  const synthesis = useRef<SpeechSynthesis | null>(null);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const generation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cancel only when this module owns an active utterance. Ignore late browser callbacks.
  function cancelVoice() {
    generation.current += 1;
    if (timeout.current !== null) clearTimeout(timeout.current);
    timeout.current = null;
    const owned = utterance.current !== null;
    utterance.current = null;
    if (owned) {
      try { synthesis.current?.cancel(); } catch { /* Captions do not depend on audio. */ }
    }
  }

  useEffect(() => {
    try {
      if ('speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function') {
        const engine = window.speechSynthesis;
        if (typeof engine.speak === 'function' && typeof engine.cancel === 'function') {
          synthesis.current = engine;
          setAvailable(true);
        }
      }
    } catch { /* Restricted browser: remain caption-only. */ }
    if (!synthesis.current) setStatus('Browser voice is unavailable. Read the complete scripted captions below.');
    return cancelVoice;
  }, []);

  function play(index: number, enabled = !muted) {
    cancelVoice();
    setSpeaking(false);
    if (!enabled || !synthesis.current) {
      setStatus('Caption selected. Voice is off; no information is hidden.');
      return;
    }
    const token = generation.current;
    const person = perspectives[index];
    const fail = () => {
      if (generation.current !== token) return;
      cancelVoice();
      setSpeaking(false);
      setStatus('Browser voice could not finish. Captions remain available; replay to try again.');
    };
    try {
      const speech = new window.SpeechSynthesisUtterance(`Fictional scripted perspective. ${person.name}, ${person.role}. ${person.caption}`);
      speech.lang = 'en-US';
      speech.rate = 1;
      speech.onend = () => {
        if (generation.current !== token) return;
        if (timeout.current !== null) clearTimeout(timeout.current);
        timeout.current = null;
        utterance.current = null;
        setSpeaking(false);
        setStatus(`${person.name}'s scripted caption finished. Select another perspective or replay.`);
      };
      speech.onerror = fail;
      utterance.current = speech;
      // Some browsers never fire completion/error events. Never leave controls stuck.
      timeout.current = setTimeout(fail, 45000);
      setSpeaking(true);
      setStatus(`Reading ${person.name}'s fictional script with browser speech synthesis.`);
      synthesis.current.speak(speech);
    } catch { fail(); }
  }

  function select(index: number) {
    setSelected(index);
    play(index);
  }

  function toggleMute() {
    if (muted) {
      setMuted(false);
      play(selected, true); // Explicit user gesture; never autoplay on mount.
    } else {
      cancelVoice();
      setMuted(true);
      setSpeaking(false);
      setStatus('Muted. All scripted captions remain visible.');
    }
  }

  return (
    <section className="perspective-voices" aria-labelledby={headingId}>
      <header className="pv-header">
        <div>
          <p className="pv-eyebrow">Scripted demo · Human decision required</p>
          <h2 id={headingId}>Three perspectives. One human call.</h2>
          <p className="pv-scenario">Renewal request: <strong>15% → 20% discount</strong> + custom payment terms</p>
        </div>
        <span className="pv-badge">Fictional characters</span>
      </header>
      <p className="pv-disclaimer">These are prewritten, contrasting viewpoints—not authority, independent review, or approval. Optional audio uses your browser’s voice, not ElevenLabs. Captions are always visible.</p>
      <div className="pv-cards">
        {perspectives.map((person, index) => (
          <article className={`pv-card pv-${person.color}${selected === index ? ' pv-selected' : ''}`} key={person.name}>
            <div className="pv-person">
              <span className={`pv-avatar${selected === index && speaking ? ' pv-speaking' : ''}`} aria-hidden="true">{person.emoji}</span>
              <div><h3>{person.name} <span>{person.role}</span></h3><p className="pv-tone">{person.tone}</p></div>
            </div>
            <p className="pv-script-label">Fictional · scripted caption</p>
            <blockquote>{person.caption}</blockquote>
            <button type="button" className="pv-select" aria-pressed={selected === index} onClick={() => select(index)}>
              {selected === index ? 'Selected perspective' : `Select ${person.name}`}
            </button>
          </article>
        ))}
      </div>
      <div className="pv-footer">
        <div className="pv-controls" role="group" aria-label="Optional browser voice controls">
          <button type="button" onClick={toggleMute} disabled={!available} aria-pressed={muted}>
            {!available ? 'Voice unavailable' : muted ? 'Enable browser voice' : 'Mute voice'}
          </button>
          <button type="button" onClick={() => { cancelVoice(); setSpeaking(false); setStatus('Stopped. Captions remain visible. Replay when ready.'); }} disabled={!speaking}>Stop</button>
          <button type="button" onClick={() => select((selected + 1) % perspectives.length)}>Skip to next</button>
          <button type="button" onClick={() => play(selected)} disabled={!available || muted}>Replay voice</button>
        </div>
        <a className="pv-evidence" href={evidenceHref}>Inspect source evidence <span aria-hidden="true">↗</span></a>
      </div>
      <p className="pv-status" role="status" aria-live="polite" aria-atomic="true">{status}</p>
    </section>
  );
}
