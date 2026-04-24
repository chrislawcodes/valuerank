# HIGH Findings That Were Pushed Aside

**Read this before merging.** During the review cycle, reviewers and judges flagged three HIGH-severity findings that we decided NOT to fix in this PR. Each one is documented below in plain language: what the finding was, why we chose to accept it, what the real risk is if we're wrong, and what the follow-up should be.

---

## 1. The severity-detection regex is brittle (won't scale forever)

**What the reviewer said (Gemini, Risk R7):**
The way we detect severity findings in reviews is by matching specific text patterns like `- HIGH:`, `1. **HIGH**:`, `### HIGH`, etc. Every time a reviewer uses a slightly different format, we have to add a new pattern. The reviewer's claim: we're in an arms race with reviewer output formats, and the durable fix is to make reviewers emit structured JSON findings that we can parse directly — no pattern-matching needed.

**Why we pushed it aside:**
Fixing this properly means changing the reviewer prompts themselves, which the spec explicitly says is out of scope (FR-013). It would also require coordinating with the prompt authors and probably a whole new feature to define the JSON schema. Too big to fit in this PR.

**What the real risk is:**
Future reviewers might use a new format — like `**[HIGH SEVERITY]**:` or Markdown-formatted tables — that slips past our regex. When that happens, HIGH findings would silently auto-accept and the reviewer's concerns would never reach a human. This is the exact class of bug this PR was created to fix, so it's ironic that we're leaving a future variant in.

**Mitigation in this PR:**
- The regex test suite uses this feature's own review files as fixtures, so if the shape drifts, at least our own tests catch it.
- Fix 8 (invariant self-check) will catch the downstream symptom — if a stage looks healthy but shouldn't, it'll log a warning.

**Follow-up:**
A separate feature should change reviewer prompts to emit JSON findings. The regex becomes a fallback for legacy output. Link to backlog when created.

---

## 2. Fenced code blocks in review text can cause false-positive matches

**What the reviewer said (Codex, spec round 2):**
If a reviewer's own review text contains a literal example inside a code fence like this:

    ```
    - HIGH: example of a finding shape
    ```

our regex will match the line inside the code block as if it were a real finding. That means a reviewer who quotes a real finding shape (for documentation purposes) could get their own review incorrectly flagged as having an actionable HIGH.

**Why we pushed it aside:**
Parsing Markdown to ignore fenced code blocks is surprisingly complex (nested fences, tilde-fences, indented code blocks, etc.). Doing it right requires a real Markdown parser. We chose to accept this as a known edge case and pin it with an explicit test so the behavior is documented, not hidden.

**What the real risk is:**
A reviewer writing a meta-review ("here are the shapes that should be flagged: `- HIGH:`") could get their own review incorrectly classified. Their review would look actionable when it isn't. Operators would spend time investigating a non-issue.

**How common is it?**
Very rare. Reviewers don't typically quote severity-shape examples in their own findings. Zero cases observed in practice across all of this feature's own review rounds.

**Mitigation:**
The test `test_fenced_code_block_with_literal_severity_line_is_documented_limitation` pins current behavior. If someone fixes it later, the test will turn from passing to failing, and they'll know to flip the assertion to `False`.

**Follow-up:**
Swap the regex for a real Markdown AST walker. Not urgent unless we start seeing false positives in practice.

---

## 3. The list of commands that trigger the invariant check is manually maintained

**What the reviewer said (Gemini, tasks F-1):**
When we add the invariant self-check (Fix 8), we need to know which runner commands mutate state so we can run the check after each. Today that list is a hand-maintained Python set (`_STATE_MUTATING_COMMANDS`). If a future developer adds a new command that writes to `state.json` and forgets to add it to the set, the new command silently escapes the safety check. The invariant system quietly degrades over time.

**Why we pushed it aside:**
Automating this would mean introspecting every `command_*` function to see if it mutates state. That's either a static-analysis pass (brittle) or a runtime hook that wraps state writes (invasive). Either approach is a whole separate feature. For now we enumerated all 11 current mutating commands explicitly and accept that new ones need manual registration.

**What the real risk is:**
Six months from now, someone adds a `command_migrate_something` that writes to state.json but doesn't add it to `_STATE_MUTATING_COMMANDS`. If that command produces the judge-advance-vs-repair contradiction that Fix 8 exists to catch, Fix 8 won't catch it. The bug that started this PR could re-appear in a new form.

**Mitigation:**
- All 11 current mutating commands are in the list as of this PR.
- The test file for invariants verifies the expected behavior; a reviewer can at least see the list.
- The PR description and tasks.md both call out this constraint.

**Follow-up:**
A test that greps `run_factory.py` for `command_` functions and asserts each mutates-or-not is declared. Or a decorator pattern (`@mutates_state`) that auto-registers commands. Not in scope here.

---

## How I'd think about merging this PR

| Question | Honest answer |
|---|---|
| Do any of these 3 findings block shipping the 3 fixes we came here to make? | No. All three are about future drift, not current correctness. |
| Could any of them cause a production bug today? | No. They describe scenarios that haven't happened yet. |
| Are they documented in a place a future engineer will find? | Yes — spec Risk R5/R7, test pins, PR body. |
| Are they worth their own follow-up features? | Yes, each one. Rough estimates: R7 is ~1 week (reviewer prompt changes + JSON parsing), fenced-code is ~1 day (Markdown AST), auto-register is ~2 days (decorator + test). |

**Recommendation: safe to merge.** The three HIGH findings pushed aside are all "the durable version of this fix needs a bigger change we're not making today" — not "there's a live bug in this code." The fix for the immediate bug (run-033 loop) is complete and well-tested.

If you want belt-and-suspenders before merging: open follow-up GitHub issues for the three items above and link them in the PR description. Each one is small and well-scoped.
