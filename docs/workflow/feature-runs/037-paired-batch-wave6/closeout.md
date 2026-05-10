# Closeout — Feature 037: Paired-Batch Wave 6

(populated after merge)

## PR
- URL:
- Merge SHA:

## Verification

- [ ] Lint clean: shared, db, api, web
- [ ] API tests pass (includes new methodology guard)
- [ ] Web tests pass (includes new card tests)
- [ ] API + web builds clean
- [ ] Codegen up-to-date (if any GraphQL changes — none expected this wave)
- [ ] Final greps from spec all empty (excluding documented Wave 7 exceptions)

## Production smoke test (after Railway redeploys)

- [ ] Open `/analysis/<paired-vignette-run-id>` for a vignette with both directions trialled. Expect the new card to render with populated metrics.
- [ ] Open `/analysis/<non-paired-run-id>`. Expect no card at the bottom of the Overview tab.
- [ ] Open an aggregate-run analysis page. Expect no card.
- [ ] Hover over a `—` in the Pressure response column. Expect a tooltip explaining the reason.

## Wave 7 follow-ups

- `legacyCompanionPairedRun.ts` deletion (once pre-Wave-4 runs are confirmed migrated)
- Bake bootstrap kappa CIs into the domain-analysis snapshot
- `requestPolicy` audit between /models and /models/win-rate
