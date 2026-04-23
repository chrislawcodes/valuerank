---
reviewer: "codex"
lens: "risk-adversarial"
stage: "spec"
artifact_path: "docs/workflow/feature-runs/visitor-role-access-control/spec.md"
artifact_sha256: "982399748eb1c1d1cca09c98488653ecbd6d55741fbcd294ed2c07659ae98ee1"
repo_root: "."
git_head_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
git_base_ref: "origin/main"
git_base_sha: "e1ccb3b9b7fd4393d2c3f4a2d8d7fab1477e1f1d"
generation_method: "codex-runner"
resolution_status: "accepted"
resolution_note: "MEDIUM admin read endpoints: accepted by design — writes are restricted server-side, reads for admin config pages are protected by client-side route guards only. The data (LLM model configs, infra settings) is not sensitive credentials. MEDIUM FR-006 conflict with FR-005c: clarified in FR-006 — mutations call requireAdmin() EXCEPT those in FR-005c. MEDIUM nested route matching: addressed in FR-019 — now specifies wildcard prefix matching for all restricted sections. MEDIUM email uniqueness: addressed in FR-014 — lowercase canonicalization + DB unique constraint. MEDIUM REST write audit: addressed in FR-014a — /api/import is the only write endpoint; default-deny rule documented for future routes."
raw_output_path: "docs/workflow/feature-runs/visitor-role-access-control/reviews/spec.codex.risk-adversarial.review.md.raw.txt"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: ""
---

# Review: spec risk-adversarial

## Findings

- Medium [UNVERIFIED]: The spec only enforces roles on write paths and client-side route guards. It never says which read queries or read REST endpoints for restricted areas are admin-only. That leaves a direct API bypass for data behind `/settings/models`, `/settings/infrastructure`, `/preambles`, `/level-presets`, and any other admin-only read surface if those APIs exist. Add explicit server-side authorization for all restricted reads, not just writes.
- Medium: FR-006 says every GraphQL mutation must call `requireAdmin()`, but FR-005c and FR-009b carve out `changePassword` and other account flows. As written, this is easy to implement wrong and could accidentally block password changes or token-related mutations. Split the rule into an explicit admin-only mutation list plus an explicit visitor-safe exception list.
- Medium: The guarded route list is underspecified for nested paths. You use `/archive/*` for one area but exact paths for others like `/settings/users` and `/domains/manage`. If those sections gain child routes, a visitor could slip past the guard by hitting a nested URL. Define prefix or wildcard matching for every restricted section.
- Medium: Email uniqueness is only described as a validation check. That is not enough under concurrent requests, and it leaves case-normalization undefined. Enforce a DB unique constraint on a canonicalized email value and state whether `Alice@example.com` and `alice@example.com` are the same account.
- Medium [UNVERIFIED]: The spec assumes `/api/import` is the only REST write endpoint that needs role gating. If any other REST write routes already exist, they are not explicitly covered and could remain visitor-accessible. Add a complete REST audit or a default-deny rule for all write handlers.

## Residual Risks

- Existing JWTs keep their old role until expiry, so a demoted admin can still perform admin actions for up to the token lifetime. The spec accepts this, but it is still a real exposure window.
- The export scope is broad and only partially defined. If evaluation data contains embedded sensitive metadata, the export may still leak more than intended unless the payload is tightly constrained.
- The spec does not require an audit trail for account creation or role changes. That makes incident review and abuse investigation harder if something goes wrong.

## Runner Stats
- total_input=0
- total_output=0
- total_tokens=0

## Resolution
- status: accepted
- note: MEDIUM admin read endpoints: accepted by design — writes are restricted server-side, reads for admin config pages are protected by client-side route guards only. The data (LLM model configs, infra settings) is not sensitive credentials. MEDIUM FR-006 conflict with FR-005c: clarified in FR-006 — mutations call requireAdmin() EXCEPT those in FR-005c. MEDIUM nested route matching: addressed in FR-019 — now specifies wildcard prefix matching for all restricted sections. MEDIUM email uniqueness: addressed in FR-014 — lowercase canonicalization + DB unique constraint. MEDIUM REST write audit: addressed in FR-014a — /api/import is the only write endpoint; default-deny rule documented for future routes.
