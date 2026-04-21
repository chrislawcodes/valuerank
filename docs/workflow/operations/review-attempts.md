# Review Attempts Log

Feature Factory review runners append metadata to `review-attempts.jsonl`.

This is a central learning log. It is intentionally outside individual feature-run
folders so old run cleanup does not erase the size and reliability history.

The log stores one JSON object per review attempt. It records sizes, stage, reviewer,
model, lens, coverage, result, duration, exit code, artifact hash, and review path.

It must not store prompt text, artifact contents, review bodies, secrets, or credentials.

Use this log to answer questions like:

- which artifact sizes usually pass for each model
- where partial reviews happen most often
- whether failures are caused by size, timeout, malformed output, or runner errors
- whether specs, plans, tasks, and diffs need different limits
