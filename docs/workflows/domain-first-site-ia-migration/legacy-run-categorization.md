# Legacy Run Categorization

Generated: 2026-03-15

This note defines how legacy runs should behave once the product introduces clearer categories such as pilot, production, replication, and validation-oriented work.

## Problem

The current system does not yet persist the desired category model for all runs. Historical data will therefore contain runs that:

1. do not have a reliable category
2. were classified indirectly through tags or conventions
3. may represent exploratory, methodology, or production work without a first-class field

## Decision

Do not silently coerce legacy runs into the new categories.

Use an explicit fallback state:

1. `Unknown / Legacy`

## Rules

1. New category filters must be non-destructive toward historical data.
2. Historical runs that cannot be confidently backfilled remain visible as `Unknown / Legacy`.
3. `Unknown / Legacy` runs must not be silently excluded from history views.
4. `Findings` eligibility and exclusion rules must not depend on the UI guessing a legacy run’s true category.

## Backfill Guidance

If later data migration supports categorization:

1. only backfill when evidence is explicit enough
2. keep provenance of how the backfill was decided
3. avoid irreversible assumptions based solely on names or weak heuristics

## UI Guidance

1. History views should show a visible `Unknown / Legacy` badge where needed.
2. Filters should let users include or exclude `Unknown / Legacy` explicitly.
3. Documentation should state that old runs may not map cleanly to the new model.
