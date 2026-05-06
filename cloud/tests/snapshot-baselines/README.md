# Report snapshot baselines

Locked-in production responses for every result-bearing GraphQL query that drives a Models-nav report page. The verify script replays each query against production and fails if any number, label, or structure has changed.

## What it protects

The visible numeric output of these pages, at the canonical filter state (`signature=vnewtd`, all domains, default models):

- **Model Groups** (`/models`)
- **Domain Analysis** (`/domains/analysis`)
- **Domain Shifts** (`/models/domain-shifts`)
- **Pressure Sensitivity** (`/models/pressure-sensitivity`)
- **Confidence** (`/models/confidence`)

If any production calculation changes — code, data, model deprecation, ops recompute — the verify script fails and a human has to look.

## How it works

1. `manifest.json` lists every snapshot: query, variables, expected response, volatile fields to ignore.
2. `cloud/scripts/verify-report-snapshots.ts` reads the manifest, replays each query against `PROD_GRAPHQL_URL`, strips volatile fields, deep-diffs against the saved response.
3. The GitHub Action `.github/workflows/report-snapshot-check.yml` runs the script on every push to `main` and on a 6-hour cron. Failures notify the repo (workflow run goes red).

## Files

```
cloud/tests/snapshot-baselines/
├── manifest.json           # snapshot index with variables and volatile fields
├── queries/                # one .graphql file per snapshot
└── responses/              # one .json file per snapshot — the locked baseline
```

## Running locally

From `cloud/`:

```bash
PROD_GRAPHQL_URL="https://api-production-8494.up.railway.app/graphql" \
PROD_API_KEY="<your key from .mcp.json>" \
npm run verify-report-snapshots
```

## Updating a baseline

Updating fixtures is intentional and review-gated. Don't update silently.

1. Confirm the new production output is correct.
2. Re-run the capture (or hand-edit the response JSON if the change is small and well understood).
3. Open a PR titled clearly, e.g. `snapshot: update domain-analysis baseline (PR #N change in cluster centroid)`.
4. Reviewer must look at the diff and confirm the change is expected.

The verify script makes silent drift impossible. The PR review makes intentional updates traceable.
