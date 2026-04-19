# Back-Test Runbook

Run the back-test from the repo root with:

```bash
python3 docs/workflow/operations/codex-skills/feature-factory/scripts/backtest.py --since YYYY-MM-DD
```

Useful flags:

- `--no-gh` skips GitHub API access and marks CI data unavailable.
- `--include-overrides` includes features that were intentionally shipped over judge objection or with `--prompt-override`.
- `--incidents-path <path>` points the concern matcher at a different corpus. The default is `docs/incidents/`, but you can also point it at a single file such as `STATUS.md`.
- `--output-csv <path>` and `--output-md <path>` override the default report names.

## Output

The CSV includes one row per in-range feature with these fields:

- `slug`
- `merged_at`
- `stages_with_concerns`
- `unresolved_concerns_count`
- `annotations_count`
- `override_used`
- `ci_failures_48h`
- `reverts_7d`
- `concerns_matched_to_incidents`
- `outcome`

`outcome` means:

| Outcome | Meaning |
| --- | --- |
| `clean` | No revert, no incident match, no CI failure signal, and CI data was available. |
| `hotfixed` | CI showed failures in the 48-hour merge window, but there was no stronger signal. |
| `reverted` | A revert or hotfix-style commit showed up within 7 days of merge. |
| `incident` | One or more unresolved concerns matched incident post-mortem text. |
| `indeterminate` | CI data was unavailable and the other signals were not strong enough to classify the feature. |

## How To Read The Summary

- The top section gives the aggregate counts for the filtered corpus.
- The `Concerning Features` table lists every non-clean row, plus rows with low-confidence incident matches or CI unavailability.
- The `Flagged Calibration Candidates` section highlights rows that are most useful for prompt tuning:
  - features with `override_used: true`
  - features whose unresolved concerns matched an incident

If the matcher falls back to Jaccard similarity, the summary says `low-confidence match`. Treat those rows as weaker evidence.

## When To Rotate Judge Prompts

Rotate the judge prompts when either of these symptoms shows up:

- high false-positive rate on blocks
- high miss rate on incidents that later show up in the back-test

The point is to tighten the prompt where the back-test is consistently wrong, not to retune for a single bad run.

## Cadence

Run the back-test quarterly.

That cadence is slow enough to collect a meaningful sample and fast enough to catch prompt drift before it becomes the norm.

## Limits

This back-test is heuristic.

- Text matching is substring-based plus embedding similarity.
- Revert detection is pattern-based and can pick up false positives.
- Expect a 10-20% false-negative rate on incident matching even when the corpus is good.

Use the report as a calibration signal, not as a source of truth.
