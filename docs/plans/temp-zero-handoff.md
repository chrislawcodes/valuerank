# Temp-Zero Verification — Handoff

Last updated: 2026-03-02. Full plan: `docs/plans/temp-zero-verification-plan.md`.

---

## Current State

| PR | What | Status |
|----|------|--------|
| #297 | Direction-only mode + model filter | Merged to main |
| #298 | Instrumentation (Phases 1–4, 8–9) | Merged to main |
| #299 | Phase 11 — adapter mode badges per model | **Open, not merged** |

**What's implemented and merged:**
- LLM adapters emit `promptHash`, `adapterMode`, `temperatureSent`, `seedSent` per request
- `seed: 42` injected automatically for temp=0 runs
- `canary_runner.py` — standalone determinism tester
- `temp_zero_report.py` — production DB report script
- `debugAssumptionsMismatches` GraphQL diagnostic query

**What's in-flight (worktrees exist, not started):**

The next task is to wire the verification report into the UI as a GraphQL query + React component, replacing the separate `temp_zero_report.py` script.

Two worktrees are already set up with specs ready to execute:

| Worktree | Branch | Spec file | Task |
|----------|--------|-----------|------|
| `/tmp/wt-temp0-verify-api` | `feat/temp0-verify-api` | `/tmp/codex-spec-api.txt` | New GraphQL query `tempZeroVerificationReport` |
| `/tmp/wt-temp0-verify-web` | `feat/temp0-verify-web` | `/tmp/codex-spec-web.txt` | New React component + GQL operations |

---

## Next Actions

### Step 1 — Implement API query (Task A)

The spec is already written at `/tmp/codex-spec-api.txt`. Run in the existing worktree:

```bash
cd /tmp/wt-temp0-verify-api
codex exec --full-auto "$(cat /tmp/codex-spec-api.txt)"
```

Then check `git status` — Codex may not commit. If uncommitted, commit manually:
```bash
git add cloud/apps/api/src/graphql/queries/temp-zero-verification.ts \
        cloud/apps/api/src/graphql/queries/index.ts
git commit -m "Add tempZeroVerificationReport GraphQL query"
```

Verify: `cd cloud && npm run typecheck --workspace @valuerank/api` must pass.

**What the query does:** Fetches temp=0 transcripts from the last N days, groups by model, computes prompt hash stability %, fingerprint drift %, and decision match rate % per model. Same logic as `temp_zero_report.py` but as a live GQL query.

**New file:** `cloud/apps/api/src/graphql/queries/temp-zero-verification.ts`
**Modified:** `cloud/apps/api/src/graphql/queries/index.ts` (adds one import line)

### Step 2 — Implement web component (Task B, parallel with A)

The spec is at `/tmp/codex-spec-web.txt`. Run in the existing worktree:

```bash
cd /tmp/wt-temp0-verify-web
codex exec --full-auto "$(cat /tmp/codex-spec-web.txt)"
```

Then commit if needed:
```bash
git add cloud/apps/web/src/api/operations/temp-zero-verification.ts \
        cloud/apps/web/src/components/assumptions/TempZeroVerification.tsx \
        cloud/apps/web/src/pages/DomainAssumptions.tsx
git commit -m "Add TempZeroVerification UI component and operations"
```

Verify: `cd cloud && npm run typecheck --workspace @valuerank/web` must pass.

**What the component does:** Adds a "Temp=0 Verification Report" section at the bottom of the Assumptions tab. User picks days (7/14/30/90) and clicks "Generate". Shows a table of per-model metrics matching the `temp_zero_report.py` output.

**New files:**
- `cloud/apps/web/src/api/operations/temp-zero-verification.ts`
- `cloud/apps/web/src/components/assumptions/TempZeroVerification.tsx`

**Modified:** `cloud/apps/web/src/pages/DomainAssumptions.tsx` (adds `<TempZeroVerification />` before the modal)

### Step 3 — Pre-PR review and merge

After both worktrees are done:

1. Review full diff for API branch: `git diff main...feat/temp0-verify-api`
2. Review full diff for web branch: `git diff main...feat/temp0-verify-web`
3. Run full preflight from `cloud/`:
   ```bash
   npm run lint --workspace @valuerank/shared
   npm run lint --workspace @valuerank/db
   npm run lint --workspace @valuerank/api
   npm run test --workspace @valuerank/api  # needs DATABASE_URL + JWT_SECRET
   npm run build --workspace @valuerank/api
   npm run lint --workspace @valuerank/web
   npm run test --workspace @valuerank/web
   npm run build --workspace @valuerank/web
   ```
4. Create two PRs: `gh pr create --repo chrislawcodes/valuerank --head feat/temp0-verify-api` and same for web branch.

Note: PR #299 (badges) should also be merged before or alongside these. The web branch modifies `DomainAssumptions.tsx` — if #299 merges first, rebase to pick up its changes.

---

## Schema Contract (for both tasks)

The API query and web component must agree on these exact field names:

```graphql
query TempZeroVerificationReport($days: Int) {
  tempZeroVerificationReport(days: $days) {
    generatedAt
    transcriptCount
    daysLookedBack
    models {
      modelId
      transcriptCount
      adapterModes
      promptHashStabilityPct
      fingerprintDriftPct
      decisionMatchRatePct
    }
  }
}
```

---

## Coordination

Read `~/.claude/GEMINI-CODEX-GUIDE.md` before starting.

Codex is the right agent for both implementation tasks — it edits existing files conservatively.
Codex does not always commit — always run `git status` after each task.
Run verification from the **main repo** (`/Users/chrislaw/valuerank/cloud`), not from the worktree.

---

## Preflight Before Any Push

From `cloud/`:
```bash
npm run lint --workspace @valuerank/shared
npm run lint --workspace @valuerank/db
npm run lint --workspace @valuerank/api
npm run test --workspace @valuerank/api   # needs DATABASE_URL + JWT_SECRET
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```
