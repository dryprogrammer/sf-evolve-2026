# Fictional input — renewal exception

This seeded policy and the characters in the demonstration are fictional, not customer records.

Sales Operations requests raising automatic renewal discounts from 15% to 20%.
Finance's constraint: accounts with custom payment terms keep a 15% limit.
The clarification to record in review: “20% applies to standard terms only; custom terms stay at 15%.”

## Acceptance examples

- Standard payment terms → 20% renewal discount.
- Custom payment terms → 15% renewal discount.
- Unknown terms → reject, do not guess.

`src/lib/renewal.ts` is a real, tested acceptance-example implementation. It is not wired to a billing service or deployed. The factory's review of its saved evidence is a separate product-fit decision; tests are not independent human approval. Changing a fixture policy revision demonstrates review freshness, not a live source adapter or automatic billing change.
