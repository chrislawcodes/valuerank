# Wave Scope Manifests

Each implementation wave should define its own scope manifest in this folder.

Rules:

1. name the file after the wave or slice, for example:
   - `wave-3-launch-contract.scope.json`
   - `wave-3-grouped-domain-queries.scope.json`
2. include only the files intentionally changed in that wave
3. also list earlier-wave prerequisite files that this wave depends on even if they are unchanged
4. include a short review-context note describing:
   - what changed in the current wave
   - which prerequisite contracts are intentionally assumed present
   - what remains out of scope
5. include the exact verification commands run for the wave
6. when generating the diff checkpoint, include untracked files from the manifest as no-index patches so new pages, tests, and docs are not silently dropped from review
7. generate the diff checkpoint from that manifest by default
8. keep the feature-wide [scope.json](/Users/chrislaw/valuerank/docs/workflows/domain-first-site-ia-migration/scope.json) for closeout, cross-wave regression checks, and broad reconciliation only

Why this is required:

1. wave-scoped diffs improve Gemini focus
2. but they can create false blockers if a review cannot see prerequisite files from earlier accepted waves
3. explicit prerequisites and review context let us keep the diff small without pretending the wave is standalone
4. explicit verification commands make reconciliation cleaner when a review raises issues that tests already disproved
5. including untracked files avoids false confidence when a wave adds new pages or tests that `git diff` alone would skip

Minimum manifest shape:

```json
{
  "paths": [
    "cloud/apps/api/src/graphql/queries/domain/evaluation.ts",
    "cloud/apps/web/src/api/operations/domains.ts",
    "cloud/apps/api/tests/graphql/queries/domain.test.ts",
    "docs/workflows/domain-first-site-ia-migration/plan.md",
    "docs/workflows/domain-first-site-ia-migration/tasks.md"
  ],
  "allowed_dirty_paths": [
    "cloud/apps/api/src/graphql/queries/domain/evaluation.ts",
    "cloud/apps/web/src/api/operations/domains.ts",
    "cloud/apps/api/tests/graphql/queries/domain.test.ts",
    "docs/workflows/domain-first-site-ia-migration/plan.md",
    "docs/workflows/domain-first-site-ia-migration/tasks.md"
  ],
  "prerequisite_paths": [
    "cloud/apps/web/src/api/operations/domains.ts"
  ],
  "review_context": {
    "summary": "This wave adds grouped domain query surfaces without changing the earlier launch mutation contracts.",
    "assumed_present": [
      "`startDomainEvaluation` and the typed domain operations from the earlier backend launch-contract wave are already landed."
    ],
    "out_of_scope": [
      "No new UI wave is included here.",
      "No findings-eligibility work is included here."
    ]
  },
  "verification_commands": [
    "npm run typecheck --workspace=@valuerank/api",
    "npm run typecheck --workspace=@valuerank/web",
    "npm test --workspace=@valuerank/api -- tests/graphql/queries/domain.test.ts"
  ]
}
```

Additional rule:

1. if a wave adds a new modal, dialog, status panel, or other scoped surface, the implementation should expose an accessible role or label and the tests should assert against that surface directly instead of relying on ambiguous global text matches
