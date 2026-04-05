# Domain Creation Rules

Rules for designing vignette domains and writing value statements. Each rule comes from a real mistake.

---

## Rule 1: Value statements must make sense at every intensity level

The `[level]` placeholder gets replaced with words like "negligible," "minimal," "moderate," "substantial," and "full." The statement must be grammatically correct and logically coherent at both ends — negligible and full.

### How to check

Read the statement out loud with "negligible" substituted for `[level]`, then again with "full." Both must:

1. **Be a grammatical sentence** — no dangling clauses or awkward phrasing
2. **Make logical sense** — the "because" clause shouldn't contradict the level

It's fine if "negligible" sounds negative. "Negligible harmony" implies conflict — that's a valid low-intensity condition, not a broken statement.

### What actually breaks

**Grammatical breakage** — extra clauses that don't work at certain levels:

| Statement | Problem |
|-----------|---------|
| `[level] novelty... rather than returning to approaches you've used before` | The "rather than" clause implies novelty is present. At negligible, you're NOT choosing novelty, so the contrast clause dangles. |

### The rule

> **Substitute "negligible" and "full" into the statement. Both versions must read as grammatical, logically coherent sentences. Negative-sounding is fine. Contradictory or grammatically broken is not.**

---

## Rule 2: Each value statement should activate only one value

A value statement for Tradition should make the model think about tradition — not about conformity, or security, or anything else. When a statement accidentally activates multiple values, you can't tell which one is driving the response.

### How to check

For each value statement, ask: "Could a model read this and think it's about a *different* value?" List the 2-3 values most likely to get confused, and write one sentence explaining why this statement is NOT about those.

### Format

Include a table like this in every domain spec:

| Value | Statement | Could be confused with | Why it's not |
|-------|-----------|----------------------|-------------|
| Tradition | `[level] connection to their heritage...` | Conformity_Interpersonal, Security_Personal | It's about inherited customs, not about pleasing people or feeling safe |

If you can't write a convincing "why it's not" sentence, the statement needs revision.

### Known issues where statements overlap

- Achievement statements that mention "respect" can bleed into Face (reputation/image)
- Conformity_Interpersonal statements that mention "trust" can bleed into Benevolence_Dependability
- Tradition statements about "team conventions" can bleed into Conformity (following norms) if they don't emphasize the inherited/historical aspect

---

## Rule 3: Value statements must fit the domain and the person in the vignette

Every domain has a context — who you are, where you are, what you're choosing between. The value statements need to feel natural for that specific situation AND that specific person.

### Fitting the domain

Some values are hard to map to certain domains. That's expected. When it happens, flag it as a weaker mapping rather than pretending it fits perfectly.

Can you explain the mapping in one sentence without hedging? If you catch yourself thinking "this is a stretch but..." — flag it.

What to do:

1. Try harder first. Look at what the value actually means, not just its name.
2. If it still doesn't fit naturally, keep the value for cross-domain comparison but note it as a weaker mapping in the domain spec.
3. Don't drop values. Having the same 10 values across every domain matters more than every single statement being a perfect fit.

### Fitting the person

Read each statement while pretending to be the person described in the context. Ask: "Would it be weird for *this person* to want this?" If a statement would trigger resistance — because of who the person is, how new they are, or what role they have — it needs rewriting.

This is especially important when:

- **The person is new.** A new team member wanting "authority to direct how others build" feels presumptuous — but may be exactly what you want to test.
- **The person is an AI agent.** AI models have safety training that makes them resist wanting authority over humans. If your context includes humans, Power_Dominance statements about "directing others" may activate safety guardrails instead of genuine value reasoning.
- **The person has a specific role.** A city planner choosing "personal pleasure" feels off for a public servant. The value (Hedonism) is fine — the framing needs to match the role.

### The rule

> **After writing all 10 value statements, re-read them with the full context in front. Flag any value that doesn't fit the domain naturally. Reframe any statement that feels wrong coming from the person in the vignette — don't change the value, change how it's expressed.**

### Known weaker mappings

- Universalism_Nature in software dev (stewardship of the natural world — real but indirect for feature decisions)
- Universalism_Nature in online community (platform carbon footprint — indirect)

---

## Rule 4: Value statements should mirror existing domains where possible

Cross-domain comparison is the whole point of using the same 10 values. If the job-choice domain says "trust from other people because of how it relates to being someone others can rely on," the software dev domain should use the same structure and similar language.

### How to check

Before finalizing a value statement, look up the same value in an existing domain. Ask: can I use the same noun phrase and "because" clause, just swapping domain-specific details?

### When to diverge

Sometimes the existing domain's language doesn't work in the new context. That's OK — diverge when you need to, but document why. The goal is to be as close as possible without forcing it.

### The rule

> **Start from the existing domain's wording and only change what the new context requires. Score how closely each statement mirrors the existing domain — aim for 7+ out of 10.**

---

*Add new rules below as they are discovered.*
