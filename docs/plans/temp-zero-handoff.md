# Temp-Zero Verification — Handoff

Last updated: 2026-03-02. Full plan: `docs/plans/temp-zero-verification-plan.md`.

---

## Current State

Phases 1, 2, 3, 4, 8, 9 are merged to `main` (PRs #297 and #298).
Phases 5, 6, 7, 11 are pending — blocked on running the verification scripts with live credentials.

**What's implemented:**
- LLM adapters emit `promptHash`, `adapterMode`, `temperatureSent`, `seedSent` per request
- `seed: 42` is injected automatically for all temp=0 runs in the probe job handler
- `canary_runner.py` — standalone determinism tester (runs from `cloud/workers/`)
- `temp_zero_report.py` — production DB report script
- `debugAssumptionsMismatches` GraphQL query for per-transcript diagnostic

---

## Next Actions

### 1. Run canary_runner.py (needs API keys)

```bash
cd cloud/workers
python canary_runner.py --models gpt-4o,claude-sonnet-4-6 --runs 20
```

Add any other active models comma-separated. You want to see `exact_match_rate: 1.0` and `all_prompt_hashes_identical: true`.

### 2. Run temp_zero_report.py (needs DATABASE_URL)

```bash
cd cloud/workers
DATABASE_URL="..." python temp_zero_report.py --days 30
```

Note: transcripts created before PR #298 was deployed will have null `promptHash` — that's expected. The report will start filling in as new temp=0 runs complete.

### 3. Decide Phase 11 strategy

Once verification data exists, choose one of:
- **Strict** — only show models with `adapterMode = explicit_temp_zero` in Assumptions
- **Split labels** — show all models but distinguish `Explicit temp=0` vs `Deterministic-mode fallback`
- **Exclude unsupported** — remove models that can't confirm temp=0

This is a product decision. Bring data to the human before implementing.

---

## What Good Output Looks Like

**canary_runner.py:**
- `exact_match_rate: 1.0` for the control prompt ("respond with A")
- `exact_match_rate: 1.0` ideally for the decision prompt (some variance acceptable)
- `all_prompt_hashes_identical: true`

**temp_zero_report.py:**
- Prompt Hash Stable: ~100%
- Fingerprint Stable: varies by provider (OpenAI changes fingerprint on deployments — OK)
- Decision Match: 3 most recent runs agree — this is the primary goal

---

## Primary Coordination

**Use Gemini for planning/Phase 11 strategy. Use Codex for implementation.**

Starting doc for Gemini: `~/.claude/GEMINI-CODEX-GUIDE.md`

Invocation:
```bash
gemini --prompt "Read ~/.claude/GEMINI-CODEX-GUIDE.md and docs/plans/temp-zero-handoff.md. [describe task]." --yolo
```

---

## Preflight Before Any Push

From `cloud/`:
```bash
npm run lint --workspace @valuerank/shared
npm run lint --workspace @valuerank/db
npm run lint --workspace @valuerank/api
npm run test --workspace @valuerank/api   # needs DATABASE_URL + JWT_SECRET
npm run build --workspace @valuerank/api
npm run lint --workspace @valuerank/web
npm run test --workspace @valuerank/web
npm run build --workspace @valuerank/web
```
