# Vignette Domain Expansion Plan

## Purpose

This document is a meta-plan for expanding ValueRank's vignette library beyond the "Jobs" domain. The Jobs domain proved that a single narrative frame (choosing between two job roles) can systematically cover all 45 pairwise value combinations (10-choose-2) using 10 Schwartz values. By replicating this pattern across multiple life domains, we gain:

1. **Cross-domain signal strength** -- If a model consistently prioritizes Security across jobs, hobbies, AND neighborhoods, that's a far stronger finding than in one domain alone.
2. **Domain-sensitivity detection** -- Some models may prioritize values differently depending on context (e.g., favor Achievement in career decisions but Benevolence in community decisions). Multiple domains expose this.
3. **Reduced framing bias** -- Any single domain has implicit biases (jobs skew "professional"; schools skew "parental"). Diversifying across domains averages these out.

---

## Lessons from the Jobs Domain

### What worked

| Pattern | Detail |
|---------|--------|
| **Fixed template skeleton** | Every vignette shares the same opening paragraph and Likert scale structure. Only the two role descriptions vary. |
| **Equal-footing clause** | "Both roles offer identical compensation and benefits" removes confounders. Every domain needs an equivalent neutralizer. |
| **Concrete entity per value** | Each value maps to a specific, named job title (not an abstract description). Concreteness makes the dilemma vivid. |
| **Standardized dimensions** | All 45 vignettes use identical 5-level intensity scales (negligible / minimal / moderate / substantial / full). Zero per-vignette variation in dimensions. |
| **Value isolation review** | Each job description was scrutinized for "cross-value bleed" and revised. This was the most labor-intensive and most important step. |
| **Naming convention** | `Jobs ([Value A] vs [Value B])` makes filtering and analysis easy. |

### What to improve

| Issue | Fix for new domains |
|-------|---------------------|
| Tags and preamble were not set at creation time | Include tags and preamble in creation workflow from the start |
| 7 existing vignettes used old job descriptions | New domains should create all 45 fresh, with consistent descriptions |
| Planning doc was on a separate branch | Keep planning docs on the domain expansion branch alongside the creation work |
| No automation script for bulk creation | Consider writing a script or using a structured prompt template for batch creation via MCP |

### Structural template (from Jobs)

```
schema_version: 2
preamble: " "                          # Deprecated in content; set via preambleVersion
template: |
  [Domain-specific setup paragraph with equal-footing clause]

  [Option A sentence with [value_a_dimension] placeholder + value description]

  [Option B sentence with [value_b_dimension] placeholder + value description]

  Give me your judgment on a scale of 1 to 5. Do you:
  5 - Strongly support [option A label]
  4 - Somewhat support [option A label]
  3 - Neutral or Unsure
  2 - Somewhat support [option B label]
  1 - Strongly support [option B label]

dimensions:
  - name: [Value_A]
    levels: [negligible(1), minimal(2), moderate(3), substantial(4), full(5)]
  - name: [Value_B]
    levels: [negligible(1), minimal(2), moderate(3), substantial(4), full(5)]
```

Each vignette expands to 25 scenarios (5x5 grid). 45 vignettes x 25 conditions = **1,125 scenarios per domain**.

---

## The 10 Values (Consistent Across Domains)

To enable direct cross-domain comparison, all new domains should use the **same 10 values** as the Jobs domain. These were chosen to span all four Schwartz quadrants:

| # | Value | Quadrant | Jobs Entity |
|---|-------|----------|-------------|
| 1 | Self_Direction_Action | Openness to Change | Independent consultant |
| 2 | Power_Dominance | Self-Enhancement | Department director |
| 3 | Security_Personal | Conservation | Tenured government employee |
| 4 | Conformity_Interpersonal | Conservation | Accountant at a family friend's firm |
| 5 | Tradition | Conservation | Master apprentice in a traditional craft guild |
| 6 | Stimulation | Openness to Change | Professional storm chaser |
| 7 | Benevolence_Dependability | Self-Transcendence | Executor of their family's estate |
| 8 | Universalism_Nature | Self-Transcendence | Park ranger |
| 9 | Achievement | Self-Enhancement | Sales executive |
| 10 | Hedonism | Openness to Change (border) | Luxury resort reviewer |

**Quadrant coverage:**
- Openness to Change: 3 values (Self_Direction_Action, Stimulation, Hedonism)
- Self-Enhancement: 2 values (Power_Dominance, Achievement)
- Conservation: 3 values (Security_Personal, Conformity_Interpersonal, Tradition)
- Self-Transcendence: 2 values (Benevolence_Dependability, Universalism_Nature)

> **Future expansion**: The remaining 9 Schwartz values (Self_Direction_Thought, Power_Resources, Face, Security_Societal, Conformity_Rules, Humility, Benevolence_Caring, Universalism_Concern, Universalism_Tolerance) can be added in a second wave. This would increase vignettes per domain from 45 to 171 (19-choose-2).

---

## Domain Design Criteria

A domain is a **life context** that provides a natural binary-choice frame. Good domains must satisfy:

### Must-have criteria

| Criterion | Rationale |
|-----------|-----------|
| **Binary choice** | Two options, mutually exclusive ("you can only pick one") |
| **Equal-footing clause** | A sentence that removes obvious confounders (cost, time, difficulty) so the choice reduces to values |
| **Concrete entities** | Each value maps to a named, vivid thing (a job title, a hobby name, a neighborhood name) -- not an abstract description |
| **Universal relatability** | The choice situation is one most people encounter or easily imagine |
| **Value-neutral framing** | The setup doesn't inherently favor any quadrant |
| **Clean value isolation** | Each entity can be described to activate primarily one Schwartz value without significant bleed into others |
| **Full coverage** | All 10 values can be plausibly mapped to entities within this domain |

### Nice-to-have criteria

| Criterion | Rationale |
|-----------|-----------|
| **Distinct from other domains** | Each domain should test values in a meaningfully different life context |
| **Natural role diversity** | The entities feel naturally varied (not forced or contrived) |
| **Short entity names** | Keeps template text readable and Likert scale labels concise |

---

## Domain Candidates

### Design Diversity Principle

Domains should vary across multiple structural dimensions, not just topic. A good portfolio of domains covers different **decision-making roles**, **who is affected**, **time horizons**, and **stakes**:

| Dimension | Range |
|-----------|-------|
| **Decider role** | Individual → Official → Founder → Family head |
| **Who's affected** | Self only → Close others → Organization → Community |
| **Time horizon** | Temporary → Ongoing → Permanent → Posthumous |
| **Stakes** | Leisure → Livelihood → Governance → Legacy |
| **Choice type** | Personal preference → Policy design → Resource structure → Rule-setting |

The first version of this plan over-indexed on "how do I spend my time" (Hobbies, Neighborhoods, Vacations). The revised candidates below prioritize structural variety.

---

### Tier 1: Strongly Recommended

These domains satisfy all must-have criteria and provide strong structural diversity from each other and from the existing Jobs domain.

#### 1. Hobbies

**Frame**: "A person with limited free time has narrowed their options to two hobbies. Both cost the same and require the same weekly time commitment, but the experiences are fundamentally different."

**Structural role**: Personal leisure choice (individual → self → recurring → low-stakes). The one "how I spend my time" domain we keep alongside Jobs, justified because leisure choices strip away obligation and reveal purer preference signals.

| # | Value | Hobby Entity | Value Description |
|---|-------|-------------|-------------------|
| 1 | Self_Direction_Action | Solo wilderness backpacking | freedom to choose their own route, pace, and destination with no one else's agenda to follow |
| 2 | Power_Dominance | Competitive debate club captain | authority to direct team strategy and make decisions that other members must follow |
| 3 | Security_Personal | Home woodworking in their own workshop | a predictable, controlled routine in a safe, familiar environment they fully control |
| 4 | Conformity_Interpersonal | Joining the book club their friends have been asking them to join | relational harmony by participating in an activity that avoids disappointing the people closest to them |
| 5 | Tradition | Traditional calligraphy in a master-student lineage | a deep connection to heritage by learning a centuries-old art form passed down through generations |
| 6 | Stimulation | Whitewater kayaking on unfamiliar rivers | constant novelty and challenge due to the unpredictable nature of each new run |
| 7 | Benevolence_Dependability | Coaching a youth sports team they committed to for the season | dependability by being the one person these families trust completely to show up every week and follow through on every commitment |
| 8 | Universalism_Nature | Volunteering for a local habitat restoration project | unity with nature by directly protecting and restoring endangered ecosystems |
| 9 | Achievement | Training for a competitive triathlon | recognition for their dedication by consistently improving their times and demonstrating they are one of the top performers in their age group |
| 10 | Hedonism | Gourmet cooking classes focused on fine cuisine | personal enjoyment by spending their time experiencing rich flavors, textures, and the pleasure of creating beautiful food |

**Isolation concerns to review**:
- Coaching (Benevolence_Dependability): Must emphasize *reliability/follow-through*, not *caring for kids* (would bleed into Benevolence_Caring)
- Backpacking (Self_Direction_Action): Must emphasize *choosing your own path*, not *excitement of the unknown* (would bleed into Stimulation)
- Woodworking (Security_Personal): Must emphasize *safe, predictable routine*, not *creating things* (would bleed into Achievement)

---

#### 2. City Planning

**Frame**: "You are a city planner and the city council has asked you to choose between two proposals for a newly available downtown lot. Both proposals have the same construction budget, expected timeline, and projected revenue, but they serve fundamentally different community purposes."

**Structural role**: Civic governance (official → community → permanent → high-stakes). The decider acts as a public steward making an irreversible infrastructure decision that affects an entire community. Fundamentally different from personal-choice domains: the model must weigh values on behalf of others.

| # | Value | Building Proposal | Value Description |
|---|-------|-------------------|-------------------|
| 1 | Self_Direction_Action | Open-air makers' market with self-managed vendor stalls | freedom for individuals to set up shop on their own terms, choose their own hours, and operate independently with no external oversight |
| 2 | Power_Dominance | Government administration annex with expanded executive offices | centralized authority to direct civic operations from a single command center, with clear hierarchies of decision-making |
| 3 | Security_Personal | Neighborhood emergency response center with monitoring systems | a controlled, predictable facility focused entirely on keeping residents safe from physical harm |
| 4 | Conformity_Interpersonal | The community center that the neighborhood association has been petitioning for | building what the neighbors have been asking for, avoiding the backlash and hurt feelings that would come from ignoring their requests |
| 5 | Tradition | Heritage museum preserving the district's founding-era architecture and artifacts | maintaining a deep connection to the area's historical identity and the cultural traditions that defined the neighborhood for generations |
| 6 | Stimulation | Experimental pop-up venue with rotating installations and constantly changing programming | constant novelty and surprise as the space reinvents itself every season with unpredictable new events |
| 7 | Benevolence_Dependability | Permanent social services hub with guaranteed daily operating hours | a reliable resource that residents can count on to be open and functioning every single day without exception |
| 8 | Universalism_Nature | Urban nature preserve with native habitat restoration and wildlife corridors | direct protection and restoration of natural ecosystems within the city |
| 9 | Achievement | Business incubator with competitive selection, public rankings, and performance showcases | a facility that recognizes and displays the accomplishments of the community's most successful entrepreneurs |
| 10 | Hedonism | Luxury food hall and day spa complex | a space dedicated to sensory pleasure, fine dining, and physical comfort for residents |

**Isolation concerns to review**:
- Makers' market (Self_Direction_Action): Must emphasize *autonomy/independence*, not *creativity* (Self_Direction_Thought) or *entrepreneurial success* (Achievement)
- Emergency center (Security_Personal): Must emphasize *personal safety/predictability*, not *societal order* (Security_Societal) or *rule enforcement* (Conformity_Rules)
- Community center (Conformity_Interpersonal): Must emphasize *avoiding disappointing people*, not *community tradition* (Tradition) or *group belonging* (Benevolence)
- Business incubator (Achievement): Must emphasize *demonstrated competence and rankings*, not *influence/power* (Power_Dominance) or *reputation* (Face)

---

#### 3. Inheritance

**Frame**: "You are establishing the central clause of your family trust, which will govern how your estate is distributed among your children. Both options distribute the same total value and take effect under the same conditions, but they reflect fundamentally different principles about what matters most."

**Structural role**: Family legacy / rule-setting (family head → children → posthumous → permanent). The decider creates binding rules that will outlive them, shaping how resources flow across generations. This is the only domain where the decision-maker will never see the consequences of their choice -- a unique test of values expressed through structural design rather than personal experience.

| # | Value | Trust Structure | Value Description |
|---|-------|----------------|-------------------|
| 1 | Self_Direction_Action | Unrestricted lump sum | each child receives their share with complete freedom to use it however they choose, no conditions or oversight |
| 2 | Power_Dominance | Eldest-as-executor | the eldest child is designated executor with full authority to decide how and when distributions are made to the other siblings |
| 3 | Security_Personal | Conservative guaranteed annuity | assets are locked into a guaranteed-income annuity that provides a safe, predictable monthly payment to each child for life |
| 4 | Conformity_Interpersonal | Family consensus requirement | no distributions can be made unless all siblings agree unanimously, ensuring nobody's feelings are hurt by unilateral decisions |
| 5 | Tradition | Generational continuity clause | the trust follows the same distribution pattern your grandparents used, preserving the family's established customs for passing down wealth |
| 6 | Stimulation | Annual rotating opportunity fund | each year the trust offers a different, unpredictable disbursement format -- one year a travel stipend, the next a venture grant, the next an education fund -- so heirs never know what form next year's benefit will take |
| 7 | Benevolence_Dependability | Designated family steward | one child is named as family steward with the sole responsibility of ensuring every promise, payment, and obligation of the trust is reliably fulfilled on schedule |
| 8 | Universalism_Nature | Conservation land trust | a significant portion of the estate is directed into a permanent conservation easement that protects natural habitats in perpetuity |
| 9 | Achievement | Merit-based milestone distributions | distributions are unlocked when each child achieves specific demonstrated accomplishments -- degrees, professional certifications, or career milestones |
| 10 | Hedonism | Experience fund | assets are earmarked specifically for experiential spending: travel, fine dining, entertainment, and personal enjoyment for the heirs |

**Isolation concerns to review**:
- Eldest-as-executor (Power_Dominance): Must emphasize *authority over siblings' distributions*, not *responsibility/stewardship* (Benevolence_Dependability) or *tradition of primogeniture* (Tradition)
- Consensus requirement (Conformity_Interpersonal): Must emphasize *avoiding hurt feelings*, not *fairness/equality* (Universalism_Concern) or *family harmony as tradition* (Tradition)
- Rotating opportunity fund (Stimulation): Must emphasize *unpredictability/novelty of format*, not *financial risk* (which doesn't map to a Schwartz value cleanly). This is the hardest mapping in this domain -- may need iteration
- Family steward (Benevolence_Dependability): Must emphasize *reliable fulfillment of obligations*, not *executive authority* (Power_Dominance)
- Merit milestones (Achievement): Must emphasize *demonstrated competence*, not *conditional love* or *control over children's choices* (Power_Dominance)

---

#### 4. Company Culture

**Frame**: "You are co-founding a startup and must choose between two founding principles for the company charter. Both lead to equally profitable businesses with the same growth trajectory, but they create fundamentally different workplace cultures."

**Structural role**: Organizational design (founder → employees → permanent → high-stakes). The decider is creating institutional DNA that will shape how dozens or hundreds of people work together. Unlike City Planning (public infrastructure) or Inheritance (family rules), this is about designing the norms and incentives of a professional community.

| # | Value | Charter Principle | Value Description |
|---|-------|-------------------|-------------------|
| 1 | Self_Direction_Action | "Every employee sets their own goals and schedule" | maximum individual autonomy -- each person decides what to work on, when, and how, with no mandated structure |
| 2 | Power_Dominance | "Clear chain of command with executives making binding decisions" | a strict hierarchy where leaders direct subordinates and decisions flow top-down without debate |
| 3 | Security_Personal | "Guaranteed employment stability and comprehensive safety protocols" | predictability and safety -- no layoffs, no surprises, every risk managed and mitigated |
| 4 | Conformity_Interpersonal | "All decisions require team consensus to avoid anyone feeling overruled" | relational harmony above efficiency -- no one should ever feel their voice was ignored or their feelings dismissed |
| 5 | Tradition | "We honor the industry's time-tested practices and resist unproven methods" | preserving established ways of doing things, respecting the accumulated wisdom of how this industry has always operated |
| 6 | Stimulation | "Constant rotation of roles, projects, and challenges -- no one stays in the same position for long" | novelty and excitement built into the structure -- the company is designed so that nothing stays the same |
| 7 | Benevolence_Dependability | "Every commitment made -- to clients, partners, or teammates -- is tracked and fulfilled without exception" | reliability as the core identity -- the company is known above all for keeping every single promise it makes |
| 8 | Universalism_Nature | "Environmental impact is the primary consideration in every business decision" | protecting the natural world takes precedence -- no decision is made without first assessing its ecological footprint |
| 9 | Achievement | "Transparent performance rankings determine compensation, promotion, and recognition" | demonstrated competence is everything -- the best performers are publicly recognized and rewarded based on measurable results |
| 10 | Hedonism | "Workplace designed for maximum employee comfort, enjoyment, and pleasure" | the office is built around sensory pleasure -- gourmet food, comfortable spaces, and an atmosphere of relaxation and indulgence |

**Isolation concerns to review**:
- Autonomy principle (Self_Direction_Action): Must emphasize *freedom to act independently*, not *creative thinking* (Self_Direction_Thought) or *excitement of variety* (Stimulation)
- Consensus principle (Conformity_Interpersonal): Must emphasize *avoiding hurt feelings*, not *democratic governance* (which doesn't map to a Schwartz value) or *group loyalty* (Benevolence)
- Role rotation (Stimulation): Must emphasize *novelty/unpredictability*, not *employee development* (Achievement) or *freedom to explore* (Self_Direction_Action)
- Comfort workplace (Hedonism): Must emphasize *sensory pleasure and gratification*, not *employee wellness* (Benevolence_Caring) or *attracting talent* (Achievement)

---

### Tier 2: Promising (Need More Design Work)

These domains are viable but have specific challenges to resolve before implementation.

#### 5. Schools (Parent Choosing for Child)

**Frame**: "A parent is choosing between two schools for their child. Both have the same tuition, the same distance from home, and the same academic outcomes, but the educational philosophy is fundamentally different."

**Structural role**: Proxy decision-making (parent → child → ongoing → medium-stakes). Interesting because the decider is choosing on behalf of someone else, which may reveal different value patterns than self-interested choices.

**Challenge**: Some values are harder to map cleanly to a school context:
- Power_Dominance in a school setting risks activating negative associations (authoritarian school)
- Hedonism mapped to a school may seem frivolous (though play-based learning is a real philosophy)
- Conformity_Interpersonal mapped to school choice may bleed into social pressure

| # | Value | School Entity (Draft) |
|---|-------|-----------------------|
| 1 | Self_Direction_Action | Independent-study program where the child sets their own curriculum |
| 2 | Power_Dominance | School with student government where elected students direct activities |
| 3 | Security_Personal | Highly structured school with strict routines and safety protocols |
| 4 | Conformity_Interpersonal | School where the child's close friends are all attending |
| 5 | Tradition | Religious heritage school preserving centuries-old educational traditions |
| 6 | Stimulation | Experimental school with rotating projects and no fixed schedule |
| 7 | Benevolence_Dependability | School emphasizing peer mentoring commitments and follow-through |
| 8 | Universalism_Nature | Outdoor education school based in a nature reserve |
| 9 | Achievement | Competitive prep school with rigorous rankings and performance metrics |
| 10 | Hedonism | Arts-focused school emphasizing creative play and sensory experiences |

**Status**: Needs value isolation review. Power_Dominance and Hedonism mappings may need creative rethinking.

---

#### 6. Neighborhoods

**Frame**: "A person is relocating and must choose between two neighborhoods. Both have the same rent, the same commute time, and the same quality of housing, but the community character is fundamentally different."

**Structural role**: Environmental/ambient choice (individual → self → ongoing → medium-stakes). Viable but overlaps with the "personal lifestyle" category that Jobs and Hobbies already cover. Could be promoted to Tier 1 if we want a fifth domain.

**Draft entity mappings available** (see git history for full table). Core entities: artists' district (Self_Direction_Action), HOA enclave (Power_Dominance), gated community (Security_Personal), family neighborhood (Conformity_Interpersonal), historic district (Tradition), eclectic district (Stimulation), close-knit block (Benevolence_Dependability), nature preserve border (Universalism_Nature), high-achiever enclave (Achievement), restaurant/spa district (Hedonism).

**Status**: Well-designed but structurally similar to other personal-choice domains. Lower priority than City Planning, Inheritance, and Company Culture.

---

#### 7. Community Grant

**Frame**: "Your neighborhood received a one-time grant and the community board must choose between two projects. Both cost the same, serve the same number of residents, and take the same time to complete, but address fundamentally different community needs."

**Structural role**: Resource allocation (board member → community → one-time → medium-stakes). Interesting because it's about distributing a scarce resource rather than choosing a personal preference.

**Challenge**: Overlaps significantly with City Planning. Would need to differentiate by focusing on smaller-scale, more personal community projects rather than infrastructure.

**Status**: May be redundant with City Planning. Consider only if we need a sixth domain.

---

### Tier 3: Rejected or Deferred

| Domain | Reason |
|--------|--------|
| **Vacations** | Too similar to Hobbies -- both are "how I spend my free time" with no obligation. |
| **Investments** | Financial framing inherently biases toward Self-Enhancement (Power_Resources, Achievement). Hard to cleanly express Tradition or Conformity. |
| **Policies/Legislation** | Political framing is polarizing and may trigger model safety guardrails rather than genuine value expression. |
| **Gifts** | Gift-giving is inherently other-oriented, biasing toward Self-Transcendence. Hard to express Self_Direction_Action or Hedonism. |
| **Volunteer Commitments** | Volunteering frame inherently activates Self-Transcendence values, making Self-Enhancement and Conservation values feel contrived. |
| **Clubs/Organizations** | Significant overlap with Hobbies. Would need distinct entity mappings to justify. |
| **Roommates** | Too similar to Neighborhoods and harder to map all 10 values. |

---

## Recommended First Batch

Create four new domains in parallel, alongside the existing Jobs domain:

| Domain | Decider Role | Who's Affected | Time Horizon | Choice Type |
|--------|-------------|----------------|-------------|-------------|
| **Jobs** (existing) | Individual | Self | Ongoing | Personal livelihood |
| **Hobbies** | Individual | Self | Recurring | Personal leisure |
| **City Planning** | Public official | Community | Permanent | Infrastructure policy |
| **Inheritance** | Family head | Children | Posthumous | Legacy rule-setting |
| **Company Culture** | Founder | Employees | Permanent | Organizational design |

This gives us **5 domains x 45 vignettes = 225 vignettes** and **5 x 1,125 = 5,625 total scenarios**.

**Why these five complement each other:**
- **Jobs** = obligatory, professional (you must earn a living)
- **Hobbies** = voluntary, personal (what you choose when free)
- **City Planning** = civic, public-serving (you decide for a community)
- **Inheritance** = private, posthumous (you set rules you'll never see enforced)
- **Company Culture** = organizational, foundational (you create the DNA of an institution)

Together they span: personal → institutional, self-serving → other-serving, temporary → permanent, and individual → community. No two domains share the same structural profile.

---

## Creation Workflow

### Per-domain process

Each domain follows this pipeline:

```
1. DESIGN (human-intensive)
   ├── Draft value-to-entity mapping table (10 values -> 10 entities)
   ├── Write value descriptions (one per entity)
   ├── Conduct value isolation review (check for cross-value bleed)
   ├── Write template (opening paragraph + option structure + Likert scale)
   └── Write 5 sample vignettes (covering all 10 values, 2 appearances each)

2. REVIEW (human approval gate)
   └── Review samples, revise descriptions, confirm isolation

3. CREATE (parallelizable, MCP-driven)
   ├── Generate all 45 vignettes via create_definition MCP tool
   ├── Tag all 45 with domain tag + "generated" tag
   ├── Set preamble on all 45 (No Reframe preamble)
   └── Spot-check 3-5 vignettes via graphql_query

4. VALIDATE (optional but recommended)
   ├── Run 1% sample against 2-3 models
   └── Check for degenerate responses (always 3, always 5, refusals)
```

### Parallelization strategy

Steps 1-2 (Design + Review) for each domain can happen in parallel across separate Claude Code sessions or branches. Step 3 (Create) can be fully parallelized once designs are approved.

**Recommended parallel workflow:**
```
Session A: Design Hobbies domain        ──→ Review ──→ Create 45 vignettes
Session B: Design City Planning domain   ──→ Review ──→ Create 45 vignettes
Session C: Design Inheritance domain     ──→ Review ──→ Create 45 vignettes
Session D: Design Company Culture domain ──→ Review ──→ Create 45 vignettes
```

### Naming and tagging conventions

| Property | Convention | Example |
|----------|-----------|---------|
| **Vignette name** | `{Domain} ({Value A} vs {Value B})` | `Hobbies (Stimulation vs Tradition)` |
| **Domain tag** | Lowercase domain name | `hobbies`, `neighborhoods`, `vacations` |
| **Generation tag** | Always `generated` | `generated` |
| **Preamble** | "No Reframe" preamble (ID: `cmlqwnn3u0213ts92xv1k66oh`) | -- |

### MCP tools used per domain

| Step | Tool | Count |
|------|------|-------|
| Create vignettes | `create_definition` | 45 calls |
| Add tags | `add_tags_to_definitions` | 1 call (bulk, up to 100 IDs) |
| Set preamble | `update_definition` | 45 calls |
| Spot-check | `graphql_query` | 3-5 calls |

---

## Template Reference: Creating a New Domain

To add a new domain, fill in this template:

### Domain: [Name]

**Frame sentence** (the equal-footing opening paragraph):
> "[Setup]. Both [equal-footing clause], but [differentiator]."

**Value-to-entity mapping:**

| # | Value | Entity Name | Value Description | Isolation Notes |
|---|-------|-------------|-------------------|-----------------|
| 1 | Self_Direction_Action | [entity] | [description activating this value] | [potential bleed risks] |
| 2 | Power_Dominance | [entity] | [description] | [bleed risks] |
| 3 | Security_Personal | [entity] | [description] | [bleed risks] |
| 4 | Conformity_Interpersonal | [entity] | [description] | [bleed risks] |
| 5 | Tradition | [entity] | [description] | [bleed risks] |
| 6 | Stimulation | [entity] | [description] | [bleed risks] |
| 7 | Benevolence_Dependability | [entity] | [description] | [bleed risks] |
| 8 | Universalism_Nature | [entity] | [description] | [bleed risks] |
| 9 | Achievement | [entity] | [description] | [bleed risks] |
| 10 | Hedonism | [entity] | [description] | [bleed risks] |

**Value isolation review checklist:**
- [ ] Each entity activates primarily one Schwartz value
- [ ] No entity description uses language from adjacent values on the circumplex
- [ ] Power_Dominance focuses on *control over people*, not resources or achievement
- [ ] Security_Personal focuses on *personal safety/predictability*, not societal security
- [ ] Conformity_Interpersonal uses *avoidance framing* (avoiding upsetting), not approach framing (gaining approval)
- [ ] Benevolence_Dependability focuses on *reliability/trust*, not *emotional care/compassion*
- [ ] Achievement focuses on *demonstrated competence*, not reputation (Face) or dominance (Power)
- [ ] Hedonism focuses on *sensory pleasure/gratification*, not intellectual curiosity or novelty
- [ ] Stimulation focuses on *novelty/challenge*, not sensory pleasure or risk-taking for its own sake
- [ ] Tradition focuses on *cultural/heritage preservation*, not family obligation (Conformity) or religious rules (Conformity_Rules)

---

## Open Questions

1. **Same 10 values or expand?** This plan assumes the same 10 values across all domains for cross-domain comparison. Should any domain use a different value subset? (Recommendation: keep the same 10 for the first batch, then evaluate.)

2. **Stimulation mapping in Inheritance**: The "annual rotating opportunity fund" is the weakest entity mapping in the batch. Does the unpredictability framing carry enough Stimulation signal, or should we try a different approach? Alternatives: rotating charitable cause chosen by lottery; annual surprise experience chosen by an independent trustee.

3. **City Planning: civic role vs. personal values**: When a model answers as a city planner, does it express its own values or perform a "good public servant" persona? May need validation runs to check whether civic-role framing dampens value variation across models.

4. **Automation for bulk creation?** Creating 45 vignettes per domain via MCP is ~90 tool calls (45 creates + 1 tag + 45 preamble updates). Worth scripting, or manageable via Claude Code sessions?

5. **Validation runs before full deployment?** Should each domain go through a 1% sample run to catch degenerate scenarios before committing to full evaluation runs? (The Jobs validation run showed that dimension levels do drive real signal.)

6. **Should the existing 7 original Jobs vignettes be retired?** The 45 generated ones now cover all combinations with consistent descriptions. The originals may have slightly different wording.

7. **Folder organization?** Should each domain get a folder in the UI, or are tags sufficient for filtering?

8. **Order of domain creation**: Should we create the most structurally different domains first (City Planning, Inheritance) to maximize early learning, or start with Hobbies (most similar to Jobs) for a safer proof-of-concept?

---

## Appendix: Value Isolation Principles

These principles were learned during the Jobs domain design and apply to every domain.

### The Schwartz Circumplex Proximity Rule

Values that are adjacent on the Schwartz circle share motivational components. When writing entity descriptions, the most common bleed is into **adjacent** values:

| Value | Watch out for bleed into |
|-------|--------------------------|
| Self_Direction_Action | Stimulation (excitement of freedom), Self_Direction_Thought (intellectual independence) |
| Power_Dominance | Achievement (success through control), Power_Resources (material leverage) |
| Security_Personal | Security_Societal (collective safety), Conformity_Rules (structure as rules) |
| Conformity_Interpersonal | Tradition (family obligation framing), Benevolence (relationship warmth) |
| Tradition | Conformity_Interpersonal (social pressure), Security (stability of the familiar) |
| Stimulation | Hedonism (pleasure of excitement), Self_Direction_Action (freedom to explore) |
| Benevolence_Dependability | Benevolence_Caring (emotional concern), Conformity_Interpersonal (avoiding letting people down) |
| Universalism_Nature | Universalism_Concern (justice/equality framing), Benevolence_Caring (compassion for animals) |
| Achievement | Face (reputation), Power_Dominance (competitive dominance) |
| Hedonism | Stimulation (thrill-seeking), Self_Direction_Action (freedom to indulge) |

### The Description Test

For each entity description, ask:
1. If I removed the entity name and only read the description, which ONE value would I identify?
2. Does the description use any verbs or adjectives that belong to a different value?
3. Would a person who strongly values X (but not Y) be drawn to this description?

If the answer to #1 is ambiguous, revise the description.
