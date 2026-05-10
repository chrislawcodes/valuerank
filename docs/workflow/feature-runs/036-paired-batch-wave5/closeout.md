# Closeout — Feature 036: Paired-Batch Wave 5

(populated after merge)

## PR
- URL:
- Merge SHA:

## Pre-flight counts
- `run_anomalies WHERE type = 'PAIR_ASYMMETRY'` on test DB before migration:
- Same on prod (recorded for rollback baseline): **2 rows** (captured 2026-05-09)

## Verification
- [ ] Lint clean across shared/db/api/web
- [ ] API tests pass with DATABASE_URL
- [ ] Web tests pass with DATABASE_URL
- [ ] API + web builds clean
- [ ] Codegen yields no orphan types
- [ ] Migration runs cleanly on test DB
- [ ] Final greps from spec all empty (excluding Wave 6 files + `dist/`)

## Production smoke test
(run after Railway redeploys)
- [ ] `/runs` page renders without TS errors
- [ ] `/models?scope=all-domains` not stuck loading (Wave 4 hotfix verified)
- [ ] Anomalies tab on a run renders without `PAIR_ASYMMETRY` references
- [ ] No 500s in API logs for 10 minutes post-deploy

## Wave 6 follow-ups
- Pooled-vignette-metrics replacement card (replaces deleted `PairedRunComparisonCard`)
- `legacyCompanionPairedRun.ts` deletion
- `cloud/scripts/job-choice-bridge-report.ts` deletion
- `docs/backend/paired-batch-run-flow.md` deletion
- Glossary and PRD updates
- Optional pair_key / jobChoice* JSON cleanup migration
