# Specification Quality Checklist

**Purpose**: Validate spec completeness before implementation
**Feature**: [spec.md](../spec.md) | [spec-acceptance.md](../spec-acceptance.md)

## Content Quality

- [ ] No implementation details in spec (user stories describe behaviour, not code)
- [ ] Focused on user value (each story answers "what does the user get?")
- [ ] All mandatory sections completed (user stories, FRs, edge cases, success criteria)
- [ ] Input description clearly states what the feature does

## Requirement Completeness

- [ ] No `[NEEDS CLARIFICATION]` markers remain in spec.md
- [ ] Requirements testable and unambiguous (each FR has a clear pass/fail)
- [ ] Success criteria measurable (SC-001 through SC-006 all have concrete targets)
- [ ] All acceptance scenarios defined per user story
- [ ] Edge cases identified (negative balance, concurrency, null config, multi-provider)
- [ ] Scope clearly bounded (no balance history on provider; no hard block; no notifications)

## Priority Coverage

- [ ] P1 stories (US1, US2, US4) form a viable MVP without P2 stories
- [ ] P2 stories (US3, US5) are independently testable after foundation is in place
- [ ] No P1 story depends on a P2 story

## Constraint Coverage

- [ ] Atomicity constraint specified (FR-014 + Assumption 10)
- [ ] Deduction trigger location specified (Assumption 10 — `summarize-transcript.ts`)
- [ ] Provider identification approach specified (Assumption 5 — modelId prefix)
- [ ] Client-side gate specified (SC-004 — no round-trip)
- [ ] Validation layer specified (API layer — ValidationError for negatives)
