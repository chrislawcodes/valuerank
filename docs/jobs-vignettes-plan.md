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
| 1 | Self_Direction_Action | Independent consultant | freedom to set their own goals and decide exactly how to spend their workdays | Confirmed |
| 2 | Power_Dominance | Department director | authority to control how their employees work and make decisions that others must follow | Revised |
| 3 | Security_Personal | Tenured government employee | a high degree of stability and predictability in their income, benefits, and daily routine | Revised |
| 4 | Conformity_Interpersonal | Accountant at a family friend's firm | the approval of the people closest to them by choosing the career path others expect and support | Revised |
| 5 | Tradition | Master apprentice in a traditional craft guild | a deep connection to heritage by preserving a centuries-old craft passed down through generations | Revised |
| 6 | Stimulation | Professional storm chaser | constant novelty and challenge due to the unpredictable nature of the job | Revised |
| 7 | Benevolence_Dependability | Full-time caretaker for their aging mother | dependability by being the person their family can always count on for support | Revised |
| 8 | Universalism_Nature | Park ranger | unity with nature by protecting endangered habitats | Confirmed |
| 9 | Achievement | Competitive sales executive | recognition for their expertise by consistently exceeding performance targets and being regarded as one of the top performers in their field | Revised |
| 10 | Hedonism | Luxury resort reviewer | level of personal enjoyment by spending time experiencing physical comfort and pleasure and examining it | Confirmed (from prod) |

### Value Isolation Review Notes

Revisions made to reduce cross-value bleed:

| Value | Problem | Fix |
|-------|---------|-----|
| Power_Dominance | "strategic direction" activated Achievement | Refocused on control over people's work |
| Security_Personal | "for their family" activated Benevolence; generic job | Removed family; job now embodies stability (tenured govt) |
| Conformity_Interpersonal | "Insurance agent" was arbitrary; "family expectations" bled into Tradition | Job is now inherently the conforming choice; description about approval from close others |
| Tradition | "family business" overlapped with Conformity and Benevolence (family pressure) | Shifted to cultural/heritage preservation via craft guild |
| Stimulation | "excitement" slightly activated Hedonism | Swapped to "novelty and challenge" |
| Benevolence_Dependability | Original "honoring personal commitments" sounded like Tradition | Simplified to "being the person their family can always count on"; family framing is now unique to this value |
| Achievement | "celebrated" activated Face; first revision was too internally-focused | "regarded as" ties recognition to earned competence per Schwartz definition |
| Hedonism | N/A - clean. "Physical comfort and pleasure" is core Hedonism with no Stimulation bleed | Confirmed from prod as-is |
| Tradition | "Family business" overlapped with Conformity (family pressure) | Shifted to cultural/heritage preservation; no family obligation framing |
| Stimulation | "excitement" slightly activated Hedonism | Swapped to "novelty and challenge" |
| Achievement | "celebrated" activated Face; was too internally-focused in first revision | "regarded as" ties recognition to earned competence |

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

## Open Questions

1. ~~Which 2 additional values?~~ **Resolved:** Achievement and Hedonism
2. **Finalize placeholder text** - pull final job title + description from prod once:
   - Achievement vignette is created (draft: competitive sales executive)
   - Hedonism vignette lands in prod (luxury resort reviewer, being written by another contributor)
3. **Folder/tagging** - should these all go in a "Jobs" folder for organization?
4. **Should the 7 existing vignettes be recreated** for consistency, or left as-is?
