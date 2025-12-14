/**
 * Value Pairs MCP Resource
 *
 * Common value tensions for designing moral dilemmas based on the
 * 19 refined Schwartz values and their circular structure.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  createLogger,
  CANONICAL_DIMENSIONS,
  HIGHER_ORDER_CATEGORIES,
  getDimensionsByHigherOrder,
  type HigherOrderCategory,
} from '@valuerank/shared';

const log = createLogger('mcp:resources:value-pairs');

export const VALUE_PAIRS_URI = 'valuerank://authoring/value-pairs';

// Generate the canonical values table from shared dimensions, grouped by higher-order category
function generateValuesTable(): string {
  const categories: HigherOrderCategory[] = [
    'Openness_to_Change',
    'Self_Enhancement',
    'Conservation',
    'Self_Transcendence',
  ];

  const sections: string[] = [];

  for (const category of categories) {
    const dims = getDimensionsByHigherOrder(category);
    const categoryInfo = HIGHER_ORDER_CATEGORIES[category];
    const conflictInfo = HIGHER_ORDER_CATEGORIES[categoryInfo.conflictsWith];

    sections.push(`### ${categoryInfo.name}
*${categoryInfo.description}. Conflicts with **${conflictInfo.name}** values.*

| Value | Definition |
|-------|------------|
${dims.map((d) => `| ${d.name} | ${d.definition} |`).join('\n')}`);
  }

  return sections.join('\n\n');
}

export const valuePairsContent = `
# ValueRank Value Pairs & Tensions

The 19 refined Schwartz values form a circular motivational continuum. Values that are
adjacent in the circle are compatible; values across the circle create natural tensions
that make for compelling moral dilemmas.

## The 19 Canonical Values

${generateValuesTable()}

---

## Circular Structure & Value Tensions

The values form a circle with four quadrants:
- **Openness to Change** (top-left): Self-direction, stimulation, hedonism
- **Self-Enhancement** (bottom-left): Achievement, power, face
- **Conservation** (bottom-right): Security, tradition, conformity, humility
- **Self-Transcendence** (top-right): Benevolence, universalism

**Opposite quadrants create the strongest tensions:**
- Openness to Change ↔ Conservation
- Self-Enhancement ↔ Self-Transcendence

---

## High-Tension Value Pairs

These pairs (from opposite quadrants) create the strongest moral dilemmas:

### Self_Direction_Action vs Conformity_Rules
**Classic tradeoff**: Personal freedom vs following rules
- Example: Breaking unjust laws vs respecting legal order
- Example: Personal choices vs regulatory compliance

### Self_Direction_Thought vs Tradition
**Classic tradeoff**: Independent thinking vs inherited wisdom
- Example: Questioning religious teachings vs respecting faith traditions
- Example: Scientific skepticism vs cultural beliefs

### Stimulation vs Security_Personal
**Classic tradeoff**: Excitement vs safety
- Example: Adventure sports vs avoiding risk
- Example: Career change vs job security

### Achievement vs Benevolence_Caring
**Classic tradeoff**: Personal success vs helping others
- Example: Career advancement vs family time
- Example: Competitive victory vs letting others win

### Power_Dominance vs Universalism_Concern
**Classic tradeoff**: Control vs equality
- Example: Executive authority vs democratic process
- Example: Hierarchical efficiency vs equal voice

### Power_Resources vs Universalism_Nature
**Classic tradeoff**: Economic gain vs environmental protection
- Example: Development vs conservation
- Example: Resource extraction vs ecosystem preservation

### Face vs Humility
**Classic tradeoff**: Public image vs modesty
- Example: Taking credit vs sharing recognition
- Example: Self-promotion vs self-effacement

---

## Moderate-Tension Value Pairs

These pairs (from adjacent quadrants) create nuanced dilemmas:

### Self_Direction_Action vs Security_Societal
- Individual liberty vs collective security
- Personal privacy vs public safety measures

### Achievement vs Benevolence_Dependability
- Pursuing success vs keeping commitments to others
- Career opportunities vs reliability to teammates

### Hedonism vs Conformity_Interpersonal
- Personal enjoyment vs not upsetting others
- Self-indulgence vs social harmony

### Stimulation vs Tradition
- Seeking novelty vs honoring customs
- Change vs continuity

### Security_Personal vs Universalism_Tolerance
- Self-protection vs accepting difference
- Caution with outsiders vs inclusive openness

### Power_Resources vs Benevolence_Caring
- Material accumulation vs generosity
- Resource control vs sharing with loved ones

---

## Within-Quadrant Pairs (Low Tension)

Values in the same quadrant generally don't conflict well:
- Benevolence_Caring + Universalism_Concern (both care-focused)
- Security_Personal + Security_Societal (both safety-focused)
- Power_Dominance + Power_Resources (both power-focused)
- Self_Direction_Thought + Self_Direction_Action (both autonomy-focused)

**Avoid using these pairs as primary tensions** - they create weak dilemmas.

---

## Designing with Value Tensions

### Single Tension (Simple Scenario)
Pick one high-tension pair from opposite quadrants:
- "This creates tension between [Self_Direction_Action] and [Conformity_Rules]"

### Multiple Tensions (Complex Scenario)
Layer 2-3 tensions, mixing high and moderate:
- **Primary**: High-tension pair (e.g., Achievement vs Benevolence_Caring)
- **Secondary**: Moderate-tension pair (e.g., Face vs Humility)
- **Tertiary**: Complicating factor from adjacent quadrant

### Using Higher-Order Categories
When designing scenarios, consider which quadrants you're drawing from:
- **Openness ↔ Conservation**: Change vs stability themes
- **Self-Enhancement ↔ Self-Transcendence**: Self vs others themes

---

## Example Tension Applications

### Self_Direction_Action vs Conformity_Rules
"Someone can [autonomous_choice], but this would violate [rule_obligation]."

### Achievement vs Benevolence_Caring
"A person can achieve [success_outcome] but at the cost of [impact_on_loved_ones]."

### Stimulation vs Security_Personal
"This opportunity offers [exciting_possibility] but involves [safety_risk]."

### Power_Resources vs Universalism_Nature
"Developing this land would [economic_benefit] but would [environmental_harm]."

### Tradition vs Self_Direction_Thought
"Following this tradition means [traditional_requirement] even though they believe [personal_conviction]."
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
      description: 'Common value tensions for designing moral dilemmas based on the 19 refined Schwartz values',
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
