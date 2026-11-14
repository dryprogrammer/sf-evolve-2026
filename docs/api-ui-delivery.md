# API / selected-native-UI delivery — 2026-11-14

## Delivered

- Existing PR #6 / `8090/chat-enterprise-handoff-c72418` continues from verified `8dff433`, stacked on `8090/wo-1-collaboration-mvp-9fd572`. No foundation merge/reset, public release, visibility/license change, deployment or submission.
- Selected `SF-native-dev-handoff.zip` white, record-centered Work Orders shell; one actual record, disabled unsupported modules/agent activity, working context/review drill-down, optional original factory floor, keyboard/modal focus, mobile and caption-only fallback. Illustrative filler records/events/next-turn controls were not implemented as capabilities.
- Server-side supported Factory REST reads: `/work_orders/{uuid}`, `/requirements/{uuid}`, `/blueprints/{uuid}`, `/artifacts/{uuid}`. Bearer key remains in secure environment settings, never browser code or logs.
- Scope: selected WO-2's full Markdown + all **directly linked** requirements/blueprints/document-backed Knowledge Base resources + explicitly configured supplemental demo document. Source IDs/links, returned revision IDs/numbers, update times, canonical SHA-256 content digests and retrieval time are inspectable. No claim of transitive project coverage, comments, code, atomic multi-record consistency or production per-user source visibility.
- Two matching complete bounded reads form the verified cut. Missing/denied/unavailable/unsupported/unstable evidence fails closed; every API-backed read and command reverifies. Unsupported linked types/files are rejected rather than silently skipped. No write API exists in the application.
- Separate API storage/scope preserves fixture fallback. Source observation persists independently of a rejected review command; immutable saved/round snapshots, historical attribution and sign-offs remain. API mode rejects fixture simulation commands.

## Actual live proof, not a mock

See [sanitized evidence](evidence/factory-live-proof.json).

1. Retrieved WO-2 UUID `c8127cba-c26f-4eb6-8183-e5e09d36f732`, its one linked requirements document and two blueprints, plus labeled supplemental probe `0a8c2f35-4b39-4033-b6d0-81655e05d1e4`.
2. Prepared local round `d597e4a7-feaf-498a-bfa8-d64a4ca49e1d` against digest `501d786b52c258a758ed25eba53b026255371fa67f362ee853f708691e1e8322`. Contributions/sign-off were **programmatic fictional demo-persona actions**, not an actual independent human or MCP answer.
3. An explicitly opted-in REST PATCH appended revision B to that isolated non-sensitive Factory probe; a GET verified exact read-after-write. Existing source requirements, blueprints, work status and decisions were untouched during the proof.
4. Current saved basis became `fc269dc15123d444e82639299311bf53c236bb4c3c422328fa656a1b0320c83f`. Old-round approval returned HTTP **409 `changed_evidence`**, before and after refresh. Browser assertion confirmed attempted rationale remained intact.
5. Separate fresh round first rejected approval with `pending_signoffs`; fresh fictional Finance sign-off then permitted a local decision. Old snapshots and old sign-offs were not reused. This is **Project Driver's local review gate**, not native Factory approval or release.

[Raw browser recording](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/repro-evidence/69d9ac5c-3e00-456b-a408-595eeeaf1acd) and [rejection screenshot](https://factory.8090.ai/project/e6c7fbf5-1f8a-4427-a320-c9eaad5ff200/repro-evidence/ef5d3137-7a96-4fee-bd4e-3a912d1c1a6e). Recording is raw evidence, not a reviewed/narrated submission video. Recorder-extension 404 console messages were separate tooling failures; the app's expected 409 was verified. Do not describe the recording as an uninterrupted cross-system screencast: the real external PATCH is evidenced by the proof runner/readback, while browser capture shows local approval rejection.

## Partial / deferred

- **Partial:** authoritative API read/change gate is live; identity/review remain selectable fixture personas under `FACTORY_MODE=fixture`. The project API key acts as its creator. Do not deploy/expose this application as production authentication or per-user authorization. No complete requirements acceptance claim.
- **Deferred / blocker:** Factory-to-app MCP clarification. No connected MCP service in the master session; supported documentation proves catalog connections, not arbitrary endpoint registration/reachability for this app. No unauthenticated endpoint, publication/tunnel, fake human answer or substitute local-harness claim was introduced.
- **Smallest owner action:** verify whether Settings → Connections → MCP Servers offers custom registration and supply non-secret evidence of its supported URL/auth fields. Then establish private authenticated ingress and scoped tools before an actual request → human answer → retrieval → used agent output proof. No bounded MCP delivery estimate before that prerequisite.
- Production authentication, per-principal source grants, arbitrary work selection, partial evidence pagination, transitive sources/comments/code, live agent events, next-turn steering, orchestration expansion, ElevenLabs integration, notifications, hardware, deployment, public release and submission remain deferred.
- Existing dependency audit reports three development-tool advisories (Vitest/mock worker pool). No blind major-version upgrade was performed. This is not a production security audit or release approval.

## Run safely

Fixture remains default; retain its existing storage and server:

```sh
npm ci
npm run dev:fixture -- --port 3000
```

For a **localhost-only** API-backed demo, obtain `FACTORY_API_KEY` from secure workspace settings (never paste it here), and use a different process/build directory or a detached verification worktree so the fixture dev server is untouched:

```sh
FACTORY_MODE=fixture FACTORY_SOURCE=api \
FACTORY_WORK_ORDER_ID=c8127cba-c26f-4eb6-8183-e5e09d36f732 \
FACTORY_SUPPLEMENTAL_IDS=0a8c2f35-4b39-4033-b6d0-81655e05d1e4 \
FACTORY_DATA_DIR=.data/api-demo \
./node_modules/.bin/next dev --hostname 127.0.0.1 --port 3002
```

The live proof used a detached worktree, reused installed dependencies, and preserved the original preview. `scripts/prove-factory-loop.mjs` supports `prepare`, `change`, `verify`, `recover`. The `change` phase requires `FACTORY_ALLOW_DEMO_PROBE_EDIT=1`, edits only the exact labeled demo resource, and refuses to overwrite changed content. `prepare` requires fresh isolated review storage. Never run it against real approval identities or unrelated sources. Proof output defaults to `/tmp`; the committed evidence excludes full private source content and credentials.

## Verification / owner handoff

Current check results and exact source hashes are in `evidence/api-ui-verification.json`; original fixture verification remains historical, not evidence of new code. Unit/source tests using mocks are distinguished from the real API proof. Fixture browser tests run against the optimized production backend using installed Chromium.

Repository stays PRIVATE. Existing WO-1–6 are In review; this delivery does not mark them complete. Preserve the user's **1 PM Pacific target / 3 PM hard feature freeze**, reserving final verification/recording/submission preparation; older noon targets are superseded. Owner reviews private evidence, final video, access and disclosures; publication or portal submission still needs separate explicit approval. Do not dispose of the paused competing branch or its uncommitted script assets; neither was merged or cleaned up.
