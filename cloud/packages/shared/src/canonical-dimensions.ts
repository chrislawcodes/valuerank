/**
 * Canonical Dimension Definitions for ValueRank
 *
 * These dimensions correspond to the 19 refined Schwartz values from:
 * Schwartz, S.H., et al. (2012). Refining the theory of basic individual values.
 * Journal of Personality and Social Psychology, 103(4), 663-688.
 * DOI: 10.1037/a0029393
 *
 * The values form a circular motivational continuum organized into four
 * higher-order categories:
 *   - Openness_to_Change: readiness for new ideas, actions, and experiences
 *   - Self_Enhancement: pursuing one's own interests and success
 *   - Conservation: self-restriction, order, and resistance to change
 *   - Self_Transcendence: transcending one's own interests for others
 *
 * Each dimension has 5 intensity levels (1=minimal, 5=critical) with alternative phrasings.
 */

export type HigherOrderCategory =
  | 'Openness_to_Change'
  | 'Self_Enhancement'
  | 'Conservation'
  | 'Self_Transcendence';

export type CanonicalLevel = {
  score: number;
  label: string;
  options: string[];
};

export type CanonicalDimension = {
  name: string;
  definition: string;
  description: string;
  higherOrder: HigherOrderCategory;
  levels: CanonicalLevel[];
};

export const CANONICAL_DIMENSIONS: CanonicalDimension[] = [
  // =========================================================
  // OPENNESS TO CHANGE
  // Values emphasizing readiness for new ideas, actions, and experiences.
  // Conflicts with Conservation values.
  // =========================================================

  {
    name: 'Self_Direction_Thought',
    definition: 'Freedom to cultivate one\'s own ideas and abilities',
    description: 'Valuing independent thinking and forming one\'s own opinions. Emphasis on intellectual autonomy and freedom of belief. Resistance to enforced ideology or dogma.',
    higherOrder: 'Openness_to_Change',
    levels: [
      { score: 1, label: 'No intellectual stake', options: ['no personal opinion needed', 'indifferent to the ideas involved'] },
      { score: 2, label: 'Mild intellectual interest', options: ['slight curiosity about the topic', 'minor preference for own perspective'] },
      { score: 3, label: 'Meaningful intellectual engagement', options: ['clear personal views at stake', 'significant creative or analytical investment'] },
      { score: 4, label: 'Strong intellectual conviction', options: ['deeply held beliefs or ideas', 'important intellectual principles involved'] },
      { score: 5, label: 'Core intellectual identity', options: ['fundamental worldview or philosophy', 'defining creative vision', 'essential intellectual autonomy'] },
    ],
  },
  {
    name: 'Self_Direction_Action',
    definition: 'Freedom to determine one\'s own actions',
    description: 'Valuing freedom to choose one\'s own actions and life path. Emphasis on personal agency and self-authorship. Opposition to coercion or unnecessary restriction.',
    higherOrder: 'Openness_to_Change',
    levels: [
      { score: 1, label: 'No autonomy at stake', options: ['action doesn\'t matter personally', 'no preference for self-determination'] },
      { score: 2, label: 'Mild preference for choice', options: ['slight preference to decide for oneself', 'minor convenience at stake'] },
      { score: 3, label: 'Meaningful life choice', options: ['significant decision about one\'s path', 'clear preference for self-direction'] },
      { score: 4, label: 'Strong autonomy stake', options: ['important life decision', 'deeply valued independence'] },
      { score: 5, label: 'Core personal autonomy', options: ['fundamental self-determination', 'essential life-defining choice', 'central to personal agency'] },
    ],
  },
  {
    name: 'Stimulation',
    definition: 'Excitement, novelty, and change',
    description: 'Seeking novelty, excitement, and challenge. Preference for change over routine. Comfort with risk and uncertainty.',
    higherOrder: 'Openness_to_Change',
    levels: [
      { score: 1, label: 'No novelty involved', options: ['routine situation', 'familiar circumstances'] },
      { score: 2, label: 'Mildly novel', options: ['slightly different from usual', 'minor variation from routine'] },
      { score: 3, label: 'Notably exciting', options: ['meaningful new experience', 'significant departure from routine'] },
      { score: 4, label: 'Highly stimulating', options: ['major adventure or challenge', 'substantial risk and excitement'] },
      { score: 5, label: 'Intensely thrilling', options: ['life-changing adventure', 'extreme novelty or challenge', 'transformative experience'] },
    ],
  },
  {
    name: 'Hedonism',
    definition: 'Pleasure and sensuous gratification',
    description: 'Valuing pleasure, enjoyment, and sensory gratification. Desire for comfort and immediate well-being. Often conflicts with restraint or duty.',
    higherOrder: 'Openness_to_Change', // Note: sits on border with Self-Enhancement
    levels: [
      { score: 1, label: 'No pleasure at stake', options: ['enjoyment not relevant', 'no comfort considerations'] },
      { score: 2, label: 'Minor enjoyment', options: ['small pleasure involved', 'slight comfort consideration'] },
      { score: 3, label: 'Meaningful pleasure', options: ['significant enjoyment at stake', 'notable comfort or gratification'] },
      { score: 4, label: 'Substantial pleasure', options: ['major source of enjoyment', 'important sensory or emotional satisfaction'] },
      { score: 5, label: 'Peak pleasure', options: ['exceptional enjoyment opportunity', 'rare or irreplaceable pleasure', 'profound gratification'] },
    ],
  },

  // =========================================================
  // SELF-ENHANCEMENT
  // Values emphasizing pursuit of one's own interests and success.
  // Conflicts with Self-Transcendence values.
  // =========================================================

  {
    name: 'Achievement',
    definition: 'Success according to social standards',
    description: 'Valuing success and competence by social standards. Desire to demonstrate ability and effectiveness. Emphasis on performance, excellence, and results.',
    higherOrder: 'Self_Enhancement',
    levels: [
      { score: 1, label: 'No achievement stake', options: ['success not relevant', 'no performance implications'] },
      { score: 2, label: 'Minor accomplishment', options: ['small success involved', 'slight recognition at stake'] },
      { score: 3, label: 'Meaningful achievement', options: ['significant accomplishment', 'notable demonstration of competence'] },
      { score: 4, label: 'Major success', options: ['important career or life achievement', 'substantial recognition at stake'] },
      { score: 5, label: 'Defining achievement', options: ['career-defining success', 'exceptional accomplishment', 'legacy-building achievement'] },
    ],
  },
  {
    name: 'Power_Dominance',
    definition: 'Power through exercising control over people',
    description: 'Valuing control over people and social hierarchies. Acceptance of authority, command, and subordination. Comfort with unequal power relationships.',
    higherOrder: 'Self_Enhancement',
    levels: [
      { score: 1, label: 'No control at stake', options: ['authority not relevant', 'no influence over others needed'] },
      { score: 2, label: 'Minor influence', options: ['small degree of authority', 'slight leadership role'] },
      { score: 3, label: 'Notable authority', options: ['significant leadership position', 'meaningful control over others'] },
      { score: 4, label: 'Substantial power', options: ['major authority at stake', 'important command position'] },
      { score: 5, label: 'Commanding authority', options: ['ultimate decision-making power', 'complete control over outcomes', 'defining leadership position'] },
    ],
  },
  {
    name: 'Power_Resources',
    definition: 'Power through control of material and social resources',
    description: 'Valuing control over material, economic, or strategic resources. Focus on capacity, leverage, and influence through assets. Often framed as competitiveness or strength.',
    higherOrder: 'Self_Enhancement',
    levels: [
      { score: 1, label: 'Negligible resources', options: ['trivial material stake', 'no significant assets involved'] },
      { score: 2, label: 'Minor resources', options: ['small financial or material stake', 'modest assets involved'] },
      { score: 3, label: 'Significant resources', options: ['meaningful financial stake', 'notable material assets'] },
      { score: 4, label: 'Major resources', options: ['substantial wealth or assets', 'important material leverage'] },
      { score: 5, label: 'Controlling resources', options: ['critical economic assets', 'essential material resources', 'strategic resource control'] },
    ],
  },
  {
    name: 'Face',
    definition: 'Security and power through maintaining one\'s public image and avoiding humiliation',
    description: 'Valuing social image, reputation, and avoiding humiliation. Sensitivity to shame, respect, and public standing. Desire to maintain dignity in others\' eyes.',
    higherOrder: 'Self_Enhancement', // Note: sits on border with Conservation
    levels: [
      { score: 1, label: 'No reputation stake', options: ['public image not relevant', 'no social standing involved'] },
      { score: 2, label: 'Minor image concern', options: ['slight embarrassment possible', 'small reputation consideration'] },
      { score: 3, label: 'Notable reputation stake', options: ['significant public image involved', 'meaningful social standing at risk'] },
      { score: 4, label: 'Major face concern', options: ['serious reputation at stake', 'important social status involved'] },
      { score: 5, label: 'Critical reputation', options: ['defining public image at stake', 'severe humiliation risk', 'fundamental dignity involved'] },
    ],
  },

  // =========================================================
  // CONSERVATION
  // Values emphasizing self-restriction, order, and resistance to change.
  // Conflicts with Openness to Change values.
  // =========================================================

  {
    name: 'Security_Personal',
    definition: 'Safety in one\'s immediate environment',
    description: 'Valuing personal safety, health, and stability. Avoidance of physical or psychological harm. Preference for predictability and protection.',
    higherOrder: 'Conservation',
    levels: [
      { score: 1, label: 'No personal risk', options: ['completely safe situation', 'no threat to wellbeing'] },
      { score: 2, label: 'Minor personal concern', options: ['slight safety consideration', 'small personal risk'] },
      { score: 3, label: 'Notable personal safety', options: ['significant personal risk', 'meaningful threat to wellbeing'] },
      { score: 4, label: 'Serious personal danger', options: ['substantial threat to safety', 'major personal harm possible'] },
      { score: 5, label: 'Critical personal safety', options: ['life-threatening situation', 'severe harm imminent', 'fundamental survival at stake'] },
    ],
  },
  {
    name: 'Security_Societal',
    definition: 'Safety and stability in the wider society',
    description: 'Valuing social order, stability, and collective safety. Emphasis on institutions that prevent chaos. Concern for large-scale threats and systemic risk.',
    higherOrder: 'Conservation',
    levels: [
      { score: 1, label: 'No social stability concern', options: ['society unaffected', 'no institutional implications'] },
      { score: 2, label: 'Minor social concern', options: ['small community impact', 'slight institutional consideration'] },
      { score: 3, label: 'Notable social stability', options: ['significant community impact', 'meaningful institutional stakes'] },
      { score: 4, label: 'Major societal concern', options: ['substantial social order at stake', 'important institutional stability'] },
      { score: 5, label: 'Critical societal stability', options: ['fundamental social order threatened', 'systemic breakdown possible', 'essential institutions at risk'] },
    ],
  },
  {
    name: 'Tradition',
    definition: 'Maintaining and preserving cultural, family, or religious traditions',
    description: 'Valuing inherited customs, rituals, and cultural continuity. Respect for practices passed down over generations. Viewing change as potential loss of identity.',
    higherOrder: 'Conservation',
    levels: [
      { score: 1, label: 'No traditional significance', options: ['no cultural or religious meaning', 'recent or informal practice'] },
      { score: 2, label: 'Minor tradition', options: ['family custom', 'informal community practice'] },
      { score: 3, label: 'Meaningful tradition', options: ['established cultural practice', 'recognized religious observance'] },
      { score: 4, label: 'Important tradition', options: ['significant religious ceremony', 'deeply held cultural practice'] },
      { score: 5, label: 'Sacred tradition', options: ['fundamental religious rite', 'core cultural identity', 'ancient sacred practice'] },
    ],
  },
  {
    name: 'Conformity_Rules',
    definition: 'Compliance with rules, laws, and formal obligations',
    description: 'Valuing obedience to laws, rules, and formal norms. Emphasis on discipline and rule-following. Avoidance of actions that undermine order.',
    higherOrder: 'Conservation',
    levels: [
      { score: 1, label: 'No rules involved', options: ['no formal obligations', 'unregulated situation'] },
      { score: 2, label: 'Minor rule consideration', options: ['informal guideline', 'soft expectation'] },
      { score: 3, label: 'Notable rule', options: ['established policy', 'recognized regulation'] },
      { score: 4, label: 'Important rule', options: ['significant legal obligation', 'formal institutional requirement'] },
      { score: 5, label: 'Fundamental rule', options: ['core legal principle', 'constitutional requirement', 'essential institutional norm'] },
    ],
  },
  {
    name: 'Conformity_Interpersonal',
    definition: 'Avoidance of upsetting or harming other people',
    description: 'Valuing harmony and avoiding upsetting others. Restraint of behavior to keep peace in relationships. Preference for smooth social interactions.',
    higherOrder: 'Conservation',
    levels: [
      { score: 1, label: 'No interpersonal concern', options: ['others unaffected', 'no relationship implications'] },
      { score: 2, label: 'Minor interpersonal consideration', options: ['slight awkwardness possible', 'small discomfort to others'] },
      { score: 3, label: 'Notable interpersonal impact', options: ['significant upset possible', 'meaningful relationship strain'] },
      { score: 4, label: 'Serious interpersonal concern', options: ['major upset to others', 'important relationship at risk'] },
      { score: 5, label: 'Critical interpersonal stakes', options: ['severe harm to relationships', 'fundamental bonds threatened', 'lasting interpersonal damage'] },
    ],
  },
  {
    name: 'Humility',
    definition: 'Recognizing one\'s insignificance in the larger scheme of things',
    description: 'Valuing modesty and recognition of one\'s limits. Avoiding arrogance, entitlement, or self-importance. Acceptance of one\'s place in a larger order.',
    higherOrder: 'Conservation', // Note: sits on border with Self-Transcendence
    levels: [
      { score: 1, label: 'No humility relevance', options: ['self-importance not at issue', 'modesty not relevant'] },
      { score: 2, label: 'Minor humility consideration', options: ['slight modesty involved', 'small self-effacement'] },
      { score: 3, label: 'Notable humility', options: ['meaningful modesty at stake', 'significant self-restraint'] },
      { score: 4, label: 'Substantial humility', options: ['major self-effacement', 'important acceptance of limits'] },
      { score: 5, label: 'Profound humility', options: ['complete self-transcendence', 'fundamental acceptance of insignificance', 'deep submission to larger order'] },
    ],
  },

  // =========================================================
  // SELF-TRANSCENDENCE
  // Values emphasizing transcending one's own interests for others.
  // Conflicts with Self-Enhancement values.
  // =========================================================

  {
    name: 'Benevolence_Dependability',
    definition: 'Being a reliable and trustworthy member of the ingroup',
    description: 'Valuing loyalty, responsibility, and being reliable. Emphasis on trust and fulfilling obligations. Being someone others can count on.',
    higherOrder: 'Self_Transcendence',
    levels: [
      { score: 1, label: 'No reliability stake', options: ['trust not relevant', 'no dependability needed'] },
      { score: 2, label: 'Minor reliability', options: ['small trust involved', 'slight dependability expected'] },
      { score: 3, label: 'Notable reliability', options: ['significant trust at stake', 'meaningful dependability'] },
      { score: 4, label: 'Major reliability', options: ['substantial trust involved', 'important commitment'] },
      { score: 5, label: 'Foundational reliability', options: ['fundamental trustworthiness', 'core commitment at stake', 'essential dependability'] },
    ],
  },
  {
    name: 'Benevolence_Caring',
    definition: 'Devotion to the welfare of ingroup members',
    description: 'Valuing concern for the well-being of close others. Emotional empathy and compassion. Desire to reduce suffering among family or community.',
    higherOrder: 'Self_Transcendence',
    levels: [
      { score: 1, label: 'No caring stake', options: ['close others unaffected', 'no welfare concern'] },
      { score: 2, label: 'Minor caring concern', options: ['slight welfare consideration', 'small comfort to close others'] },
      { score: 3, label: 'Meaningful caring', options: ['significant welfare at stake', 'notable impact on loved ones'] },
      { score: 4, label: 'Deep caring', options: ['major welfare of close others', 'substantial emotional stakes'] },
      { score: 5, label: 'Profound caring', options: ['fundamental welfare of loved ones', 'essential protection of family', 'life-defining caregiving'] },
    ],
  },
  {
    name: 'Universalism_Concern',
    definition: 'Commitment to equality, justice, and protection for all people',
    description: 'Valuing justice, equality, and welfare for all people. Opposition to discrimination and unfair treatment. Moral concern that extends beyond one\'s group.',
    higherOrder: 'Self_Transcendence',
    levels: [
      { score: 1, label: 'No justice stake', options: ['equality not relevant', 'no fairness implications'] },
      { score: 2, label: 'Minor justice concern', options: ['small fairness consideration', 'slight equality issue'] },
      { score: 3, label: 'Notable justice', options: ['significant equality at stake', 'meaningful justice issue'] },
      { score: 4, label: 'Major justice', options: ['substantial fairness implications', 'important rights at stake'] },
      { score: 5, label: 'Fundamental justice', options: ['core human rights at stake', 'essential dignity of all', 'defining equality issue'] },
    ],
  },
  {
    name: 'Universalism_Nature',
    definition: 'Preservation of the natural environment',
    description: 'Valuing protection of the natural environment. Concern for ecosystems, biodiversity, and sustainability. Willingness to limit human activity to preserve nature.',
    higherOrder: 'Self_Transcendence',
    levels: [
      { score: 1, label: 'No environmental stake', options: ['nature unaffected', 'no ecological implications'] },
      { score: 2, label: 'Minor environmental concern', options: ['small ecological consideration', 'slight environmental impact'] },
      { score: 3, label: 'Notable environmental impact', options: ['significant ecosystem affected', 'meaningful environmental stakes'] },
      { score: 4, label: 'Major environmental concern', options: ['substantial ecological damage', 'important habitat at risk'] },
      { score: 5, label: 'Critical environmental stakes', options: ['irreversible ecological damage', 'endangered species affected', 'pristine ecosystem threatened'] },
    ],
  },
  {
    name: 'Universalism_Tolerance',
    definition: 'Acceptance and understanding of those who are different from oneself',
    description: 'Valuing acceptance of difference in beliefs, cultures, and lifestyles. Open-mindedness toward diversity. Resistance to moral or cultural exclusion.',
    higherOrder: 'Self_Transcendence',
    levels: [
      { score: 1, label: 'No tolerance stake', options: ['difference not relevant', 'no diversity implications'] },
      { score: 2, label: 'Minor tolerance consideration', options: ['small acceptance issue', 'slight diversity concern'] },
      { score: 3, label: 'Notable tolerance', options: ['significant acceptance at stake', 'meaningful diversity consideration'] },
      { score: 4, label: 'Major tolerance', options: ['substantial inclusion issue', 'important acceptance of difference'] },
      { score: 5, label: 'Fundamental tolerance', options: ['core acceptance of humanity', 'essential respect for difference', 'defining pluralism issue'] },
    ],
  },
];

/**
 * Higher-order category definitions
 */
export const HIGHER_ORDER_CATEGORIES: Record<HigherOrderCategory, { name: string; description: string; conflictsWith: HigherOrderCategory }> = {
  Openness_to_Change: {
    name: 'Openness to Change',
    description: 'Values emphasizing readiness for new ideas, actions, and experiences',
    conflictsWith: 'Conservation',
  },
  Self_Enhancement: {
    name: 'Self-Enhancement',
    description: 'Values emphasizing pursuit of one\'s own interests and success',
    conflictsWith: 'Self_Transcendence',
  },
  Conservation: {
    name: 'Conservation',
    description: 'Values emphasizing self-restriction, order, and resistance to change',
    conflictsWith: 'Openness_to_Change',
  },
  Self_Transcendence: {
    name: 'Self-Transcendence',
    description: 'Values emphasizing transcending one\'s own interests for others',
    conflictsWith: 'Self_Enhancement',
  },
};

/**
 * Get a canonical dimension by name (case-insensitive)
 */
export function getCanonicalDimension(name: string): CanonicalDimension | undefined {
  return CANONICAL_DIMENSIONS.find(
    (d) => d.name.toLowerCase() === name.toLowerCase()
  );
}

/**
 * Get all canonical dimension names
 */
export function getCanonicalDimensionNames(): string[] {
  return CANONICAL_DIMENSIONS.map((d) => d.name);
}

/**
 * Get all dimensions for a specific higher-order category
 */
export function getDimensionsByHigherOrder(higherOrder: HigherOrderCategory): CanonicalDimension[] {
  return CANONICAL_DIMENSIONS.filter((d) => d.higherOrder === higherOrder);
}

/**
 * Get all higher-order category names
 */
export function getHigherOrderCategories(): HigherOrderCategory[] {
  return Object.keys(HIGHER_ORDER_CATEGORIES) as HigherOrderCategory[];
}
