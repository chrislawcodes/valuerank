---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/models-consistency-report/plan.md"
artifact_sha256: "708b9e9c23963af06c3721f53052dda7263309da83183011e62e94cbeb099ddb"
repo_root: "."
git_head_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
git_base_ref: "origin/main"
git_base_sha: "a450f809c2b386ed7e089c87a5d4e83845aa4a68"
generation_method: "gemini-cli"
resolution_status: "accepted"
resolution_note: "No actionable findings detected — auto-accepted"
raw_output_path: "docs/workflow/feature-runs/models-consistency-report/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "full"
coverage_note: "accepted after manual reconciliation; findings reviewed and either fixed or documented as residual risks"
---

# Review: plan testability-adversarial

## Findings

### 1. HIGH: Resolver test strategy creates a significant blind spot by mocking the database layer

The plan proposes to test the resolver by mocking `db.analysisResult.findMany`. This means the tests will not validate the Prisma query sent to the database. The resolver's logic for filtering by tags (`tags: { some: { tag: { name: 'Aggregate' } } }`) and domain (`definition: { domainId }`) is complex and error-prone. A mistake in the structure of this `where` clause will not be caught by the proposed tests, as the mock will simply return whatever fixture is supplied, regardless of the query's correctness. This approach fails to test the most critical integration point in the API layer: the translation of GraphQL inputs to a valid database query.

**[CODE-CONFIRMED]** — The `graphql.ts` generated types confirm the relational complexity. The `Definition` type (line 455) has a `domain` (line 474) and `tags` (line 519), and `Run` (line 4776) has a `definition` (line 4825) with nested relations. The plan's proposed resolver flow confirms it will build a complex, nested Prisma query. Mocking `db.analysisResult.findMany` explicitly sidesteps testing this complex query logic.

### 2. HIGH: In-memory filtering for run signatures introduces an untestable performance bottleneck

The plan correctly notes that run signatures must be calculated from JSONB `config` fields and cannot be filtered directly in a `WHERE` clause. However, the proposed solution—fetching all `AGGREGATE` runs for a domain and filtering them in memory using `runMatchesSignature`—is not scalable. As the number of runs grows, this will become a major performance bottleneck, potentially leading to slow API responses or out-of-memory errors. The proposed testing strategy, which will use small data fixtures, will completely miss this scalability issue. The feature will pass all tests but fail under realistic load.

**[CODE-CONFIRMED]** — `domain-coverage-gql-types.ts` confirms that `runMatchesSignature` (line 123) operates on a `runConfig` object in memory. `graphql.ts` shows that `Run.config` is a JSON blob (line 4784, `Scalars['JSON']['output']`), making direct DB queries against its contents difficult and confirming why an in-memory approach was considered. However, the plan does not address the testability or performance implications of this choice.

### 3. MEDIUM: Deep-link URL testing is brittle and incomplete

The plan proposes to test the "View condition matrix →" and "View transcripts →" links by asserting that the generated URL string is correct. This is insufficient. This test can pass even if the feature is broken. It does not verify that the target pages (`DomainAnalysisValueDetail` and `AnalysisTranscripts`) can correctly parse the parameters from the generated URL and use them to fetch and render the correct data. A future change to the parameter parsing logic on the target pages (e.g., in `useSearchParams`) would break the user experience, but the proposed tests would continue to pass, creating a false sense of security.

**[CODE-CONFIRMED]** — The plan correctly identifies the target routes in `App.tsx` (lines 173, 237) and the helper `buildAnalysisTranscriptsPath` in `analysisRouting.ts`. The brittleness comes from the *testing strategy itself*, which only tests the *creation* of the link, not its *consumption* by the target component, leaving a critical integration point untested.

### 4. LOW: Web component test strategy for empty/error states is underspecified

The spec's User Story US-6 defines clear requirements for how the UI should behave when there is missing data, insufficient coverage, or pipeline errors (`invalid-summary-shape`). The plan's testing strategy for web components focuses on happy paths (rendering dots, sorting tables, opening drills). It fails to explicitly mention creating test cases that provide empty or error-shaped data from the GraphQL hook and assert that the correct empty states and footers (e.g., `InsufficientCoverageFooter`) are rendered instead of the application crashing.

**[UNVERIFIED]** — While the spec requires this behavior, the plan's "Testing Strategy" section for web components omits these specific negative test cases. This is a gap in the test plan, not necessarily the implementation plan, but it risks these states being shipped untested.

## Residual Risks

-   **Insufficient Integration Testing:** The most severe findings point to a testing strategy that over-relies on unit tests with mocks, creating blind spots at critical integration points (database, performance-under-load, and intra-app navigation). The risk is that individual units work, but the system as a whole does not. A small number of integration tests against a real (but temporary) test database would be required to mitigate this.
-   **Performance Under Load:** The in-memory signature filtering (Finding #2) poses a significant, untested performance risk. If this design is retained, the risk of slow performance or memory exhaustion in production should be formally documented and accepted.
-   **Pipeline Data Shape Brittleness:** The plan correctly identifies the dependency on the `AGGREGATE`-analysis pipeline. However, it assumes the structure of `reliabilitySummary` is stable. The plan for `parseRawReliabilitySummaryEntry` should include defensive parsing and robust error handling, with tests for malformed or incomplete `reliabilitySummary` JSON, to prevent the API from crashing if the pipeline emits an unexpected shape.

## Token Stats

- total_input=88125
- total_output=1206
- total_tokens=91917
- `gemini-2.5-pro`: input=88125, output=1206, total=91917

## Resolution
- status: accepted
- note: No actionable findings detected — auto-accepted
