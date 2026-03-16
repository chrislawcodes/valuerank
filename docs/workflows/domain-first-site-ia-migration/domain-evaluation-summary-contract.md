# Domain Evaluation Summary Contract

Generated: 2026-03-15

This note defines the minimum contract for the `Domain Evaluation Summary` surface.

## Purpose

`Domain Evaluation Summary` is the authoritative page for one domain-wide evaluation cohort.

It is not:

1. an individual run detail page
2. the global status center
3. a synthetic list with no launch-level identity

## Minimum Data Contract

The summary needs:

1. domain identity
2. evaluation identifier
3. evaluation scope
   - pilot
   - production
   - validation-oriented where supported
4. included vignette/run membership
5. aggregate status counts
6. launch timestamp
7. failure and stall visibility
8. links to each member run detail

## Source-Of-Truth Rules

1. The evaluation summary is authoritative for the cohort.
2. Individual run detail is authoritative for one run.
3. The global status center is authoritative only for cross-domain operational monitoring at its declared scope.

## Interim Constraint

Until there is a stronger backend cohort contract:

1. do not imply the summary is a persisted domain-run object if it is only orchestrating grouped vignette runs
2. make the cohort identity explicit
3. preserve links back to individual persisted run records
