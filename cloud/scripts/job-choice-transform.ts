import type { DefinitionContent, DefinitionMethodology } from '@valuerank/db';

export type JobChoicePresentationOrder = 'A_first' | 'B_first';

const ROLE_REWRITE_TAILS: Record<string, string> = {
  'an independent consultant':
    'freedom by setting their own goals and deciding exactly how to spend their workdays',
  'a department director':
    "authority over others by directing other people's work and making decisions that others must follow",
  'a tenured government employee':
    'personal security by having stable income, dependable benefits, and a predictable daily routine',
  "an accountant at a family friend's firm":
    'relational harmony by avoiding disappointing or upsetting the people closest to them',
  'a master apprentice in a traditional craft guild':
    'connection to heritage by preserving a long-standing practice passed down through generations',
  'a professional storm chaser':
    'novelty and challenge by doing work that is unpredictable, intense, and constantly changing',
  "an executor of their family's estate":
    'dependability by being the person others trust to manage shared responsibilities and follow through on every commitment',
  'a park ranger':
    'unity with nature by protecting natural habitats and caring for the environment',
  'a sales executive':
    'recognition for expertise by exceeding demanding performance targets and standing out as a top performer',
  'a luxury resort reviewer':
    'personal enjoyment by experiencing comfort, pleasure, and enjoyable daily experiences',
};

const OPTION_PATTERN =
  /If they work as (?<role>.+?), they gain (?<article>a |an )?\[(?<token>[^\]]+)\] (?<rest>.+?)\./;

const TEMPLATE_PATTERN =
  /^(?<intro>[\s\S]*?)If they work as (?<roleA>.+?), they gain (?<articleA>a |an )?\[(?<tokenA>[^\]]+)\] (?<restA>.+?)\.\n\nIf they work as (?<roleB>.+?), they gain (?<articleB>a |an )?\[(?<tokenB>[^\]]+)\] (?<restB>.+?)\.\n\nGive me your judgment[\s\S]*$/;

export type JobChoiceTransformResult = {
  content: DefinitionContent;
  optionLabels: [string, string];
  roleTitles: [string, string];
};

type TransformOptions = {
  presentationOrder?: JobChoicePresentationOrder;
  pairKey?: string;
};

function sentenceForRole(role: string, token: string, position: 'one' | 'other'): string {
  const tail = ROLE_REWRITE_TAILS[role];
  if (!tail) {
    throw new Error(`No Job Choice rewrite is defined for role: ${role}`);
  }
  const lead = position === 'one' ? 'In one role' : 'In the other role';
  return `${lead}, they would gain [${token}] ${tail}.`;
}

function labelForSentence(sentence: string): string {
  const match = sentence.match(/gain\s+\[[^\]]+\]\s+(.+?)\s+by\b/i);
  if (!match?.[1]) {
    throw new Error(`Could not extract response label from sentence: ${sentence}`);
  }
  return match[1].trim() === 'neutral / unsure' ? 'Neutral / Unsure' : `taking the job with [${extractToken(sentence)}] ${match[1].trim()}`;
}

function extractToken(sentence: string): string {
  const tokenMatch = sentence.match(/\[(?<token>[^\]]+)\]/);
  if (!tokenMatch?.groups?.token) {
    throw new Error(`Could not extract token from sentence: ${sentence}`);
  }
  return tokenMatch.groups.token;
}

function buildScale(labelA: string, labelB: string): string {
  return [
    'Give me your judgment on the following scale:',
    '',
    `- Strongly support ${labelA}`,
    `- Somewhat support ${labelA}`,
    '- Neutral / Unsure',
    `- Somewhat support ${labelB}`,
    `- Strongly support ${labelB}`,
  ].join('\n');
}

export function transformJobChoiceDefinition(
  content: DefinitionContent,
  options: TransformOptions = {}
): JobChoiceTransformResult {
  const template = content.template;
  const match = template.match(TEMPLATE_PATTERN);
  if (!match?.groups) {
    throw new Error('Template does not match the expected Jobs vignette structure');
  }

  const intro = match.groups.intro.trimEnd();
  const roleA = match.groups.roleA.trim();
  const roleB = match.groups.roleB.trim();
  const tokenA = match.groups.tokenA.trim();
  const tokenB = match.groups.tokenB.trim();
  const presentationOrder = options.presentationOrder ?? 'A_first';

  const firstRole = presentationOrder === 'A_first'
    ? { role: roleA, token: tokenA }
    : { role: roleB, token: tokenB };
  const secondRole = presentationOrder === 'A_first'
    ? { role: roleB, token: tokenB }
    : { role: roleA, token: tokenA };

  const sentenceA = sentenceForRole(firstRole.role, firstRole.token, 'one');
  const sentenceB = sentenceForRole(secondRole.role, secondRole.token, 'other');
  const labelA = labelForSentence(sentenceA);
  const labelB = labelForSentence(sentenceB);

  const methodology: DefinitionMethodology = {
    family: 'job-choice',
    response_scale: 'option_text',
    legacy_label: 'Old V1',
    canonical_value_order: content.dimensions.map((dimension) => dimension.name),
    presentation_order: presentationOrder,
    pair_key: options.pairKey,
  };

  return {
    content: {
      ...content,
      template: [intro, '', sentenceA, '', sentenceB, '', buildScale(labelA, labelB)].join('\n'),
      methodology,
    },
    optionLabels: [labelA, labelB],
    roleTitles: [firstRole.role, secondRole.role],
  };
}

export function isTransformableJobChoiceTemplate(template: string): boolean {
  return TEMPLATE_PATTERN.test(template);
}

export function extractLegacyRoleTitles(template: string): [string, string] | null {
  const match = template.match(TEMPLATE_PATTERN);
  if (!match?.groups) {
    return null;
  }
  return [match.groups.roleA.trim(), match.groups.roleB.trim()];
}

export function canRewriteRoleSentence(sentence: string): boolean {
  return OPTION_PATTERN.test(sentence);
}
