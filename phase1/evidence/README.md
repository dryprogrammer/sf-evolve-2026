# Phase 1 feasibility evidence — native access blocked, live fallback proven

**No Phase 2 work has begun. No virtual-world files were modified.**

## Verified
- Working read-only live inspector, capturing actual 8090 exec starts, intermediate shell output and tool completions.
- Parent plus real subagent execution overlapped **7.278159 seconds**, verified by command metadata. Identity binding must use command/conversation IDs: both agents shared a generation ID.
- Initial run captured **236/236 expected producer-stamped markers**: p50 **104 ms**, p95 **242 ms**, maximum **255 ms**, at 250 ms polling.
- Hardened follow-up captured **40/40 markers**, p95 **248 ms**, with **zero capture or persistence errors**.
- Initial collector: average scan **5.41 ms**, RSS **71.2 MiB**, CPU ~**1.68% of one core**. This is resource overhead, not a controlled agent-throughput comparison.
- **14 automated tests pass**, covering capture, reconnect, restart gaps, malformed metadata, UTF-8 and identity handling. Browser verified the live inspector and disabled steering control.

## CDP correction and new empirical evidence
- The earlier **401 was a new unauthenticated Node API request**, not a response from local CDP interception. It does not rule out passive capture of an authenticated browser stream.
- Independent Chromium **157.0.8103.78** successfully used `Network.streamResourceContent` to capture incremental bytes from a browser **Fetch** stream.
- **6/6 unique markers arrived before the Fetch response completed**; marker-to-CDP latency **157–162 ms**, including the inspector's existing local polling overhead. No remote API requests or credential inspection/export.
- Source remains actual local exec output: this is proof of the **CDP mechanism**, not authenticated native model tokens. See `cdp-local-probe.json` and the reproducible `phase1/cdp-probe.mjs`.
- Remaining native prerequisite: a reachable, authorized debugger connection to a **signed-in 8090 conversation tab**. The managed browser listed only the inspector and its wrapper then failed/stayed `SCRIPT_BUSY`; a separate disposable browser does not inherit the user's application login.

## Model-output extension
- **Five genuine assistant messages** are now visible in the model-output panel, including audit progress and a fresh model-written reviewer response.
- Source: supported `read_agent_conversation` reads of conversation `a538b4eb-cf24-5ff4-a694-7f8973b4d0b0`. Selected text is copied without rewriting and imported by the agent.
- **Snapshot delivery, not live model tokens**: new imports are pushed to the UI through the inspector's SSE feed, but native model generation is not subscribed to. Refresh requires another read/import.
- Import/capture timestamps are real. Per-message generation timestamps, native event IDs and model-generation latency are unavailable and not invented. This does not establish agent-turn completion.
- Provenance depends on the trusted importer; supplied metadata is not independently signed. The committed source text and captured events provide auditable evidence of this demonstration, not an authentication mechanism.
- The reviewer identified a concurrent-writer bug in the first version. It is fixed with a writer lock and covered by tests; the original response remains unedited as a historical snapshot.

## Not verified / unavailable
- Native SSE requests returned **401 SofaNotAuthenticated**; browser redirected to login. This proves an authentication barrier, not that streaming is impossible.
- Shipped frontend contains resumable SSE, content/tool events, terminal `done`/status, queue and steering contracts. These are **static integration leads**, not proven runtime capabilities.
- Shell completion is **not agent-turn completion**. Genuine turn-completion fallback updates are unavailable here.
- Mid-turn versus between-turn steering, instruction consumption/effect, all-agent discovery and cross-workspace monitoring remain unverified. No control instructions were sent.
- Initial run logged **143 transient read errors** whose source was not differentiated. No expected marker loss occurred; the hardened run adds categorized diagnostics. Do not hide the initial errors.

## Recommendation and gate
Prioritize passive CDP capture from the authenticated app’s native resumable SSE, with workspace exec as a narrowly labeled fallback. The approved [Phase 1 — Live Supervision Acceptance Gate](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/knowledge-base/d3155727-18c5-49ae-82e4-403643ee894c) now requires genuine in-turn model evidence, a grounded read-only observer insight, authorized steering consumed during execution and authoritative final reconciliation. Existing shell, imported-snapshot and local-CDP results remain partial proofs; they do not establish that loop. Phase 2 remains paused until the feasibility gate is demonstrated and the user gives separate approval.

Files below provide actual measurements, concurrency lifecycle metadata, authentication rejection, and exact public frontend contract evidence. Full reproduction instructions are in the repository's `phase1/README.md`. Raw runtime logs remain local/gitignored; only selected non-sensitive evidence is published.
