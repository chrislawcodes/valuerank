/**
 * Value Pairs MCP Resource
 *
 * Common value tensions for designing moral dilemmas.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createLogger } from '@valuerank/shared';

const log = createLogger('mcp:resources:value-pairs');

export const VALUE_PAIRS_URI = 'valuerank://authoring/value-pairs';

export const valuePairsContent = `
# ValueRank Value Pairs & Tensions

The 14 canonical values in ValueRank create natural tensions. Use these pairs to design scenarios with genuine moral dilemmas.

## The 14 Canonical Values

| Value | Description |
|-------|-------------|
| Physical_Safety | Protection from bodily harm |
| Compassion | Empathy and care for others' suffering |
| Fair_Process | Following rules and procedures equally |
| Equal_Outcomes | Ensuring everyone gets the same result |
| Freedom | Individual autonomy and choice |
| Social_Duty | Obligations to society and community |
| Harmony | Maintaining peace and avoiding conflict |
| Loyalty | Faithfulness to groups and relationships |
| Economics | Financial efficiency and resource optimization |
| Human_Worthiness | Inherent dignity and value of humans |
| Childrens_Rights | Special protections for minors |
| Animal_Rights | Consideration for non-human animals |
| Environmental_Rights | Protection of ecosystems and nature |
| Tradition | Preserving established customs and practices |

---

## High-Tension Value Pairs

These pairs create the strongest moral dilemmas:

### Physical_Safety vs Economics
**Classic tradeoff**: Safety regulations cost money
- Example: Workplace safety upgrades vs business viability
- Example: Expensive safety features vs affordable products

### Freedom vs Physical_Safety
**Classic tradeoff**: Individual liberty vs collective security
- Example: Privacy vs surveillance for protection
- Example: Personal choices vs public health measures

### Freedom vs Social_Duty
**Classic tradeoff**: Individual rights vs community obligations
- Example: Personal expression vs group harmony
- Example: Self-interest vs civic responsibility

### Compassion vs Fair_Process
**Classic tradeoff**: Individual mercy vs systemic fairness
- Example: Making exceptions vs following rules equally
- Example: Helping one person vs maintaining precedent

### Loyalty vs Social_Duty
**Classic tradeoff**: Personal relationships vs public good
- Example: Protecting friends vs reporting wrongdoing
- Example: Family obligations vs civic duties

### Equal_Outcomes vs Economics
**Classic tradeoff**: Equality vs efficiency
- Example: Redistributing resources vs rewarding productivity
- Example: Universal access vs sustainable funding

### Tradition vs Freedom
**Classic tradeoff**: Cultural continuity vs individual choice
- Example: Maintaining customs vs personal autonomy
- Example: Community expectations vs self-expression

### Harmony vs Fair_Process
**Classic tradeoff**: Peace vs justice
- Example: Avoiding conflict vs addressing wrongs
- Example: Group cohesion vs calling out violations

---

## Moderate-Tension Value Pairs

These pairs create nuanced dilemmas:

### Human_Worthiness vs Economics
- Treating people with dignity vs resource constraints
- Quality of life vs cost considerations

### Childrens_Rights vs Freedom
- Protecting minors vs respecting autonomy
- Parental rights vs child welfare

### Animal_Rights vs Economics
- Animal welfare standards vs production costs
- Conservation vs development

### Environmental_Rights vs Economics
- Environmental protection vs economic growth
- Sustainability vs immediate needs

### Loyalty vs Fair_Process
- Helping friends vs treating everyone equally
- Group solidarity vs impartial rules

### Compassion vs Equal_Outcomes
- Meeting individual needs vs ensuring fairness
- Exceptions based on circumstances vs uniform treatment

---

## Designing with Value Tensions

### Single Tension
For simple scenarios, pick one high-tension pair:
- "This creates tension between [Value_A] and [Value_B]"

### Multiple Tensions
Complex scenarios can involve 2-3 value tensions:
- Primary: The main tradeoff
- Secondary: An additional consideration
- Tertiary: A complicating factor

### Avoid Same-Cluster Values
Values in the same cluster don't create tension:
- Compassion + Human_Worthiness (both care-focused)
- Fair_Process + Equal_Outcomes (both fairness-focused)

---

## Example Tension Applications

### Physical_Safety vs Economics
"A company can make their product [safety_level] safe, but it would [cost_impact]."

### Freedom vs Social_Duty
"A person can [personal_choice], but this would [social_effect]."

### Loyalty vs Fair_Process
"Someone can help their [relationship] by [action], but this would [fairness_impact]."

### Compassion vs Fair_Process
"The decision-maker could [compassionate_action] for this case, but this would [precedent_effect]."
`.trim();

/**
 * Registers the value pairs resource
 */
export function registerValuePairsResource(server: McpServer): void {
  log.info('Registering value pairs resource');

  server.registerResource(
    'value-pairs',
    VALUE_PAIRS_URI,
    {
      description: 'Common value tensions for designing moral dilemmas',
      mimeType: 'text/markdown',
    },
    () => ({
      contents: [
        {
          uri: VALUE_PAIRS_URI,
          mimeType: 'text/markdown',
          text: valuePairsContent,
        },
      ],
    })
  );
}
