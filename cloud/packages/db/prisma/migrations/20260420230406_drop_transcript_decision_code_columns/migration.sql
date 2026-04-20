-- Drop the legacy decision_code and decision_code_source columns on transcripts.
--
-- Prerequisite: the remove-decisionCode migration (PR #713) has written
-- canonicalDecision to every summaryCache.summary at cacheVersion: 2, and
-- stripped the summary-level decisionCode field from every row. The top-level
-- transcripts.decision_code column has not been read by application code
-- since W4 of that PR, and the manual-override mutation (W8) stopped writing
-- to it. This migration drops the now-unused columns.
--
-- Note: the migration against prod (commit 1f087505 deploy + --apply run)
-- verified SC-003: zero rows with summary.decisionCode. The column-level
-- decision_code column itself may still hold residual values from before
-- W4 removed the writes, but those values are no longer read or displayed.
ALTER TABLE "transcripts" DROP COLUMN IF EXISTS "decision_code";
ALTER TABLE "transcripts" DROP COLUMN IF EXISTS "decision_code_source";
