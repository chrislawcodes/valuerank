import type { DefinitionContent } from '@valuerank/db';

export type PressureSensitivityDecisionSnapshot = Pick<
  DefinitionContent,
  'components' | 'dimensions' | 'template'
>;

/**
 * Build the smallest definition snapshot needed by the decision resolver.
 *
 * The pressure-sensitivity resolver intentionally avoids joining every
 * transcript to its stored definitionSnapshot because that payload is huge.
 * But the resolver still needs these resolved Definition fields to recover
 * the value pair, value labels, and any label prefix.
 */
export function buildPressureSensitivityDecisionSnapshot(
  content: DefinitionContent,
): PressureSensitivityDecisionSnapshot | null {
  if (content.components == null) {
    return null;
  }

  return {
    template: content.template,
    dimensions: content.dimensions,
    components: {
      value_first: {
        token: content.components.value_first.token,
        body: content.components.value_first.body,
      },
      value_second: {
        token: content.components.value_second.token,
        body: content.components.value_second.body,
      },
      context_id: content.components.context_id,
    },
  };
}
