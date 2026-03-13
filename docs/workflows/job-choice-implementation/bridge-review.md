# Bridge Review Workflow

## Goal

Produce an auditable bridge review artifact for the five-vignette `Job Choice` bridge using real run IDs.

This workflow is descriptive only. It does not claim cross-family equivalence.

## Inputs

- the completed run IDs for the bridge set
- local app base URL for transcript links, usually `http://localhost:3030`

## Generate the bridge artifact

From `/Users/chrislaw/valuerank/cloud`:

```bash
node --import tsx ./scripts/job-choice-bridge-report.ts \
  --base-url http://localhost:3030 \
  --output-dir /Users/chrislaw/valuerank/docs/workflows/job-choice-implementation/bridge-report \
  --run-id <run-id-1> \
  --run-id <run-id-2> \
  --run-id <run-id-3>
```

You can also put one run ID per line in a file and use:

```bash
node --import tsx ./scripts/job-choice-bridge-report.ts \
  --base-url http://localhost:3030 \
  --run-ids-file /absolute/path/to/bridge-run-ids.txt
```

## Outputs

The script writes:

- `job-choice-bridge-report.json`
- `job-choice-bridge-report.md`

Both files are tied to real runs and transcript IDs.

## What the artifact contains

- per-run summaries
- per-vignette summaries
- per-model/per-vignette summaries
- fallback exemplar transcript rows
- ambiguous exemplar transcript rows
- direct links back to:
  - the run page
  - the transcript inspection page for each exemplar

## Exemplar review

Each exemplar link opens the existing transcript inspection UI using:

- `/analysis/<run-id>/transcripts?transcriptId=<transcript-id>`

That path opens the matching transcript directly so reviewers can inspect parser metadata and, when needed, manually relabel ambiguous transcripts through the existing dropdown.

## Reviewer checklist

Use the bridge artifact to answer:

- what failed
- where it failed
- which vignette it failed on
- which model it failed on
- whether the failure was fallback-heavy, ambiguity-heavy, or dependent on manual cleanup

Then use the linked transcript exemplars to inspect specific failures rather than relying only on pooled counts.
