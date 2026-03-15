-- Add [level] token prefix to all job-choice domain value statement bodies.
--
-- Idempotency guard: only updates rows that don't already start with '[level]'
-- so this script can be run multiple times safely.
--
-- Dry-run first (preview affected rows):
--   SELECT id, token, body FROM value_statements
--   WHERE domain_id = (SELECT id FROM domains WHERE normalized_name = 'job-choice')
--     AND body NOT LIKE '[level]%';
--
-- Then apply:
UPDATE value_statements
SET body = '[level] ' || body
WHERE domain_id = (SELECT id FROM domains WHERE normalized_name = 'job-choice')
  AND body NOT LIKE '[level]%';
