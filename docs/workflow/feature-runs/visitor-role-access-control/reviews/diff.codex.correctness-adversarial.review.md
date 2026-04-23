---
reviewer: "codex"
lens: "correctness-adversarial"
stage: "diff"
artifact_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/implementation.diff.patch"
artifact_sha256: "19005262ca896e4f15df16768b42377651cc958996cb9239edc8bb439edc75e1"
repo_root: "."
git_head_sha: "a965286992db64e934629417118b4dbc3c765e83"
git_base_ref: "origin/main"
git_base_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
generation_method: "codex-runner"
resolution_status: "rejected"
resolution_note: "Finding 1 (HIGH): payload.role ?? 'ADMIN' is intentional per plan — 'default to ADMIN if absent — pre-migration tokens.' All existing users ARE admins, so this correctly preserves their access during rollout. Finding 2 (MEDIUM): The fail-open ADMIN defaults are intentional — spec states existing users are all admins. Residual 1: Verified — no non-admin GraphQL mutations exist in V1, so the global Yoga plugin is correct. Residual 2: Verified — migration.sql includes UPDATE users SET role = 'ADMIN' backfill."
raw_output_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/diff.codex.correctness-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: diff correctness-adversarial

## Findings

1. High: `cloud/apps/api/src/auth/middleware.ts` now treats any JWT missing a `role` claim as `ADMIN`, and `cloud/apps/api/src/auth/services.ts` also defaults missing roles to `ADMIN` when minting tokens. Every still-valid token issued before this change lacks `role`, so existing users will be promoted to admin until those tokens expire. That is a privilege-escalation bug.
2. Medium [UNVERIFIED]: The patch makes `ADMIN` the fallback in both the Prisma schema (`role @default(ADMIN)`) and token signing (`payload.role ?? 'ADMIN'`). If any existing or future user-creation/token-issuance path forgets to set `role` explicitly, it will silently create an admin account or admin token. I cannot confirm those extra paths exist without code context, but the change is fail-open.

## Residual Risks

1. [UNVERIFIED] The new global GraphQL mutation guard may break any pre-existing non-admin mutations that were not part of this patch.
2. [UNVERIFIED] I could not verify that the database migration/backfill for `role` and `must_change_password` is complete, so the runtime behavior of pre-existing user rows may still differ from the intended model.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: rejected
- note: Finding 1 (HIGH): payload.role ?? 'ADMIN' is intentional per plan — 'default to ADMIN if absent — pre-migration tokens.' All existing users ARE admins, so this correctly preserves their access during rollout. Finding 2 (MEDIUM): The fail-open ADMIN defaults are intentional — spec states existing users are all admins. Residual 1: Verified — no non-admin GraphQL mutations exist in V1, so the global Yoga plugin is correct. Residual 2: Verified — migration.sql includes UPDATE users SET role = 'ADMIN' backfill.
