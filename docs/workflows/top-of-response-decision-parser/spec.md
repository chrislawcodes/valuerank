# Top-Of-Response Decision Parser Spec

## Goal

Reduce unnecessary fallback LLM decision classification by exploiting a known prompt contract: target AIs are instructed to put their final judgment at the top of the response.

This feature improves deterministic transcript scoring in `cloud/workers/summarize.py` without changing the stored decision schema, GraphQL response shape, or transcript UI semantics.

## Problem

The current summarizer already tries deterministic extraction first, then falls back to an LLM classifier when it cannot resolve a score exactly. That flow is safe but conservative:

- numeric extraction scans the full response and can become ambiguous once later explanatory numbers appear
- text-label extraction only accepts a narrow exact-or-prefix match against the scale labels
- lead-in phrasing such as `My judgment:` or `Answer:` can block an otherwise exact top-line label match

In practice, many target models comply with the prompt contract and place the actual judgment at the top of the answer, but the parser does not use that positional signal explicitly.

## Why This Should Be Next

This is a high-leverage improvement because it attacks fallback usage at the source rather than re-labeling transcripts after the fact.

It should come before broader UI interpretation changes because:

1. the worker already stores the metadata needed to distinguish exact vs fallback decisions
2. the deterministic parser is the narrowest place to improve correctness and cost together
3. the user-facing transcript badges become more meaningful when fewer decisions need rescue classification

## Assumptions

- The active prompt contract continues to instruct target models to put their judgment first.
- We should prefer a conservative deterministic parser over an aggressive one that silently mis-scores transcripts.
- Existing `decisionCode`, `decisionSource`, and `decisionMetadata` fields remain the source of truth for downstream consumers.
- Existing manual override behavior stays unchanged.

## In Scope

- `cloud/workers/summarize.py`
- `cloud/workers/tests/test_summarize.py`
- workflow docs under `docs/workflows/top-of-response-decision-parser/`

## Out Of Scope

- transcript UI copy or badge redesign
- GraphQL schema changes
- backfilling previously summarized transcripts
- prompt rewrites for definitions or probes
- changing the fallback LLM model selection policy

## Desired Behavior

The deterministic parser should prefer the opening judgment region of the response before using broader whole-response parsing.

That means:

1. inspect only two leading candidates before later explanation text:
   the first non-empty response line and the first sentence returned by the existing sentence splitter
2. treat the current sentence splitter as the implementation contract for this slice:
   split on newline boundaries first, then on sentence-ending punctuation matched by `(?<=[.!?])\s+`
3. allow a bounded set of deterministic lead-ins anchored to the start of the candidate, matching the current family:
   optional `my`, optional `final` or `overall`, then one of `judgment`, `answer`, `response`, `decision`, `choice`, `rating`, or `score`, optionally followed by `on the scale`, then optional `is`, `:`, or `=`
4. also allow anchored wrappers `in short` and `overall`
5. only treat a leading numeric candidate as exact if it uses an explicit decision form already recognized by the parser
   such as `Rating: 4`, `My decision is 4`, `4 - ...`, `4 Reason: ...`, or a bare numeric answer like `4`
6. if a clear numeric decision appears in a leading candidate, it takes precedence over text-label matching in that same candidate because it is the more explicit representation
7. if a clear numeric or exact scale-label decision appears in that leading region, accept it deterministically
8. only use broader full-response heuristics and then fallback LLM classification if the leading region does not resolve the decision safely

## Proposed Parsing Strategy

Add a judgment-first deterministic phase ahead of the current fallback path:

1. build the combined response text as today
2. derive a small set of leading deterministic candidates from the opening line and opening sentence
3. normalize away common judgment lead-ins before matching
4. try numeric decision extraction on the leading candidates first
5. when scale labels are available, try exact top-of-response label matching on the normalized leading candidates only if numeric extraction did not already resolve the leading candidate
6. if unresolved, continue with the existing broader deterministic logic and only then fall back to the LLM

## Safety Rules

- Do not accept late explanatory numbers over an explicit top-line judgment.
- Do not treat contextual or scenario-reference numbers in the opening line as an exact leading decision unless the candidate also contains an explicit decision signal.
- Do not loosen deterministic parsing so far that quoted scale text inside the explanation becomes an exact match.
- Preserve ambiguous outcomes when the leading region itself contains conflicting decisions.
- Do not treat scenario numbers or explanatory numbering in the opening line as decisions unless they satisfy the existing numeric decision parser.
- Keep fallback behavior unchanged when the new leading-phase parser cannot resolve the answer safely.

## Acceptance Criteria

1. A response whose first line begins with a common judgment lead-in followed by an exact scale label is parsed deterministically.
2. A response whose first line contains a clear numeric decision is parsed deterministically even if later text includes extra numeric references.
3. Existing safety behavior for quoted later scale text remains intact.
4. Responses that remain genuinely unclear still end up as `fallback_resolved` or `ambiguous`, not forced into exact.
5. If the opening candidate contains both a numeric score and a matching text label, the numeric score wins deterministically.
6. A response such as `Scenario #4 is difficult. My decision is 7.` must resolve to `7`, not `4`.
7. A response such as `This scenario is similar to the last 2 I saw today.` must not resolve to `2` from the leading parser alone.
8. No GraphQL or UI contract changes are required.

## Verification

Minimum verification for implementation later:

```bash
cd /Users/chrislaw/valuerank/cloud
PYTHONPATH=/Users/chrislaw/valuerank/cloud/workers pytest workers/tests/test_summarize.py
```

The implementation is expected to add or update worker tests in that file for the new leading numeric, leading text-label, precedence, contextual-number, and negative-number cases.

If the environment uses the npm wrapper instead of direct pytest, run the repo-preferred worker test command that covers the same file.
