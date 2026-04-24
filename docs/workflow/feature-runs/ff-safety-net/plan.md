# Plan

## Review Reconciliation

- review: reviews/spec.codex.feasibility-adversarial.review.md | status: accepted | note: HIGH (brittle veto): FR-001 now requires structured unaddressed_high_finding_ids field from completeness judge — regex removed, FR-016 made mandatory not optional. MEDIUM (registry lambda gap): FR-011 now wraps run_judge in named command_judge, no lambdas in dispatch. MEDIUM (GC atomicity): FR-014 requires lock-before-GC sequence.
- review: reviews/spec.codex.edge-cases-adversarial.review.md | status: accepted | note: HIGH (brittle veto): same as feasibility — structured signal now mandatory. MEDIUM (registry scope): FR-009 enumerates from argparse dispatcher, not command_* scan. MEDIUM (init misclassified): FR-011 reclassifies init as @mutates_state. MEDIUM (intermediate count): FR-015 canonical list is 5 globs, referenced consistently.
- review: reviews/spec.gemini.requirements-adversarial.review.md | status: accepted | note: HIGH (brittle veto): structured unaddressed_high_finding_ids field is now mandatory (FR-001). MEDIUM (registry authority): FR-009 derives from argparse. MEDIUM (GC race): FR-014 lock-before-GC. LOW (cross-ref state.json): FR-003 checks ground-truth state — if judge names an id that's already resolved, veto doesn't fire. LOW (static GC list): accepted as known limitation, list is named + test documents it.
