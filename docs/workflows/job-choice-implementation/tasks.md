# Tasks

## Immediate

- [x] Keep methodology docs current in [spec.md](/Users/chrislaw/valuerank/docs/plans/job-choice-vignettes/spec.md) and [plan.md](/Users/chrislaw/valuerank/docs/plans/job-choice-vignettes/plan.md)
- [x] checkpoint workflow spec
- [x] checkpoint workflow plan
- [x] implement Slice 1 scaffolding: transcript decision metadata, parser/adjudication types, and manual override provenance
- [x] implement Slice 2 vignette creation: transform utility, duplication script, and rewrite coverage for the ten role archetypes
- [x] implement Slice 3 text-label interpretation: summarize worker parsing, export metadata, and adjudication CSV support
- [x] implement Slice 4 launch UX: paired/ad hoc launch modes, companion run orchestration, and primary `Old V1` labeling on definition launch surfaces
- [x] implement the first transcript-focused Slice 5 reporting pass: ambiguous/fallback/manual surfacing and transcript coverage summaries
- [x] implement one-vignette manual pilot support: targeted local Job Choice generation, adjudication CSV export, and pilot runbook
- [x] implement full bridge support: multi-run bridge report generation, exemplar transcript links, and bridge review runbook
- [x] finish migration-facing UI cleanup: extend `Old V1` / `Job Choice` labels to run and analysis detail surfaces and keep paired/ad hoc state visible
- [ ] checkpoint workflow diff
  - blocked by unrelated dirty paths in the current repo worktree, which prevents canonical diff generation

## Verification Completed

- [x] run worker parser coverage in [test_summarize.py](/Users/chrislaw/valuerank/cloud/workers/tests/test_summarize.py)
- [x] run transform coverage in [job-choice-transform.test.ts](/Users/chrislaw/valuerank/cloud/scripts/__tests__/job-choice-transform.test.ts)
- [x] run export route coverage in [export.test.ts](/Users/chrislaw/valuerank/cloud/apps/api/tests/routes/export.test.ts)
- [x] run paired-batch GraphQL coverage in [run.test.ts](/Users/chrislaw/valuerank/cloud/apps/api/tests/graphql/mutations/run.test.ts)
- [x] run launch UX coverage in [RunForm.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/components/runs/RunForm.test.tsx)
- [x] run bridge report coverage in [job-choice-bridge-report.test.ts](/Users/chrislaw/valuerank/cloud/scripts/__tests__/job-choice-bridge-report.test.ts)
- [x] run transcript exemplar deep-link coverage in [AnalysisTranscripts.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/pages/AnalysisTranscripts.test.tsx)
- [x] run migration label coverage in [RunDetail.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/pages/RunDetail.test.tsx) and [AnalysisDetail.test.tsx](/Users/chrislaw/valuerank/cloud/apps/web/tests/pages/AnalysisDetail.test.tsx)
- [x] validate API and web typecheck
- [x] rebuild db package after schema/type changes

## Later

- [x] add migration-safe reporting and stability coverage surfacing in aggregate/stability views
