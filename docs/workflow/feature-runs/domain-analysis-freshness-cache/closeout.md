# Closeout

## What shipped

- Domain Analysis overview now reads from a cached domain snapshot built from per-run `analysis_results`, not raw transcript JSON.
- The cache is stored in the existing `assumption_analysis_snapshots` table using the `domain_overview` analysis type.
- Stale snapshots are shown right away and refreshed in the background.
- New `analyze_basic` completions now queue domain snapshot refresh work for both the virtual signature and the exact signature.
- The page now shows a plain-language freshness badge and a `Refresh now` action.
- The main Domain Analysis query no longer waits for the signatures query before it starts.

## Verification

- API typecheck: `./cloud/node_modules/.bin/tsc -p cloud/apps/api/tsconfig.json --noEmit`
- API focused test: `../../node_modules/.bin/vitest run --config vitest.config.ts tests/graphql/queries/domain-analysis.test.ts`
- Web focused test: `../../node_modules/.bin/vitest run --config vitest.config.ts tests/pages/DomainAnalysis.test.tsx`
- API targeted eslint on changed files
- Web targeted eslint on changed source files

## Notes

- Full web typecheck is still blocked by the unrelated merge conflict in `cloud/apps/web/src/components/domains/DomainSettingsPanel.tsx`.
- The web test run still prints existing React Router future-flag warnings and an existing `act(...)` warning in the disclosure test, but the test passes.
