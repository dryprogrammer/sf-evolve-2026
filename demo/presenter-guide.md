# Drift Room — presenter run-through

Target: 4:30, with 30 seconds of buffer. Private rehearsal material. No publication or submission performed.

## Open before recording

1. Open `drift-room-slides.html` in a standalone browser tab. Arrow keys move, N toggles notes, F requests fullscreen. Print / PDF exports the six slides.
2. Open the actual Drift Room app and PR #6: https://github.com/dryprogrammer/sf-evolve-2026/pull/6 . Sign in to private GitHub before recording. Do not show tokens, terminal secrets, unrelated conversations, or private data.
3. Have the app's frozen v1 snapshot available. **Load review snapshot** imports a local JSON file without network calls. It requires all three recorded reviewer roles, the same snapshot ID, and literal citations into available sources. Invalid imports retain the existing deck. This does not start agents or persist app decisions.
4. Read the imported findings. Pick one actual disagreement and one proposed correction. If reviews are not ready, slide 3 is deliberately a role-only scaffold; it is not a completed review reveal.
5. Rehearse the app's source drill-down and local decision persistence. Do not claim either works based on this deck.

## Six beats

| Time | Slide / action | Say |
|---|---|---|
| 0:00–0:25 | Opening | “We built the wrong thing. Not because the agents couldn’t code, but because our intent, documents and delivery stopped telling the same story.” |
| 0:25–1:10 | Show app snapshot | “These reviewers examine the same frozen evidence. Here is its time, ID, coverage—and what we could not collect.” |
| 1:10–2:00 | Actual recorded reviews | “Intent sees [actual finding]. Delivery sees [actual finding]. The skeptic disagrees about [actual disputed interpretation]. Let’s inspect the source instead of taking a vote.” |
| 2:00–3:10 | Exact repo/branch evidence | “Main is a README-only checkout. PR #6’s implementation is on this head, stacked on this base. An earlier wrong-remote report is not reproduced here now.” |
| 3:10–4:05 | Choose in the app | “I choose [actual proposal] because [cited fact] supports [consequence]. We retain the dissent and the snapshot. This is a local decision, not an automatic repair.” |
| 4:05–4:30 | Close | “The human doesn’t read every token. They inspect the evidence and make the consequential decision.” |

Bracketed text is a rehearsal slot, never something to read as a claim.

## What is actually verified in this preparation

Checked 2026-11-14T21:49:17Z (1:49:17 PM Pacific):
- Private development repo: `dryprogrammer/sf-evolve-2026`; public demo repo: `dryprogrammer/sf-evolve-2026-demo`.
- Current checkout origins match their respective repositories. The earlier report of both origins pointing at public demo is historical, not reproduced in this workspace.
- Development `main`: `fdb3778c32d7bbc6328be7f7c6e0334b361e15c7`, README only.
- PR #6 OPEN, head `8090/chat-enterprise-handoff-c72418` at `48b1ec0cdf75ab2f07b7c4098e75dc26560f3705`, base `8090/wo-1-collaboration-mvp-9fd572`, not main.
- Drift Room implementation is owned by another thread. Its initial contract marks reviews recorded, digests as local fingerprints, and decisions as local proposals rather than source edits.

This check is **not the app snapshot**, does not prove when drift began, and does not prove stacked branches are a mistake. Do not import prior Foreman test counts as verification of Drift Room.

## Recovery lines

- App fails: “This is the prepared evidence deck, not a live app recording.” Show the pinned PR and explain the unverified action; don't simulate a saved decision.
- Review output missing: “The recorded reviewer import is not ready. These are the three questions we will ask, not completed findings.” Cut the claim of a disagreement.
- GitHub unavailable: use the saved repository evidence JSON. Label it captured at prep time, not current live state.
- No actual disagreement: say the reviewers agree and disclose that this run did not produce dissent. Don't manufacture it.
- Source timestamps differ: distinguish the prep check from app collection. Use the app snapshot's own citation association for the chosen correction.

## Likely questions

**Is it live?** Reviewer analysis is recorded unless the delivered app proves a supported runtime. Selecting a finding and inspecting sources may be live UI interaction; that does not make the review computation live.

**Are the reviews independent?** Three roles are not proof of independence. Describe separate contexts only if the master can show actual separate reviewers consuming the same snapshot. They are agents, not authenticated human approvers.

**Does it repair the project?** No. The demonstrated boundary is inspectable evidence and a retained local correction choice. Repair requires a later approved workflow.

**Does a main/PR difference prove drift?** No. It proves which code a checkout contains. Stacked delivery can be intentional; evaluate it against the intended source and branch context.

**Why not read every agent token?** Decision quality depends on relevant facts, provenance, missing coverage, uncertainty and consequences—not replaying all generated text.

## Final stage-ready gate

- [ ] Same frozen snapshot for all three recorded reviews.
- [ ] Actual finding has a literal citation and inspectable source.
- [ ] Real dissent displayed, or no-dissent limitation stated.
- [ ] Historical remote report separated from current verified identity.
- [ ] Actual correction and local persistence demonstrated in the app.
- [ ] App verification at the final revision; no inherited test-count claims.
- [ ] Private evidence reviewed before any recording/public export.
