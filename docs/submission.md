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

## Integration gate: keep blocker with parent

This pack owns only this file and `demo-script.md`. It reuses the PR2 foundation at `480210bef24563e19793d48cde30f993182acca3`; it does not implement or resolve the immediate integration blocker.

At that revision, `src/lib/fixtures.ts` seeds the generic **DEMO-1 / Introduce a human review checkpoint**, not a renewal scenario. Evidence cards contain fixture text, not clickable source links. The UI shows **Required sign-off pending**, not **Needs you**. Parent must integrate and verify the renewal fixture, source references, obligation presentation, and any chain navigation before using the story copy as a description of the running build. If not integrated, explicitly narrate these as story framing and show the real generic controls; do not relabel a screenshot or imply shipped features. Baseline stale-source simulation appends generic changed-evidence text; it does not implement a 15→20% business-policy mutation.

## Submission checklist — owner action, not agent authorization

- [ ] Parent resolves or explicitly discloses the integration blocker; record final hash and run the [demo preflight](demo-script.md#preflight--before-recording).
- [ ] Human reviews every claim against the recorded build; remove unsupported story/UI claims.
- [ ] Human reviews MIT/license expectations, dependency and asset licenses, and permission to publish. No LICENSE is created here; no license compliance or eligibility is asserted.
- [ ] Human reviews prior work disclosure: PR2 foundation, pre-existing persistence/review engine, and exactly what changed for this event. Verify dates/rules; do not claim everything was built during the hackathon.
- [ ] Human reviews tool/AI disclosures: coding assistance used for this documentation pack; Next.js/React/TypeScript/PGlite; list actual development tools and any browser voice/captions used. Do not invent external model/provider usage.
- [ ] Human attaches the ≤5-minute video, verifies playback/captions, and checks repository/video/demo URL access from the intended reviewer context. Keep fixture access restricted unless explicitly approved; persona switching is not authentication.
- [ ] Human verifies destination, rules, deadline, and required fields. Historical handoff points to `https://evolve-8090.devpost.com/`; this is not freshly verified.
- [ ] Work to the conservative handoff schedule on **November 14, 2026: freeze 19:32 UTC; due approximately 19:52 UTC**. These are operative planning cutoffs, not newly verified official deadlines. **No refreshed 90-minute allowance.** If a cutoff has passed, escalate to the parent/human rather than assuming an extension.
- [ ] **A human must explicitly approve any public publish or submit.** Then the human attaches the video, fills reviewed URLs/disclosures, and performs the actual portal submission. Save its receipt only if one is actually returned.

**Exact handoff action:** Parent verifies the integrated build and supplies the final hash. Human records the script, attaches the video, checks access, reviews rules/license/prior-work/tool disclosures, and approves public release before personally pressing the portal's publish/submit control. Destination validity, official eligibility, license status, public URL, video, and submission receipt remain unknown until checked.
