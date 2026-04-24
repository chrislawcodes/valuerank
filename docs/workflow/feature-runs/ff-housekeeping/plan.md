# Plan

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH (atomicity overpromise): FIXED — FR-002 now scopes honestly: pre-check + sequential write, NOT transactional. Idempotent re-run is the recovery path. MEDIUM (quota classifier): FIXED — single canonical _is_codex_quota_exhaustion helper, expanded patterns. MEDIUM (smoke test ambient state): FIXED — FR-009 now specifies cwd=REPO_ROOT + FACTORY_RUNS_ROOT env redirect. MEDIUM (override sticky): FIXED — override scoped to head_sha.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: HIGH (atomicity): FIXED. HIGH (sticky override): FIXED — head_sha scope. MEDIUM (line count summing): FIXED — explicit added-only. MEDIUM (smoke test): FIXED — explicit harness contract. MEDIUM (quota too broad): FIXED — combined patterns + canonical helper.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: CRITICAL F-01 (atomicity): FIXED — honest scoping in FR-002. HIGH F-02 (line count noisy): FIXED — code-only file globs (.py/.ts/etc), not docs/configs. MEDIUM F-03 (branch_base unstated): FIXED — internal merge-base. MEDIUM F-04 (HTTP 429): FIXED — added to patterns. LOW F-05 (placeholder reasons): FIXED — 10-char minimum after strip. LOW F-06 (link blank): FIXED — concrete URL.
