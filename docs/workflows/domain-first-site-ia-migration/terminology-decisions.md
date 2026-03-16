# Terminology Decisions

Generated: 2026-03-15

This document locks the product-language choices for the domain-first migration.

## Canonical Terms

| Product Term | Meaning | Legacy/Internal Mapping | Notes |
| --- | --- | --- | --- |
| `Domain` | research program | `Domain` | unchanged |
| `Vignette` | instrument component / prompt family | `Definition` | UI term |
| `Attribute` | one side of a comparison | `Dimension` | use `attribute` in new UX/docs |
| `Condition` | one exact evaluated case | sometimes `scenario` | use `condition` when exact case is meant |
| `Narrative` | presented comparison text | sometimes `scenario` | use `narrative` when presented wording is meant |
| `Run` | persisted vignette-scoped execution record | `Run` | reserve for vignette-scoped record |
| `Domain Evaluation` | user action launching work across multiple vignettes in one domain | previously referred to informally as a domain run | UI term |
| `Batch` | full pass through all planned conditions for one vignette by one model | `Batch` | keep precise meaning |
| `Trial` | one model answering one condition once | `Trial` | unchanged |
| `Diagnostics` | instrument-focused analysis | mixed `analysis` language today | keep distinct from findings |
| `Findings` | auditable domain interpretation | mixed `analysis` language today | primary interpretation term |
| `Validation` | methodology reference and cross-domain reporting | `Assumptions` | top-level nav label |
| `Archive` | historical research surfaces | `Survey`, `Survey Results`, legacy studies | top-level nav label |

## Locked Label Decisions

1. Use `Validation`, not `Methods` or `Assumptions`, as the top-level navigation label.
2. Use `Archive`, not `Studies`, for historical work.
3. Use `Findings`, not `Analysis`, as the domain interpretation tab.
4. Use `Domain Evaluation`, not `domain run`, as the user-facing name for the domain-wide execution action.

## Transitional Labeling Rules

1. Old assumptions surfaces should use explicit `Validation` transitional framing before they are retired.
2. Legacy analysis surfaces should show `Old V1`, `Legacy`, or similarly clear compatibility labeling when they are still live.
3. Any surface that is still behaviorally old but living under a new top-level label must say so directly.

## Language To Avoid

1. Do not use `run` to mean both a domain-wide launch and a vignette-scoped execution record in the same surface.
2. Do not use `analysis` as a catch-all when you mean diagnostics, findings, or validation reporting specifically.
3. Do not use `studies` for historical-only navigation if active work does not live there.
4. Do not use `scenario` without clarifying whether you mean a `condition` or a `narrative`.
