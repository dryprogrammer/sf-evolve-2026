# The Factory — submission draft (human review required)

## Ready-to-edit copy

**Title:** The Factory: knowledge with an accountable next step

**Tagline:** Turn scattered enterprise context into attributed review, explicit obligations, and decisions checked against the evidence.

**Problem:** A renewal exception is not just a chat message. Someone must connect the request, policy, implementation, and tests—and know whose response is still needed.

**Demo story:** In one seeded, fictional enterprise scenario, Northstar's renewal request moves from a 15% discount to a proposed 20% exception. The story follows source-linked context into a required review obligation (“Needs you”), an attributed contribution, and an attempted decision. When evidence changes, the existing server review engine rejects stale approval instead of treating an old sign-off as current authorization. The input → decision → implementation → test chain is inspectable, not a claim of automatic implementation or production deployment.

**What we built:** A walkable pixel-art workshop around a real local persistence and review engine. Next.js, React, and TypeScript provide the interface; PGlite stores review state, drafts, immutable evidence snapshots, history, and transactional command receipts. Feedback is separate from sign-off; required sign-offs are separate from the final decision. Approval rechecks the evidence fingerprint. The workshop gives these obligations a visible place rather than pretending simulated presence is collaboration.

**Why it matters:** Enterprise knowledge becomes useful when the next responsible action is explicit and the decision can be traced back to the context reviewed. This demo explores that boundary without claiming production security or a live integration.

**Honest scope:** One solo operator switches fixture personas. They are not authenticated users or independent human reviewers. The company, renewal, and supporting sources are fictional. The persistence/review engine is real, but this is a local, fixture-backed pilot, not a deployed approval service. Optional browser captions or voice, if available in the final build, are browser capabilities—not ElevenLabs integration. No live 8090 integration, public deployment, or completed public submission is claimed.

**Links to fill after checking:**
- Repository / exact final revision: [HUMAN: insert reviewed repository link and hash]
- Demo video: [HUMAN: attach recording and insert accessible link]
- Demo URL: [HUMAN: insert only if approved and access-tested; otherwise say local recorded demo]

## Integrated and verified slice

The parent integrated the renewal fixture, committed seed references, visible “Needs you” obligation/action projection, revision-linked contribution/decision chain and optional caption/browser-voice module. The actual acceptance-example implementation and tests share commit `5ba2f24`. The source change remains a local, disclosed fixture addendum—not a committed policy edit or live adapter.

Captured typecheck, unit/service, production build and real-backend browser results are in [verification.json](../public/evidence/verification.json), with tested revision and per-file hashes. [Raw gate recording and screenshot](evidence/capture.md) are reproducible evidence, not an edited/narrated final submission video.

## Submission checklist — owner action, not agent authorization

- [ ] Use the captured verification revision and final PR hash and run the [demo preflight](demo-script.md#preflight--before-recording).
- [ ] Human reviews every claim against the recorded build; remove unsupported story/UI claims.
- [ ] MIT licensing for original code is approved and root LICENSE is present. Review dependency/asset obligations and publication audit separately; compliance and event eligibility are not automatically established.
- [ ] Human reviews prior work disclosure: PR2 foundation, pre-existing persistence/review engine, and exactly what changed for this event. Verify dates/rules; do not claim everything was built during the hackathon.
- [ ] Human reviews tool/AI disclosures: coding assistance used for this documentation pack; Next.js/React/TypeScript/PGlite; list actual development tools and any browser voice/captions used. Do not invent external model/provider usage.
- [ ] Human attaches the ≤5-minute video, verifies playback/captions, and checks repository/video/demo URL access from the intended reviewer context. Keep fixture access restricted unless explicitly approved; persona switching is not authentication.
- [ ] Human verifies destination, rules, deadline, and required fields. Historical handoff points to `https://evolve-8090.devpost.com/`; this is not freshly verified.
- [ ] Updated owner timing on **November 14, 2026: noon Pacific target; 3 PM Pacific hard feature freeze**. Official rules checked state **3:15 PM PT submission / 3:30 PM PT organizer code freeze**. Use the earlier owner freeze and preserve final verification/submission time; the previous 11:52 AM approximate cutoff is superseded.
- [ ] **Do not change current repository visibility before clearing PR #1's captured evidence or approving a clean submission export.** Public submission remains separately gated. The human attaches the video, fills reviewed URLs/disclosures, and performs the actual portal submission. Save its receipt only if one is actually returned.

**Exact handoff action:** The integrated build and its test evidence are supplied in the PR; verify the submission uses that revision. Human records the script, attaches the video, checks access, reviews rules/license/prior-work/tool disclosures, and approves public release before personally pressing the portal's publish/submit control. Destination validity, official eligibility, license status, public URL, video, and submission receipt remain unknown until checked.

## Verified event rules and current blocker

[Official rules](https://evolve-8090.devpost.com/rules) require a public source repository under MIT with accurate copyright notices, and README disclosure of libraries/APIs/AI/sponsor tools and pre-event work. A short demo video is required for sponsor prizes and used for tie-breaking; no exact video length was stated in the rules inspected. Submission is by 3:15 PM PT Nov14; organizer code freeze is 3:30 PM PT. The owner's 3 PM freeze is earlier and remains operative.

MIT LICENSE is committed. Public visibility is not yet changed: PR #1 contains separate native conversation/transport captures, so publishing this whole repository would expose more than the demo. Recommended smallest safe action: approve a clean public submission repository/export from the reviewed demo revision, excluding the separate captures, while keeping the development repository private. No history deletion or automatic merge is needed.
