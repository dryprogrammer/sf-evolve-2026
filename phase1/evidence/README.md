# Phase 1 feasibility evidence — native access blocked, live fallback proven

**No Phase 2 work has begun. No virtual-world files were modified.**

## Verified
- Working read-only live inspector, capturing actual 8090 exec starts, intermediate shell output and tool completions.
- Parent plus real subagent execution overlapped **7.278159 seconds**, verified by command metadata. Identity binding must use command/conversation IDs: both agents shared a generation ID.
- Initial run captured **236/236 expected producer-stamped markers**: p50 **104 ms**, p95 **242 ms**, maximum **255 ms**, at 250 ms polling.
- Hardened follow-up captured **40/40 markers**, p95 **248 ms**, with **zero capture or persistence errors**.
- Initial collector: average scan **5.41 ms**, RSS **71.2 MiB**, CPU ~**1.68% of one core**. This is resource overhead, not a controlled agent-throughput comparison.
- **8 automated tests pass**, covering capture, reconnect, restart gaps, malformed metadata, UTF-8 and identity handling. Browser verified the live inspector and disabled steering control.

## Not verified / unavailable
- Native SSE requests returned **401 SofaNotAuthenticated**; browser redirected to login. This proves an authentication barrier, not that streaming is impossible.
- Shipped frontend contains resumable SSE, content/tool events, terminal `done`/status, queue and steering contracts. These are **static integration leads**, not proven runtime capabilities.
- Shell completion is **not agent-turn completion**. Genuine turn-completion fallback updates are unavailable here.
- Mid-turn versus between-turn steering, instruction consumption/effect, all-agent discovery and cross-workspace monitoring remain unverified. No control instructions were sent.
- Initial run logged **143 transient read errors** whose source was not differentiated. No expected marker loss occurred; the hardened run adds categorized diagnostics. Do not hide the initial errors.

## Recommendation and gate
Prefer authenticated native resumable SSE, with workspace exec as a narrowly labeled fallback. Keep Phase 1 open for authenticated native/turn-completion/steering validation, **or explicitly approve a limited exec-only Phase 2 integration**. Approval is required before any world modification.

Files below provide actual measurements, concurrency lifecycle metadata, authentication rejection, and exact public frontend contract evidence. Full reproduction instructions are in the repository's `phase1/README.md`. Raw runtime logs remain local/gitignored; only selected non-sensitive evidence is published.
