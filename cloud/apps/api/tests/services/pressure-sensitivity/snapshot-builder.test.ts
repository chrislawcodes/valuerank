import { afterEach, describe, expect, it, vi } from 'vitest';
import { db } from '@valuerank/db';
import { AppError } from '@valuerank/shared';
import type { DefinitionContent } from '@valuerank/db';

vi.mock('@valuerank/shared', async () => {
  const actual = await vi.importActual<typeof import('@valuerank/shared')>('@valuerank/shared');
  return {
    ...actual,
    createLogger: vi.fn(() => ({
      warn: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    })),
  };
});

import { expandToCompanionDefinition } from '../../../src/services/pressure-sensitivity/snapshot-builder.js';

const createdDefinitionIds: string[] = [];
const createdDomainIds: string[] = [];

function buildPairedContent(params: {
  pairKey?: string;
  firstToken: string;
  secondToken: string;
  presentationOrder: 'A_first' | 'B_first';
}): DefinitionContent {
  return {
    schema_version: 1,
    template: 'A professional has to choose between two jobs.',
    methodology: {
      family: 'job-choice',
      presentation_order: params.presentationOrder,
      ...(params.pairKey != null ? { pair_key: params.pairKey } : {}),
    },
    components: {
      value_first: {
        token: params.firstToken,
        body: `${params.firstToken} body`,
      },
      value_second: {
        token: params.secondToken,
        body: `${params.secondToken} body`,
      },
    },
    dimensions: [
      {
        name: params.firstToken,
        levels: [
          { score: 1, label: 'Low' },
          { score: 2, label: 'High' },
          { score: 3, label: 'Mid' },
          { score: 4, label: 'Very High' },
          { score: 5, label: 'Extreme' },
        ],
      },
      {
        name: params.secondToken,
        levels: [
          { score: 1, label: 'Low' },
          { score: 2, label: 'High' },
          { score: 3, label: 'Mid' },
          { score: 4, label: 'Very High' },
          { score: 5, label: 'Extreme' },
        ],
      },
    ],
  };
}

async function createDomain(name: string): Promise<{ id: string }> {
  const domain = await db.domain.create({
    data: {
      name,
      normalizedName: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    },
  });
  createdDomainIds.push(domain.id);
  return domain;
}

async function createDefinition(params: {
  domainId: string;
  name: string;
  firstToken: string;
  secondToken: string;
  presentationOrder: 'A_first' | 'B_first';
  pairKey?: string;
}): Promise<{ id: string }> {
  const definition = await db.definition.create({
    data: {
      name: params.name,
      domainId: params.domainId,
      version: 1,
      content: buildPairedContent({
        pairKey: params.pairKey,
        firstToken: params.firstToken,
        secondToken: params.secondToken,
        presentationOrder: params.presentationOrder,
      }),
    },
  });
  createdDefinitionIds.push(definition.id);
  return definition;
}

afterEach(async () => {
  if (createdDefinitionIds.length > 0) {
    await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
    createdDefinitionIds.length = 0;
  }

  if (createdDomainIds.length > 0) {
    await db.domain.deleteMany({ where: { id: { in: createdDomainIds } } });
    createdDomainIds.length = 0;
  }
});

describe('expandToCompanionDefinition', () => {
  it('returns the paired ids when exactly one companion exists', async () => {
    const domain = await createDomain('snapshot-builder-paired');
    const input = await createDefinition({
      domainId: domain.id,
      name: 'Achievement -> Benevolence',
      firstToken: 'Achievement',
      secondToken: 'Benevolence_Dependability',
      presentationOrder: 'A_first',
      pairKey: 'pair-a',
    });
    const companion = await createDefinition({
      domainId: domain.id,
      name: 'Benevolence -> Achievement',
      firstToken: 'Benevolence_Dependability',
      secondToken: 'Achievement',
      presentationOrder: 'B_first',
      pairKey: 'pair-a',
    });

    await expect(expandToCompanionDefinition(input.id)).resolves.toEqual({
      ids: [input.id, companion.id],
      status: 'paired',
    });
  });

  it('throws a collision error when more than one companion matches the same pair_key', async () => {
    const domain = await createDomain('snapshot-builder-collision');
    const input = await createDefinition({
      domainId: domain.id,
      name: 'Care -> Freedom',
      firstToken: 'Care',
      secondToken: 'Freedom',
      presentationOrder: 'A_first',
      pairKey: 'pair-collision',
    });
    await createDefinition({
      domainId: domain.id,
      name: 'Freedom -> Care',
      firstToken: 'Freedom',
      secondToken: 'Care',
      presentationOrder: 'B_first',
      pairKey: 'pair-collision',
    });
    await createDefinition({
      domainId: domain.id,
      name: 'Freedom -> Care v2',
      firstToken: 'Freedom',
      secondToken: 'Care',
      presentationOrder: 'B_first',
      pairKey: 'pair-collision',
    });

    await expect(expandToCompanionDefinition(input.id)).rejects.toMatchObject({
      code: 'pair_key_companion_collision',
    });
  });

  it('returns companion_missing when no other definition shares the pair_key', async () => {
    const domain = await createDomain('snapshot-builder-missing');
    const input = await createDefinition({
      domainId: domain.id,
      name: 'Achievement -> Benevolence',
      firstToken: 'Achievement',
      secondToken: 'Benevolence_Dependability',
      presentationOrder: 'A_first',
      pairKey: 'pair-missing',
    });

    await expect(expandToCompanionDefinition(input.id)).resolves.toEqual({
      ids: [input.id],
      status: 'companion_missing',
    });
  });

  it('returns not_paired when methodology.pair_key is absent', async () => {
    const domain = await createDomain('snapshot-builder-not-paired');
    const input = await createDefinition({
      domainId: domain.id,
      name: 'Unpaired Definition',
      firstToken: 'Achievement',
      secondToken: 'Benevolence_Dependability',
      presentationOrder: 'A_first',
    });

    await expect(expandToCompanionDefinition(input.id)).resolves.toEqual({
      ids: [input.id],
      status: 'not_paired',
    });
  });

  it('does not cross domain boundaries when matching companions', async () => {
    const domainA = await createDomain('snapshot-builder-cross-a');
    const domainB = await createDomain('snapshot-builder-cross-b');
    const input = await createDefinition({
      domainId: domainA.id,
      name: 'Achievement -> Benevolence',
      firstToken: 'Achievement',
      secondToken: 'Benevolence_Dependability',
      presentationOrder: 'A_first',
      pairKey: 'pair-cross',
    });
    await createDefinition({
      domainId: domainB.id,
      name: 'Benevolence -> Achievement',
      firstToken: 'Benevolence_Dependability',
      secondToken: 'Achievement',
      presentationOrder: 'B_first',
      pairKey: 'pair-cross',
    });

    await expect(expandToCompanionDefinition(input.id)).resolves.toEqual({
      ids: [input.id],
      status: 'companion_missing',
    });
  });

  it('throws a mirror failure when the only candidate is not a mirrored pair', async () => {
    const domain = await createDomain('snapshot-builder-mirror-failure');
    const input = await createDefinition({
      domainId: domain.id,
      name: 'Achievement -> Benevolence',
      firstToken: 'Achievement',
      secondToken: 'Benevolence_Dependability',
      presentationOrder: 'A_first',
      pairKey: 'pair-mirror-failure',
    });
    await createDefinition({
      domainId: domain.id,
      name: 'Care -> Freedom',
      firstToken: 'Care',
      secondToken: 'Freedom',
      presentationOrder: 'A_first',
      pairKey: 'pair-mirror-failure',
    });

    await expect(expandToCompanionDefinition(input.id)).rejects.toMatchObject({
      code: 'pair_key_companion_mirror_failure',
    });
  });
});
