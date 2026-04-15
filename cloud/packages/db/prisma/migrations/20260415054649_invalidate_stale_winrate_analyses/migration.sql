-- Mark all existing CURRENT basic and AGGREGATE rows in analysis_results as SUPERSEDED.
-- This forces the frontend to show the "no analysis computed" state, prompting users
-- to click the existing manual recompute button. That triggers the recomputeAnalysis
-- mutation which enqueues a fresh job using the new winRate formula
-- (prioritized / (prioritized + deprioritized + neutral)).
-- See docs/workflow/feature-runs/winrate-honest-denominator/spec.md for context.

UPDATE "analysis_results"
SET "status" = 'SUPERSEDED'
WHERE "status" = 'CURRENT'
  AND "analysis_type" IN ('basic', 'AGGREGATE');
