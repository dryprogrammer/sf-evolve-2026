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

Prefer authenticated **native resumable SSE** for the eventual world, with event IDs, explicit turn identity, reconnect/history reconciliation and per-conversation authorization. Use only signals actually validated; treat missing streams as unknown/stale. Keep workspace-exec capture as a narrow genuine fallback. Do not substitute simulated state or treat an exec exit as agent idleness/turn completion.

Before claiming full Phase 1 feasibility: authenticate an authorized test browser/session, monitor two independently active native conversations, measure `done`/terminal status and replay, and send one controlled instruction while a test agent is executing, checking acceptance, consumption event and effect separately. Also test turn-completion history updates if live transport fails.

**No Phase 2 authorization has been given.** The decision is whether to approve a limited exec-only visual integration, or keep Phase 1 open until authenticated native streaming and steering are validated. No virtual-world files have been edited; main contains only a README and another remote branch contains an unfinished collaboration pilot.
