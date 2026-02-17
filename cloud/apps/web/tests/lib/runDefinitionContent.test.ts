import { describe, expect, it } from 'vitest';
import { getRunDefinitionContent } from '../../src/utils/runDefinitionContent';

describe('getRunDefinitionContent', () => {
  it('prefers definitionSnapshot on run object', () => {
    const snapshot = { dimensions: [{ name: 'A' }, { name: 'B' }] };
    const content = { dimensions: [{ name: 'X' }, { name: 'Y' }] };

    const resolved = getRunDefinitionContent({
      definitionSnapshot: snapshot,
      definition: { content },
    });

    expect(resolved).toEqual(snapshot);
  });

  it('falls back to config.definitionSnapshot when direct snapshot is absent', () => {
    const snapshot = { dimensions: [{ name: 'A' }, { name: 'B' }] };

    const resolved = getRunDefinitionContent({
      config: { definitionSnapshot: snapshot },
      definition: { content: { dimensions: [{ name: 'X' }, { name: 'Y' }] } },
    });

    expect(resolved).toEqual(snapshot);
  });

  it('falls back to definition.content when no snapshot exists', () => {
    const content = { dimensions: [{ name: 'X' }, { name: 'Y' }] };
    const resolved = getRunDefinitionContent({ definition: { content } });
    expect(resolved).toEqual(content);
  });
});
