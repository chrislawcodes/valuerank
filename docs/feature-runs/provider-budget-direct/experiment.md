# Provider Budget Direct — Stage A Experiment Log

## Pipeline Summary

| Stage | Artifact | Issues raised | Issues accepted | Artifact revised? | Claude tokens |
|-------|----------|--------------|-----------------|-------------------|--------------|
| Spec | spec.md | 5 | 4 (A,B,C,E) | Yes — 2 commits | ~180k cache read |
| Plan | plan.md | 5 | 4 (A,B,C,D) | Yes — 2 commits | ~230k cache read |
| Tasks | tasks.md | 5 | 2 (B,C) | Yes — 2 commits | ~280k cache read |
| Implement | code | 5 | 1 (C, low risk) | No — issues were pre-existing or low risk | ~32M cache read, 73k output |

Token totals (since session start):
- input_tokens: 306
- cache_creation_input_tokens: 362,134
- cache_read_input_tokens: 32,477,570
- output_tokens: 73,336

---

## SHA Checkpoints

| Stage | Before SHA | After SHA |
|-------|-----------|-----------|
| Spec (initial) | 5b048040 | 40cf9d1e |
| Spec (revised) | 40cf9d1e | 402ca356 |
| Plan (initial) | 402ca356 | 7c8e0d8a |
| Plan (revised) | 7c8e0d8a | f37344e3 |
| Tasks (initial) | f37344e3 | 4d9701fb |
| Tasks (revised) | 4d9701fb | ade9938c |
| Phase 1 (DB schema) | ade9938c | 3f28a65d |
| Phase 2 (DB queries) | 3f28a65d | 3a1db493 |
| Phase 3 (GraphQL) | 3a1db493 | 2a423c34 |
| Phase 4 (run hook) | 2a423c34 | 088a57b0 |
| Phase 5 (web UI) | 088a57b0 | ef9d0fc1 |
| Phase 6 (pre-run warning) | ef9d0fc1 | 2e4fe214 |

---

## Adversarial Review Detail

### Spec Review
Issues raised:
- **A (Accepted):** Run cost lookup ambiguous — `Run` model has no `estimatedCost`. Fixed: use `transcript.estimatedCost` summed at completion.
- **B (Accepted):** `syncBalance` vs `balance` input creates confusion. Fixed: separate `syncProviderBalance` mutation.
- **C (Accepted):** Scope boundary contradicted multi-provider split description. Fixed: removed contradictory bullet.
- **D (Rejected):** `MANUAL_SET` event not in user stories — it's implied by US-2.
- **E (Accepted):** Need explicit callout that `LLM_PROVIDER_FRAGMENT` must be updated. Added.

### Plan Review
Issues raised:
- **A (Accepted):** `modelId.split(':')[0]` not safe for non-standard model IDs. Fixed: skip models without `:`, document convention.
- **B (Accepted):** Full `LLM_PROVIDERS_QUERY` in RunForm is too heavy. Fixed: add lightweight `LLM_PROVIDER_BALANCES_QUERY`.
- **C (Accepted):** Set/sync balance as one merged UX flow. Fixed: single "Set/Sync Balance" field in modal.
- **D (Accepted):** Missing reverse relations for `ProviderBudgetEvent`. Fixed: added to schema plan.
- **E (Accepted):** Circular import risk check. Confirmed: `budget.ts` → `@valuerank/db` only, no cycle.

### Tasks Review
Issues raised:
- **A (Rejected):** Deduction fires multiple times concern — already handled by `allDone` guard.
- **B (Accepted):** Race condition in deduction. Fixed: use atomic `{ decrement: amount }` inside `$transaction`.
- **C (Accepted):** Rate limit save + balance sync are separate calls. Fixed: task clarified both always run independently.
- **D (Accepted):** `RunForm.tsx` path confirmed correct.
- **E (Rejected):** Query index already exports via wildcard.

### Implementation Review
Issues raised:
- **A (Resolved):** `getProviderByName` export confirmed ✓
- **B (Low risk):** Sync balance read/write not fully atomic — acceptable for manual user action
- **C (Accepted, low risk):** MANUAL_SET event creation not in transaction with provider update
- **D (Resolved):** `useQuery` properly imported in RunForm ✓
- **E (Resolved):** `balance` undefined guard in GraphQL resolver prevents spurious events ✓

---

## Preflight Results

| Step | Result |
|------|--------|
| `npm run lint --workspace @valuerank/shared` | PASS (from main repo) |
| `npm run lint --workspace @valuerank/db` | PASS (from main repo) |
| `npm run lint --workspace @valuerank/api` | PASS (warnings only, no errors, all pre-existing) |
| `npm run build --workspace @valuerank/api` | PASS |
| `npm run lint --workspace @valuerank/web` | 2 pre-existing errors (DomainEvaluationStatusDrawer, DomainTrialsDashboard) — not introduced by this branch |
| `npm run test --workspace @valuerank/web` | PASS (1469 tests) |
| `npm run build --workspace @valuerank/web` | PASS |
| `npm run test --workspace @valuerank/api` | SKIPPED — no DATABASE_URL available |

Note: Web lint has 2 pre-existing errors not introduced by this branch (confirmed via `git diff origin/main --name-only`).

---

## Files Changed

### New files
- `cloud/packages/db/prisma/migrations/20260331000000_add_provider_budget/migration.sql`
- `cloud/apps/api/src/services/run/budget.ts`
- `docs/feature-runs/provider-budget-direct/spec.md`
- `docs/feature-runs/provider-budget-direct/plan.md`
- `docs/feature-runs/provider-budget-direct/tasks.md`
- `docs/feature-runs/provider-budget-direct/experiment.md`

### Modified files
- `cloud/packages/db/prisma/schema.prisma` — LlmProvider budget fields, ProviderBudgetEvent model
- `cloud/packages/db/src/queries/llm.ts` — updateProvider extended, syncProviderBalance, deductFromProviderBalance
- `cloud/apps/api/src/graphql/types/llm-provider.ts` — balance fields exposed
- `cloud/apps/api/src/graphql/types/inputs/llm.ts` — balance in UpdateLlmProviderInput
- `cloud/apps/api/src/graphql/mutations/llm.ts` — balance wired, syncProviderBalance mutation
- `cloud/apps/api/src/queue/handlers/summarize-transcript.ts` — deductProviderBudget hook
- `cloud/apps/web/src/api/operations/llm.ts` — LlmProvider type + fragment + queries/mutations
- `cloud/apps/web/src/components/settings/models/ProviderSection.tsx` — balance badge
- `cloud/apps/web/src/components/settings/models/ProviderSettingsModal.tsx` — sync balance UI
- `cloud/apps/web/src/components/settings/models/types.ts` — syncBalance in props
- `cloud/apps/web/src/components/settings/models/ModelsPanel.tsx` — syncBalance mutation
- `cloud/apps/web/src/components/runs/RunForm.tsx` — pre-run warning
