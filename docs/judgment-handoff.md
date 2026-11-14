# Judgment handoff demo

A prepared business question, two explicit policy choices, and an attributed human answer that changes concrete acceptance examples. Choosing 20% for custom terms exposes a mismatch with the prepared implementation (15%); choosing 15% matches it.

## Rehearse

1. Run the default fixture app, open Work inspector, create a fresh round.
2. Assign Maya as decision maker and Alex as a **required** Finance reviewer; save and publish.
3. Switch to Alex. Find **A question for Finance**.
4. Choose **Include custom terms at 20%** and explain why. Record answer.
5. Inspect **Engineering acceptance proposal**: custom expected 20%, prepared implementation 15%, implementation change needed.
6. Answer again with **Keep custom terms at 15%**. The new proposal matches; the earlier answer remains in history.
7. Switch to Maya, simulate a source change, refresh. Both prior answers are marked stale; a fresh review is needed.

## Boundaries

The question is scripted fiction; the proposal is a deterministic template, **not** an agent-generated completion or MCP invocation. Human answers are real persisted fixture-persona actions, not authenticated independent identities. The panel belongs only to DEMO-1 in fixture mode and is absent for the unrelated API-backed WO-2 context. It does not write policy, change implementation, auto-sign or approve. Choosing a new policy still requires reconciliation and review; the mismatch display is not a new approval gate. Existing Factory-source proof remains separate.
