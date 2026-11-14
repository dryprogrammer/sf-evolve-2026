# Phase 1 — 8090 execution signal feasibility

**Gate: STOP. No Phase 2 work or virtual-world changes.**

Outcome: working **workspace-exec live fallback plus genuine model-written conversation snapshots**, not a verified native 8090 model-token stream. Native streaming is authentication-blocked, not demonstrated impossible. Agent-wide turn-completion updates and steering have **not** been demonstrated. Those parts of Phase 1 remain blocked pending authenticated access.

## Run the inspector

Node 22+, no dependencies, no install or build step. From the repository root:

```sh
node phase1/server.mjs
# Open http://127.0.0.1:4318 in the same workspace/browser.
# In another terminal, or through an active agent's exec tool:
node phase1/workload.mjs
node --test phase1/test/*.test.mjs
node phase1/probe.mjs
node phase1/measure.mjs
```

The workload hashes real implementation files and runs real tests, emitting explicitly timestamped verification markers. It is a test workload, **not simulated agent behavior**. Invoking it directly in an ordinary terminal does not generate 8090 exec metadata: use an active agent's `exec` tool for the live integration test. The test suite uses clearly labeled temporary lifecycle fixtures; those are not live-agent evidence.

`COMMAND_ROOT` defaults to `/tmp/commands`, the **observed internal workspace exec-tool implementation**, not a public 8090 API. Ordinary developer machines need equivalent real metadata/logs; the inspector does not invent them. A missing directory is visible in error metrics. Default startup skips existing history; `INCLUDE_HISTORY=1` explicitly replays it as historical.

Optional settings: `INSPECTOR_PORT`, `INSPECTOR_HOST` (loopback by default), `INSPECTOR_DATA_DIR`, and `COMMAND_AGENT_MAP_PATH`. The identity file is JSON mapping **command UUIDs → confirmed conversation labels**. Replace it atomically. Generation IDs are insufficient: a parent and subagent shared the same generation in the real test. `AGENT_MAP` is only appropriate where a generation-to-agent association is independently established; otherwise labels remain `workspace-generation:…`.

Read-only endpoints: `/events` (SSE), `/api/events`, `/api/metrics`. The browser has a prominent model-output panel, agent/generation filtering, pause/resume, raw-event inspection, evidence export and disconnection/replay-gap indicators. Steering is deliberately disabled. Serve the HTML from this local server; the Knowledge Base HTML copy does not supply a capture backend or cross-origin access.

## Verified versus unverified

| Capability | Empirical status |
|---|---|
| Real shell-tool starts/completions | Verified from actual 8090 exec metadata (`started_at`, `ended_at`, exit status) |
| Live intermediate shell output | Verified by tailing actual exec `output.log`; not all intermediate model output |
| Timestamps/latency | Capture timestamps on every event; lifecycle producer timestamps from metadata; output latency only measurable for explicit producer-stamped test markers |
| Two actual agents at once | Parent and subagent commands overlapped 7.278159 seconds in one shared workspace; outputs from both captured |
| Arbitrary agents across workspaces/users | Not verified; no global discovery/credentials available |
| Model-written assistant progress and answers | Verified via `read_agent_conversation` and agent-assisted snapshot import; not continuous/token-by-token streaming |
| Native tool calls, content deltas, turn end | Shipped frontend contains these contracts; authenticated delivery unverified |
| Agent running/idle state | Not inferred from shell activity; unavailable in fallback |
| Genuine agent-turn completion fallback | Not available from shell logs. Tool completion is **not** turn completion |
| Mid-execution steering | Frontend exposes `steer_message`, queued messages and `send_now`; actual timing/consumption unverified |
| Between-turn input/stop | Frontend contracts exist; actual authorization and behavior unverified; no instructions sent |

### Native integration investigation

The public app config reports version **0.60.4**. Its shipped frontend uses:

- `POST https://api.factory.8090.dev/v2/project/{projectId}/agents/chat-agent/stream` with `conversation_id`, `last_event_id`, `tail_user_messages`.
- SSE IDs and reconnect cursors; history/status/queue/heartbeat control frames.
- Durable content, tool-call/result, subagent and completion events, including `done` and non-streaming `status`.
- `/agents/{agentId}/input` actions including send message, queue management, send now and stop.
- A separate awareness stream at `/v2/awareness/stream`; useful lead for discovery, **not tested for global agent coverage**.

Browser navigation to the current conversation redirected to `/auth`. A read-only native stream probe returned **401 SofaNotAuthenticated**. No credentials were extracted and no write/control requests were made. Available agent tools can list/read conversation history, including tool activity, but expose no agent-send/steer action or app-callable live subscription. List status `Active` means unarchived conversation, **not executing**. Conversation read output is paginated/truncated history, not a verified turn-completion signal.

Frontend acknowledgement distinguishes accepted/queued/started from later `user_message`/`steer_message` consumption. Thus **acceptance is not proof of consumption**, and neither proves the model complied. Need a controlled authenticated test to distinguish mid-turn handling, tool-boundary handling and between-turn delivery. Static contracts may change; they are not supported public API guarantees. See `evidence/static-contracts.json` for exact bundle URL, SHA-256 and snippets; `evidence/native-probe.json` for the runtime rejection.

## CDP investigation — correction to the original blocker

**The recorded 401 was from `phase1/probe.mjs`: a separate unauthenticated Node `fetch` to the remote agent API. It was not a local CDP response, nor the result of passively intercepting an authenticated browser request. That probe does not rule out CDP streaming.**

A browser-attached observer can capture the app's already-authenticated response without obtaining an API token or issuing a duplicate API request. Authentication belongs to the page's HTTP request; it is not required again to read that request's traffic via an authorized local debugger connection. If the page itself receives a 401, CDP will faithfully report it—but CDP does not create that authentication failure.

### Verified CDP mechanism

An independent disposable Chromium **157.0.8103.78** captured real incremental data from the running inspector using **`Network.streamResourceContent` on a browser Fetch response**. All **6/6 unique probe markers** were received while the HTTP response was still open, **before `Network.loadingFinished`**. Marker-to-CDP latency was **157–162 ms**, including the existing filesystem polling stage; it is **not native model-token latency**. No remote API requests were made and no credentials were inspected or exported.

This proves the browser/CDP capture mechanism, not authenticated native 8090 model delivery. The source of this test stream remains genuine local exec-tool output forwarded by the inspector. Earlier local-file capture did not itself establish browser-native streaming; this test is separate evidence.

Reproduce from an active 8090 exec tool (the markers must appear in actual exec logs), with the inspector running at its default local URL:

```sh
# Disposable browser only; does not read an existing profile or require secrets.
npx --yes --package @puppeteer/browsers browsers install chrome-headless-shell@stable --path /workspace/phase1-cdp-browser
# Supply the exact executable path returned by that command:
node phase1/cdp-probe.mjs /path/to/chrome-headless-shell
```

The probe uses its own temporary profile and loopback CDP port, attaches before starting the browser Fetch stream, records selected byte/marker evidence, aborts the local stream, and removes the disposable profile. The Node WebSocket client needs no repository package installation. Browser versions differ: `Network.streamResourceContent` is experimental and must be checked on the actual browser. Native `EventSource` events alone are insufficient for the shipped 8090 frontend, which consumes a **POST Fetch stream**. `Network.getResponseBody` is not the incremental mechanism tested here.

### What remains missing

The managed browser inventory listed only the local inspector—not the user's authenticated 8090 application tab. A CDP experiment through `browser_run_code` failed and left that managed browser in `SCRIPT_BUSY`; cancellation and the available open/close tools did not clear it. No public recovery action was exposed. This is a managed-tool failure, not a remote 401 or evidence against CDP. The independent browser experiment above avoided the unavailable wrapper without reading its private transport or profile.

The next native test requires **an authorized CDP connection to a browser containing a signed-in 8090 conversation tab**. The main application session is not automatically shared with a separate workspace/disposable browser. Attach before the page starts or normally reconnects its native stream, then observe existing requests and model `content` deltas through completion. Do not replay the stream unauthenticated or infer that debugger locality supplies page authentication. No token needs to be pasted into chat.

## Model outputs: verified snapshot fallback

The inspector now shows **five genuine assistant messages** from conversation `a538b4eb-cf24-5ff4-a694-7f8973b4d0b0`, read with the supported `read_agent_conversation` tool. They include historical audit progress messages and a fresh model-written review of the Phase 1 inspector. This is user-visible assistant text, **not private reasoning**, and not shell stdout.

Delivery is **agent-assisted import**: the agent reads a conversation, copies selected assistant messages into JSON, and runs the importer. The server watches that local snapshot file and delivers new entries over its existing SSE feed. This is **not autonomous conversation polling, a direct native model subscription, or token-by-token streaming**. The app cannot invoke 8090 agent tools itself. Refresh requires another supported read/import. No permission or authentication barrier is bypassed.

Reproduce the selected genuine historical snapshots:

```sh
# Inspector running with its default data directory:
node phase1/model-snapshots.mjs phase1/evidence/model-output-snapshot-input.json
# Custom destination must match MODEL_SNAPSHOT_FILE or the server's data directory:
node phase1/model-snapshots.mjs INPUT.json .phase1-data/models/model-snapshots.json
```

Input is an array of `{role:"assistant", sourceTool:"read_agent_conversation", conversationId:"UUID", text:"unaltered assistant text"}`. `importedAt` is stamped by the importer; server `capturedAt` is separate. The reader did not supply message event IDs or per-message generation timestamps, so both are left unknown. **No model-generation latency or turn-completion state is inferred.** Content hashes deduplicate repeated reads but also merge identical repeated messages; this is not a full occurrence history.

`MODEL_SNAPSHOT_FILE` defaults to `model-snapshots.json` inside the server's data directory. Imports retain 100 messages and use an exclusive writer lock plus atomic file replacement. A crashed importer can leave a lock; verify it has stopped before manually removing the lock. Snapshot schema validation checks supplied fields, **not cryptographic provenance**: the local importer must be trusted to copy genuine tool results. Text is rendered with `textContent`, not HTML. Test fixtures are labeled and are not used as live evidence.

`evidence/model-output-snapshot-input.json` contains selected text copied from the supported reader; `evidence/model-output-capture.json` verifies all five imported messages reached the inspector unaltered. The review describes the pre-lock version; its concurrent-import issue was subsequently fixed and covered by a test. The demonstration recording shows snapshots appearing on import, **not live model generation**.

## Empirical measurements

`evidence/live-measurement.json` contains 236 genuine producer-stamped outputs: 220 parent verification markers and 16 second-agent audit markers. All expected markers were captured. Capture latency: **p50 104 ms, p95 242 ms, max 255 ms** with 250 ms polling. Lifecycle-event p95 was **234 ms**. Shared producer/capture clocks make these local capture measurements meaningful; they do not include model/server event production or platform-to-workspace latency.

Collector snapshot over 232.104 s: **5.41 ms average scan**, **33.47 ms max scan**, **71.2 MiB RSS**, and **3.91 s user+system CPU** (~1.68% of one CPU core). This is collector resource use, **not a measured slowdown of the agents**. No controlled agent-throughput comparison was performed.

The initial collector recorded **143 transient read errors** and no persistence errors. Their source was not differentiated in that version, so attributing all of them to a specific cause would be speculation. All 236 expected output markers nevertheless arrived. The hardened version separates metadata, output, identity-file and root errors, preserves split UTF-8, and detects collector-restart gaps. See `evidence/post-hardening-measurement.json` for a separate follow-up run; do not mix its counters with the earlier run.

`evidence/concurrency.json` records both actual commands' lifecycle timestamps and their confirmed parent/subagent conversation IDs. Two agents in one workspace is not evidence that all agents can be monitored concurrently.

## Reliability and security limits

- Fourteen automated tests cover deduplication, history labeling, concurrent generations, malformed metadata recovery, truncation, UTF-8, explicit command identity, read-only routes, SSE reconnect/restart behavior, model snapshot validation/deduplication, concurrent import serialization and exact assistant-text delivery.
- Memory retains 2,000 events, UI renders the latest 100. SSE reconnect replays retained events; window overruns/restarts explicitly signal gaps. Disk journal is evidence storage, **not durable replay**. A restart changes stream epoch and cannot silently reuse a stale cursor.
- Polling adds up to roughly one poll interval plus filesystem/read scheduling delay. Workspace outages and missing/deleted/capped logs lose signals; all non-exec tools and model deltas remain invisible.
- Filesystem scanning scales with retained command directories; disk journals grow without rotation. This is a bounded hackathon proof, not fleet infrastructure.
- Logs can include sensitive stdout. Runtime journals are gitignored and created with restrictive permissions. Only selected non-sensitive marker evidence was committed. No authentication or redaction service is present: **keep loopback binding; do not expose publicly**. No CORS grant, remote proxy, shell endpoint or steering endpoint is provided.
- Browser verification found recorder-extension fetch errors unrelated to the inspector application. No inference about backend reliability is drawn from those extension errors.

## Recommended strategy and approval gate

Prefer **browser-attached CDP capture of the app’s authenticated native resumable SSE** for the next feasibility test; a supported direct API is an alternative if authorized access is available. The eventual world should preserve event IDs, explicit turn identity, reconnect/history reconciliation and per-conversation authorization. Use only signals actually validated; treat missing streams as unknown/stale. Keep workspace-exec capture as a narrow genuine fallback. Do not substitute simulated state or treat an exec exit as agent idleness/turn completion.

Before claiming full Phase 1 feasibility: authenticate an authorized test browser/session, monitor two independently active native conversations, measure `done`/terminal status and replay, and send one controlled instruction while a test agent is executing, checking acceptance, consumption event and effect separately. Also test turn-completion history updates if live transport fails.

**Architecture direction approved; Phase 1 feasibility is not passed and Phase 2 remains paused.** The governing [Live Supervision Acceptance Gate](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/knowledge-base/d3155727-18c5-49ae-82e4-403643ee894c) requires a real worker/observer/human-steering loop and authoritative final convergence. The existing shell feed, imported messages and isolated CDP transport proof remain partial results; they do not substitute for that loop. No virtual-world runtime files have been edited on this Phase 1 branch.


## Approved supervision architecture and revised Phase 1 scope

The architecture extends observation into an evidence-backed supervision loop without rewriting the factory or starting Phase 2. Shared modules separate capture, run-state projection, bounded read-only observer coordination, prioritized human attention, authorized steering and authoritative final reconciliation. They are target designs, not newly implemented runtime capabilities.

- [Live Agent Supervision requirements](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/requirements/5f1daefe-7e2d-40f3-b5c7-94f0d38d5435)
- [Execution Observation and Supervision architecture](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/blueprints/dd89af4b-ecf6-42ed-84ea-e5462a614a48)
- [Live Agent Supervision feature composition](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/blueprints/ac52c622-f3af-476b-9772-632914d5c954)
- [Phase 1 pass/fail/blocked acceptance gate](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/knowledge-base/d3155727-18c5-49ae-82e4-403643ee894c)

The smallest proof uses one real worker, one actual observer and one authorized human. It must show real in-turn model evidence, changing artifacts, a grounded concern or decision, source-confirmed instruction consumption during execution, and a final display matching the complete permitted source result. Representative 60-second and 600-second real-work observation, concurrent worker association, capture gaps, observer failure and measured overhead are part of the evidence report. Meaningful change triggers and an explicit finite observer budget prevent analyzing every token or silently spending on inference.

Observer interpretations do not overwrite source facts or steer the worker automatically. Imported snapshots serve baseline/recovery/final reconciliation, not a substitute for in-turn model capture. A tool exit is not a turn-end signal; local acceptance is not remote consumption or compliance. If a core source capability is blocked, the gate stays blocked. Architecture approval is not Phase 2 implementation approval.
