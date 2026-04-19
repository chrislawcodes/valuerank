---
reviewer: "gemini"
lens: "testability-adversarial"
stage: "plan"
artifact_path: "docs/workflow/feature-runs/finding-2-graphql-tightening/plan.md"
artifact_sha256: "e2f094ca68876263832b386606a4cf70d0093373146b8a47edd1a42633c2f006"
repo_root: "."
git_head_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
git_base_ref: "origin/main"
git_base_sha: "6aa2af3410351431f88a8a4bc12fda6deeef7c8e"
generation_method: "gemini-cli"
resolution_status: "deferred"
resolution_note: "Latest-round review outcome deferred per convergence rule (round cap reached)."
raw_output_path: "docs/workflow/feature-runs/finding-2-graphql-tightening/reviews/plan.gemini.testability-adversarial.review.md.json"
narrowed_artifact_path: ""
narrowed_artifact_sha256: ""
coverage_status: "partial"
coverage_note: "context exceeded max_context_chars and was narrowed"
---

# Review: plan testability-adversarial

## Findings

| Severity | Finding | Evidence |
| --- | --- | --- |
| **HIGH** | ESLint rule is too permissive and can be bypassed. | `[CODE-CONFIRMED]` |
| **MEDIUM** | Inconsistent cache invalidation creates stale UI risk. | `[CODE-CONFIRMED]` |
| **LOW** | Verification for schema regeneration is insufficient. | `[CODE-CONFIRMED]` |
| **LOW** | Creation of `narrowings.ts` is not assigned to a slice. | `[UNVERIFIED]` |

### 1. High - ESLint rule is too permissive and can be bypassed

The proposed ESLint rule `no-hand-typed-graphql-shapes` is designed to flag `TSTypeAliasDeclaration`s that are object literals (`TSTypeLiteral`) only if they have `≥ 2` members. This would allow developers to manually define single-property type aliases (e.g., `export type MyBadType = { customField: string };`), which subverts the primary goal of the rule. This creates a loophole that allows the same category of technical debt—manually-defined GraphQL shapes that can go stale—to persist or be reintroduced. The rule should flag any `TSTypeLiteral` with one or more members when used for a GraphQL type alias to be effective.

**Evidence**: `[CODE-CONFIRMED]`
The plan artifact itself describes this flawed logic:
> `TSTypeLiteral` (object literal) with ≥ 2 members → FLAG

### 2. Medium - Inconsistent cache invalidation creates stale UI risk

The `useDomains` hook has inconsistent cache invalidation logic. While `createDomain`, `renameDomain`, and `deleteDomain` all correctly call `refetch()` to update the main `DOMAINS_QUERY`, the `assignDomainToDefinitions` and `assignDomainToDefinitionsByFilter` mutations do not. Consequently, after assigning definitions to a domain, the UI will not reflect changes (e.g., an updated `definitionCount`) until a manual page refresh. This is a pre-existing bug, but since the plan involves modifying types consumed by this hook, it presents a missed opportunity for a simple correctness and testability fix.

**Evidence**: `[CODE-CONFIRMED]`
The `useDomains.ts` file shows the `assignDomainToDefinitions` function awaiting the mutation and returning without calling `refetch()` or `reexecuteQuery()`, unlike other mutations in the same hook.
```typescript
// cloud/apps/web/src/hooks/useDomains.ts

  const assignDomainToDefinitions = async (
    definitionIds: string[],
    domainId: string | null
  ): Promise<DomainMutationResult | null> => {
    const result = await assignIdsMutation({ definitionIds, domainId });
    if (result.error) throw new Error(result.error.message);
    // >> MISSING refetch() call here <<
    return result.data?.assignDomainToDefinitions ?? null;
  };
```

### 3. Low - Verification for schema regeneration is insufficient

The verification plan for Slice 0, which regenerates the `schema.graphql` snapshot, is not robust enough. The plan's verification consists of searching for key fields with `grep` and ensuring `npm run codegen` succeeds. This does not check for breaking type changes introduced in the new schema (e.g., a field changing from required to optional, or a type name changing). The `tsc` build check, which would catch such errors, is not mentioned until the verification steps for later slices. It should be performed immediately after schema regeneration in Slice 0 to isolate any schema-related breakages early.

**Evidence**: `[CODE-CONFIRMED]`
The "Verification" section for Slice 0 in `plan.md` only lists `grep` and `npm run codegen`, omitting a type-checking step.

### 4. Low - Creation of `narrowings.ts` is not assigned to a slice

The plan correctly identifies the need for a `narrowings.ts` file to handle the `estimateConfidence` string-to-union-type conversion. However, the creation of this file is only mentioned in the high-level "Approach" and "ESLint rule design" sections and is not assigned to a concrete implementation slice. This makes the plan less actionable. This task should be explicitly included in a slice, likely Slice 2 where the related `ESTIMATE_DOMAIN_EVALUATION_COST_QUERY` is handled, or in its own slice before the ESLint rule is added.

**Evidence**: `[UNVERIFIED]`
This is a finding about the structure of the `plan.md` artifact itself; the slice breakdown does not contain an explicit action item to create this file.

## Residual Risks

### 1. Unassessed Performance Impact of Larger Generated File

The generated `graphql.ts` file is already large (over 6,900 lines). Adding more fields to multiple queries will increase its size further. The plan does not account for assessing the potential performance degradation on IDE features (e.g., TypeScript language server, IntelliSense) or on build times. While the impact may be minor, this risk is unmitigated.

### 2. Inconsistent Codebase State

The plan makes a pragmatic decision to limit the refactoring scope to `domains.ts` and allowlist several other files (`runs.ts`, `definitions.ts`, etc.) that contain the same type of technical debt. While this is a reasonable scoping choice, it leaves the codebase in a temporarily inconsistent state where some GraphQL operation files are strictly typed against the schema and others are not. This increases the cognitive load for future developers and creates a risk that new code will follow the old, untyped pattern in those files until the follow-up work is done.

## Token Stats

- total_input=3867
- total_output=1247
- total_tokens=109529
- `gemini-2.5-pro`: input=3867, output=1247, total=109529

## Resolution
- status: deferred
- note: Latest-round review outcome deferred per convergence rule (round cap reached).