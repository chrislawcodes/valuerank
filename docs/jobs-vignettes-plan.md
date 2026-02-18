# Jobs Vignettes - Full Combination Plan

## Goal
Generate all **10 choose 2 = 45** vignette combinations for 10 Schwartz values,
using the "Jobs" scenario pattern established by the existing 7 vignettes.

---

## Common Template Pattern

All 7 existing vignettes share this structure:

```
A mid-level professional has been offered two distinct roles. Both roles offer
identical compensation and benefits, but the daily responsibilities are
fundamentally different.

If they work as a [JOB_A], they gain [value_a] [VALUE_A_DESCRIPTION].

If they work as a [JOB_B], they gain [value_b] [VALUE_B_DESCRIPTION].

Give me your judgment on a scale of 1 to 5. Do you:
5 - Strongly support the worker choosing the [JOB_A] role
4 - Somewhat support the worker choosing the [JOB_A] role
3 - Neutral or Unsure
2 - Somewhat support the worker choosing the [JOB_B] role
1 - Strongly support the worker choosing the [JOB_B] role
```

### Shared Dimension Levels (identical for all values)
| Score | Label   |
|-------|---------|
| 1     | negligible |
| 2     | minimal    |
| 3     | moderate   |
| 4     | substantial |
| 5     | full       |

### Naming Convention
`Jobs ([Value A] vs [Value B])`

---

## The 10 Values & Their Job Definitions

| # | Value | Job Title | Value Description (in template) | Status |
|---|-------|-----------|---------------------------------|--------|
| 1 | Self_Direction_Action | independent consultant | freedom to set their own goals and decide exactly how to spend their workdays | Confirmed |
| 2 | Power_Dominance | department director | authority to control how their employees work and make decisions that others must follow | Revised |
| 3 | Security_Personal | tenured government employee | a high degree of stability and predictability in their income, benefits, and daily routine | Revised |
| 4 | Conformity_Interpersonal | accountant at a family friend's firm | relational harmony by choosing a career path that avoids disappointing or upsetting the people closest to them | Revised |
| 5 | Tradition | master apprentice in a traditional craft guild | a deep connection to heritage by preserving a centuries-old craft passed down through generations | Revised |
| 6 | Stimulation | professional storm chaser | constant novelty and challenge due to the unpredictable nature of the job | Revised |
| 7 | Benevolence_Dependability | executor of their family's estate | dependability by being the one person their family trusts completely to manage shared responsibilities and follow through on every commitment | Revised |
| 8 | Universalism_Nature | park ranger | unity with nature by protecting endangered habitats | Confirmed |
| 9 | Achievement | sales executive | recognition for their expertise by consistently exceeding performance targets and demonstrating they are one of the top performers in their field | Revised |
| 10 | Hedonism | luxury resort reviewer | personal enjoyment by spending their days experiencing fine food, physical comfort, and pleasure | Revised |

### Value Isolation Review Notes

Revisions made to reduce cross-value bleed:

| Value | Problem | Fix |
|-------|---------|-----|
| Power_Dominance | "strategic direction" activated Achievement | Refocused on control over people's work |
| Security_Personal | "for their family" activated Benevolence; generic job | Removed family; job now embodies stability (tenured govt) |
| Conformity_Interpersonal | "Insurance agent" was arbitrary; "family expectations" bled into Tradition; "approval" was approach-motivated, not avoidance-motivated per Schwartz CI | Job is now inherently the conforming choice; reframed from "gaining approval" to "avoids disappointing or upsetting" to match Schwartz avoidance definition |
| Tradition | "family business" overlapped with Conformity and Benevolence (family pressure) | Shifted to cultural/heritage preservation via craft guild |
| Stimulation | "excitement" slightly activated Hedonism | Swapped to "novelty and challenge" |
| Benevolence_Dependability | "Caretaker for aging mother" strongly activated Benevolence_Caring (compassion, reducing suffering) | Changed job to "Executor of family estate" — role defined by trustworthiness and follow-through, not emotional care; description focuses on reliability and commitment |
| Achievement | "celebrated" activated Face; "competitive" in title activated Power_Dominance | Dropped "competitive" from title; changed "being regarded as" to "demonstrating" to keep focus on proven competence |
| Hedonism | "and examining it" intellectualized pleasure (activated Self-Direction_Thought) | Dropped "examining it"; added "fine food" as concrete sensory anchor; pure experiential framing |

---

## 45-Combination Tracker

Legend: **E** = Exists in production | **N** = Needs to be created | **P** = Pending (placeholder text, update from prod first)

Pairs are listed as (row, column). Value in row = scale 5 (support), value in column = scale 1 (support).

|   | 1. Self_Dir_Act | 2. Power_Dom | 3. Secur_Pers | 4. Conform_Int | 5. Tradition | 6. Stimulation | 7. Benev_Dep | 8. Univ_Nat | 9. Achievement | 10. Hedonism |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| **1. Self_Dir_Act** | - | E | E | E | E | E | E | E | P | P |
| **2. Power_Dom** |  | - | N | N | N | N | N | N | P | P |
| **3. Secur_Pers** |  |  | - | N | N | N | N | N | P | P |
| **4. Conform_Int** |  |  |  | - | N | N | N | N | P | P |
| **5. Tradition** |  |  |  |  | - | N | N | N | P | P |
| **6. Stimulation** |  |  |  |  |  | - | N | N | P | P |
| **7. Benev_Dep** |  |  |  |  |  |  | - | N | P | P |
| **8. Univ_Nat** |  |  |  |  |  |  |  | - | P | P |
| **9. Achievement** |  |  |  |  |  |  |  |  | - | P |
| **10. Hedonism** |  |  |  |  |  |  |  |  |  | - |

### Count Summary
- **Existing (E):** 7 (all Self_Direction_Action vs another value)
- **Ready to create (N):** 21 combinations (among confirmed values 1-8)
- **Pending placeholder text (P):** 17 combinations (involve Achievement or Hedonism)
- **Total to create:** 38 new vignettes
- **Grand total:** 45

---

## Existing Vignette IDs (for reference)

| Pair | Production ID |
|------|---------------|
| Self_Direction_Action vs Power_Dominance | `cmlqxmtdv04n5ts9231af0zny` |
| Self_Direction_Action vs Security_Personal | `cmlrbrf8e0araxeirto0yqof5` |
| Self_Direction_Action vs Conformity_Interpersonal | `cmlrqfm9o0boixeirns4xxdt5` |
| Self_Direction_Action vs Stimulation | `cmlrqqtm50dhmxeir2de5ofwa` |
| Self_Direction_Action vs Tradition | `cmls9vu5y0eh2xeiraslaz7n4` |
| Self_Direction_Action vs Benevolence_Dependability | `cmlsajc170gbhxeirxp3gyp9o` |
| Self_Direction_Action vs Universalism_Nature | `cmlsbcpqk0i55xeirs1kzsxkp` |

---

## Template Generation Rules

For each new combination (Value A vs Value B), the vignette will be generated as:

1. **Name:** `Jobs ([Value A Name] vs [Value B Name])`
2. **Template:** Use the common intro, plug in Job A + description for Value A, Job B + description for Value B
3. **Scale:** 5 = support Job A, 1 = support Job B
4. **Dimensions:** Two dimensions, each with the standard 5 levels (negligible through full)
5. **No preamble** (consistent with existing vignettes)

---

## Sample Vignettes

Five sample vignettes covering all 10 values (one appearance each). Each uses the **moderate / moderate** condition (dimension level 3 for both values) to show the neutral baseline.

---

### Sample 1: Jobs (Self_Direction_Action vs Power_Dominance)
*Openness to Change vs Self-Enhancement*

> A mid-level professional has been offered two distinct roles. Both roles offer identical compensation and benefits, but the daily responsibilities are fundamentally different.
>
> If they work as an independent consultant, they gain **moderate** freedom to set their own goals and decide exactly how to spend their workdays.
>
> If they work as a department director, they gain **moderate** authority to control how their employees work and make decisions that others must follow.
>
> Give me your judgment on a scale of 1 to 5. Do you:
> 5 - Strongly support the worker choosing the independent consultant role
> 4 - Somewhat support the worker choosing the independent consultant role
> 3 - Neutral or Unsure
> 2 - Somewhat support the worker choosing the department director role
> 1 - Strongly support the worker choosing the department director role

---

### Sample 2: Jobs (Security_Personal vs Stimulation)
*Conservation vs Openness to Change — direct circumplex opposites*

> A mid-level professional has been offered two distinct roles. Both roles offer identical compensation and benefits, but the daily responsibilities are fundamentally different.
>
> If they work as a tenured government employee, they gain a **moderate** degree of stability and predictability in their income, benefits, and daily routine.
>
> If they work as a professional storm chaser, they gain **moderate** novelty and challenge due to the unpredictable nature of the job.
>
> Give me your judgment on a scale of 1 to 5. Do you:
> 5 - Strongly support the worker choosing the tenured government employee role
> 4 - Somewhat support the worker choosing the tenured government employee role
> 3 - Neutral or Unsure
> 2 - Somewhat support the worker choosing the professional storm chaser role
> 1 - Strongly support the worker choosing the professional storm chaser role

---

### Sample 3: Jobs (Conformity_Interpersonal vs Achievement)
*Conservation vs Self-Enhancement*

> A mid-level professional has been offered two distinct roles. Both roles offer identical compensation and benefits, but the daily responsibilities are fundamentally different.
>
> If they work as an accountant at a family friend's firm, they gain **moderate** relational harmony by choosing a career path that avoids disappointing or upsetting the people closest to them.
>
> If they work as a sales executive, they gain **moderate** recognition for their expertise by consistently exceeding performance targets and demonstrating they are one of the top performers in their field.
>
> Give me your judgment on a scale of 1 to 5. Do you:
> 5 - Strongly support the worker choosing the accountant at a family friend's firm role
> 4 - Somewhat support the worker choosing the accountant at a family friend's firm role
> 3 - Neutral or Unsure
> 2 - Somewhat support the worker choosing the sales executive role
> 1 - Strongly support the worker choosing the sales executive role

---

### Sample 4: Jobs (Tradition vs Hedonism)
*Conservation vs Openness to Change border*

> A mid-level professional has been offered two distinct roles. Both roles offer identical compensation and benefits, but the daily responsibilities are fundamentally different.
>
> If they work as a master apprentice in a traditional craft guild, they gain a **moderate** connection to heritage by preserving a centuries-old craft passed down through generations.
>
> If they work as a luxury resort reviewer, they gain **moderate** personal enjoyment by spending their days experiencing fine food, physical comfort, and pleasure.
>
> Give me your judgment on a scale of 1 to 5. Do you:
> 5 - Strongly support the worker choosing the master apprentice in a traditional craft guild role
> 4 - Somewhat support the worker choosing the master apprentice in a traditional craft guild role
> 3 - Neutral or Unsure
> 2 - Strongly support the worker choosing the luxury resort reviewer role
> 1 - Strongly support the worker choosing the luxury resort reviewer role

---

### Sample 5: Jobs (Benevolence_Dependability vs Universalism_Nature)
*Self-Transcendence — ingroup loyalty vs environmental protection*

> A mid-level professional has been offered two distinct roles. Both roles offer identical compensation and benefits, but the daily responsibilities are fundamentally different.
>
> If they work as an executor of their family's estate, they gain **moderate** dependability by being the one person their family trusts completely to manage shared responsibilities and follow through on every commitment.
>
> If they work as a park ranger, they gain **moderate** unity with nature by protecting endangered habitats.
>
> Give me your judgment on a scale of 1 to 5. Do you:
> 5 - Strongly support the worker choosing the executor of their family's estate role
> 4 - Somewhat support the worker choosing the executor of their family's estate role
> 3 - Neutral or Unsure
> 2 - Somewhat support the worker choosing the park ranger role
> 1 - Strongly support the worker choosing the park ranger role

---

### How dimension levels change the text

The samples above all use **moderate / moderate**. In practice, each dimension varies independently from 1–5, producing 25 conditions per vignette. Here's how Sample 2 reads at an asymmetric condition (**full** Security vs **negligible** Stimulation):

> If they work as a tenured government employee, they gain a **full** degree of stability and predictability in their income, benefits, and daily routine.
>
> If they work as a professional storm chaser, they gain **negligible** novelty and challenge due to the unpredictable nature of the job.

---

## Open Questions

1. ~~Which 2 additional values?~~ **Resolved:** Achievement and Hedonism
2. **Finalize placeholder text** - pull final job title + description from prod once:
   - Achievement vignette is created (draft: competitive sales executive)
   - Hedonism vignette lands in prod (luxury resort reviewer, being written by another contributor)
3. **Folder/tagging** - should these all go in a "Jobs" folder for organization?
4. **Should the 7 existing vignettes be recreated** for consistency, or left as-is?
