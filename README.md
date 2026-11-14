# Human-led factory pilot

An asynchronous, **fixture-backed** collaboration MVP: persisted work evidence, private drafts, explicit human review assignments, separate advice/sign-off/decision, immutable evidence fingerprints, preserved concerns and auditable decisions.

## Run

```sh
npm ci
npm run dev:fixture
# open http://localhost:3000
```

Software Factory workspaces can load `.8090/environment.json` from this branch to run the same pilot automatically. No provider credentials or external model tokens are needed.

For an optimized local build:

```sh
npm run build
npm run start:fixture
```

## Try the review journey

1. Use the **Maya** fixture persona. Save private working notes, reload, and verify recovery.
2. Create a review round. It starts with **no assignments**. Choose a human decision maker and add an explicit required human reviewer. Save setup, then publish.
3. An approval attempt without all current required sign-offs is blocked.
4. Switch to **Observer** to submit agent advice: it cannot sign off, coordinate, or decide. Switch to **Alex** for the assigned human review.
5. Submit human request-changes feedback and a sign-off. Earlier responses remain visible if revised.
6. Switch back to the decision maker, record a response to each human concern, and approve. The source work status stays **In Progress**.
7. Try source-change, outage and permission-revocation simulations. Changed evidence needs a new round; an unchanged source can recover after an outage. Revocation redacts current/historical evidence, drafts and review content until access is restored.

## Storage and safety boundary

- Next.js/React/TypeScript, with **PGlite** (embedded PostgreSQL) for a single-process local pilot. SQL schema is in `migrations/001_initial.sql`. State/history and command receipts commit transactionally; immutable snapshots are archived separately. Persisted data defaults to `.data/factory`, excluded from Git. `FACTORY_DATA_DIR` can select another local directory.
- Review state is a versioned JSONB aggregate per work item. A PostgreSQL constraint disallows multiple open rounds; shared transactions and version checks prevent conflicting commands. Draft versions remain monotonic after discard to prevent stale-session overwrite.
- Browser mutation requests require JSON and same-origin checks. Command receipts are scoped to fixture actor/work and reject payload changes under a reused key. Actor kind comes from server-known fixture identities, not a submitted authorship field.
- **Fixture personas are NOT authentication.** Anyone allowed into this demo can switch among fictional people. Do not enter private customer data or publish the pilot as a real approval service.
- The server requires `FACTORY_MODE=fixture`. Any other mode is disabled. There is **no live Software Factory API integration, real user authentication, or external agent inference** in this PR. The persistent banner communicates this boundary.
- Unsent text stays in the current browser session on request failure. Only confirmed saved drafts survive refresh/restart. Discard clears saved text while retaining version metadata. A command with an uncertain outcome retries using the same idempotency key.
- Immutable evidence digests exclude retrieval timestamps and are stable through PostgreSQL JSONB serialization. Review records the evidence checked at approval time; it does not promise atomic approval against another mutable system.

## Verification

```sh
npm run typecheck
npm test
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
```

Unit/service tests cover authority gates, linked concerns, revisions, draft conflicts, private storage, restart recovery, replay receipts, SQL constraints and HTTP trust boundaries. Browser tests exercise the real optimized backend and the complete multi-persona review journey, privacy revocation and a narrow-screen layout. CI runs the same commands.

## Deferred release gates

This PR starts WO-1 through WO-5; it **does not complete their live-integration/security acceptance criteria**. Before a real multi-user launch:

- Implement maintained OIDC authentication and explicit operator-managed application grants.
- Verify supported per-principal Software Factory access; never use a broad token as proof of another user's permission. Add a tested read-only live source adapter with pagination/completeness handling.
- Replace local embedded persistence with an operated PostgreSQL deployment and production migration strategy; implement retention/deletion, backups, monitoring and privacy controls.
- Add live-source integration tests, revoke/access-denial tests against real authorization, operational load checks and deployment review.

Spatial presence, notification/calling APIs, model/skill experiments, Gas City orchestration, and live observation/steering remain later modules. This application does not expose hosted-agent private reasoning or rely on undocumented endpoints.
