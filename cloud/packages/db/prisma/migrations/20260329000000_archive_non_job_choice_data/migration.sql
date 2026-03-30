-- Archive non-job-choice domain data
-- Soft-deletes transcripts, runs, definitions, and scenarios belonging to
-- domains other than 'job-choice'. Data scored under the legacy Likert 1-5
-- instrument is incompatible with the v2 canonical decision model.
--
-- Reversible: UPDATE <table> SET deleted_at = NULL WHERE deleted_at IS NOT NULL;

-- Step 1: Soft-delete transcripts belonging to non-job-choice domains (batched)
DO $$
DECLARE
  batch_size INT := 1000;
  affected INT;
  total_affected INT := 0;
BEGIN
  LOOP
    UPDATE transcripts t
    SET deleted_at = NOW()
    WHERE t.id IN (
      SELECT t2.id FROM transcripts t2
      JOIN runs r ON r.id = t2.run_id
      JOIN definitions d ON d.id = r.definition_id
      LEFT JOIN domains dom ON dom.id = d.domain_id
      WHERE t2.deleted_at IS NULL
        AND (dom.normalized_name IS NULL OR dom.normalized_name != 'job-choice')
      LIMIT batch_size
    );
    GET DIAGNOSTICS affected = ROW_COUNT;
    total_affected := total_affected + affected;
    EXIT WHEN affected = 0;
  END LOOP;
  RAISE NOTICE 'Soft-deleted % transcripts', total_affected;
END $$;

-- Step 2: Soft-delete runs with zero non-deleted transcripts
UPDATE runs r
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM transcripts t
    WHERE t.run_id = r.id AND t.deleted_at IS NULL
  );

-- Step 3: Soft-delete definitions with zero non-deleted runs
UPDATE definitions d
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM runs r
    WHERE r.definition_id = d.id AND r.deleted_at IS NULL
  );

-- Step 4: Soft-delete scenarios linked to soft-deleted definitions
UPDATE scenarios s
SET deleted_at = NOW()
WHERE deleted_at IS NULL
  AND s.definition_id IN (
    SELECT id FROM definitions WHERE deleted_at IS NOT NULL
  );
