import type { DefinitionComponents, ScenarioContent } from '@valuerank/db';
import { assembleTemplate } from '@valuerank/shared';

type LevelPresetVersion = {
  l1: string;
  l2: string;
  l3: string;
  l4: string;
  l5: string;
} | null;

export function stripLevelToken(prompt: string): string {
  return prompt.replace(/\[level\]\s*/g, '');
}

export function buildJobChoiceScenarios(params: {
  definitionId: string;
  contextText: string;
  components: DefinitionComponents;
  levelPresetVersion: LevelPresetVersion;
}): Array<{
  definitionId: string;
  name: string;
  content: ScenarioContent;
}> {
  const { definitionId, contextText, components, levelPresetVersion } = params;

  if (levelPresetVersion == null) {
    return [
      {
        definitionId,
        name: 'Default Scenario',
        content: {
          schema_version: 1,
          prompt: stripLevelToken(assembleTemplate(contextText, components)),
          dimension_values: {},
        },
      },
    ];
  }

  const words = [
    levelPresetVersion.l1,
    levelPresetVersion.l2,
    levelPresetVersion.l3,
    levelPresetVersion.l4,
    levelPresetVersion.l5,
  ];

  const valueFirstToken = components.value_first.token;
  const valueSecondToken = components.value_second.token;

  return words.flatMap((firstWord) =>
    words.map((secondWord) => ({
      definitionId,
      name: `${firstWord} / ${secondWord}`,
      content: {
        schema_version: 1,
        prompt: assembleTemplate(contextText, components, {
          first: firstWord,
          second: secondWord,
        }),
        dimension_values: {
          [valueFirstToken]: firstWord,
          [valueSecondToken]: secondWord,
        },
      } satisfies ScenarioContent,
    })),
  );
}
