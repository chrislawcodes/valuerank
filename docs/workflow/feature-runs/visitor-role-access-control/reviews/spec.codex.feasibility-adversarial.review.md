---
reviewer: "codex"
lens: "feasibility-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/visitor-role-access-control/spec.md"
artifact_sha256: "982399748eb1c1d1cca09c98488653ecbd6d55741fbcd294ed2c07659ae98ee1"
repo_root: "."
git_head_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
git_base_ref: "origin/main"
git_base_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/spec.codex.feasibility-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec feasibility-adversarial

## Findings

1. High: FR-006 says every GraphQL mutation must call `requireAdmin()`, but FR-005c says `changePassword` is the one Visitor-allowed mutation and must not call `requireAdmin()`. That is a direct contradiction. If implemented literally, the first-login password-change flow for new Visitor accounts will be blocked.
2. Medium [UNVERIFIED]: The server-side access-control scope covers write mutations and `/api/import`, but it does not require role checks on read resolvers for admin-only data. If the existing API has queries behind `/settings/models`, `/settings/infrastructure`, `/settings/api-keys`, `/preambles`, `/level-presets`, or other admin surfaces, a Visitor can still pull that data directly.
3. Medium: The auth model is incomplete for the required first-login flow. FR-009b says JWTs and the top-level route guard must carry `mustChangePassword`, but the `AuthUser` additions only include `role`. That missing field makes the redirect-loop logic easy to omit or implement inconsistently.
4. Medium [UNVERIFIED]: FR-019 enumerates specific protected paths instead of a route pattern or subtree rule. If the app has nested child routes or aliases under those sections, any path not explicitly listed can slip past the guard.

## Residual Risks

- Demoted admins keep old JWT privileges until expiry by design. That means role removal is not immediate and a compromised admin session can still write for up to 24h.
- `updateUserRole` relies on SERIALIZABLE transactions to protect the last-admin invariant. The spec does not say whether the UI/backend should retry serialization failures, so concurrent role changes may produce intermittent user-visible errors.
- The first-login password-change flow depends on the client reading `mustChangePassword` before rendering any protected area. If auth state loads late, there is still a risk of a brief flash or redirect loop.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
