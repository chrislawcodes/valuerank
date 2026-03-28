# Specification Quality Checklist

**Feature**: [spec.md](../spec.md)

## Content Quality

- [ ] All [NEEDS CLARIFICATION] markers resolved
- [ ] Zero-count behavior is unambiguous (static text, not clickable)
- [ ] Paired vs pooled distinction is clear (isPooledAcrossRuns === true triggers paired path)
- [ ] "noisy" → "Unstable" label mapping documented in edge cases

## Requirement Completeness

- [ ] FR-001 through FR-007 all have corresponding tasks in tasks.md
- [ ] All three US acceptance scenarios covered by test tasks (T012, T015)
- [ ] Edge cases (companion loading, companion failed, both sections empty) handled in T007 and T010
- [ ] Success criteria (SC-001: 2s load, SC-002: two sections, SC-003: heading) covered by tasks
