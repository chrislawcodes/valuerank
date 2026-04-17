-- Invalidate all CURRENT basic and aggregate analyses.
-- Required because the analysis read path (queries/analysis.ts:21) queries
-- by status='CURRENT' only and does not filter by codeVersion.
-- After this migration, existing runs show "no analysis yet" state and
-- re-analyze on demand under the new two-step winRate formula.
UPDATE "analysis_results"
SET "status" = 'SUPERSEDED'
WHERE "status" = 'CURRENT'
  AND "analysis_type" IN ('basic', 'AGGREGATE');
