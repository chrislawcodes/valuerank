---
reviewer: "codex"
lens: "implementation-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/visitor-role-access-control/plan.md"
artifact_sha256: "b5d7886689ab9b229a9239aee69236e8c6208e9b9bf6846df8928c75363b667e"
repo_root: "."
git_head_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
git_base_ref: "origin/main"
git_base_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/plan.codex.implementation-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: plan implementation-adversarial

## Findings

1. [UNVERIFIED] Medium: `mustChangePassword` is only enforced in the web router. The plan still allows the same JWT to call GraphQL and REST directly, so a newly created admin can use the API before changing the temporary password. If the intent is to lock the account until password change, the API layer has to reject requests while this flag is true.

2. [UNVERIFIED] Medium: Wave 1 backfills every existing user to `ADMIN` with no audit or exception path. If the current table contains any legacy non-admin, test, or service accounts, this silently expands their privileges. The plan needs a data check before assuming all existing rows are safe to elevate.

3. [UNVERIFIED] Medium: The user-creation paths are inconsistent. The GraphQL `createUser` flow forces `mustChangePassword: true`, but the CLI `create-user` path still defaults to `ADMIN` and does not add the forced-password-change flag. That creates a second, over-privileged account-creation path that bypasses the policy the feature is trying to enforce.

## Residual Risks

- Stale JWT claims still apply for the full token lifetime. Role changes are not immediate, and the plan accepts that as a V1 limitation.

- The password-change flow depends on the web app being able to replace the active JWT from the response. If the current auth storage is not writable from the client, the redirect fix will not work.

- The plan intentionally leaves some read-only GraphQL queries and non-GraphQL routes outside role enforcement. That is only safe if those endpoints are verified to return no sensitive data.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
