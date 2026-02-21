
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { db } from '@valuerank/db';
import { planFinalTrial } from '../../../src/services/run/plan-final-trial.js';
import { TEST_USER } from '../../test-utils.js';

// Mock aggregate analysis update to do nothing, as we inject data manually
vi.mock('../../../src/services/analysis/aggregate.js', () => ({
    updateAggregateRun: vi.fn(),
}));

describe('planFinalTrial service', () => {
    const createdDefinitionIds: string[] = [];
    const createdRunIds: string[] = [];

    // Clean up after tests
    afterEach(async () => {
        if (createdRunIds.length > 0) {
            await db.runScenarioSelection.deleteMany({ where: { runId: { in: createdRunIds } } });
            await db.analysisResult.deleteMany({ where: { runId: { in: createdRunIds } } });
            await db.run.deleteMany({ where: { id: { in: createdRunIds } } });
            createdRunIds.length = 0;
        }
        if (createdDefinitionIds.length > 0) {
            await db.scenario.deleteMany({ where: { definitionId: { in: createdDefinitionIds } } });
            await db.definition.deleteMany({ where: { id: { in: createdDefinitionIds } } });
            createdDefinitionIds.length = 0;
        }
    });

    it('preserves requested model ID when alias is used for analysis lookup', async () => {
        // 1. Create Definition
        const definition = await db.definition.create({
            data: {
                name: 'Alias Plan Test',
                content: { schema_version: 1, preamble: 'Test' },
            },
        });
        createdDefinitionIds.push(definition.id);

        // 2. Create Scenario
        const scenario = await db.scenario.create({
            data: {
                definitionId: definition.id,
                name: 'Scenario 1',
                content: { dimensions: { d: 1 } },
            },
        });

        // 3. Create Aggregate Run
        const aggRun = await db.run.create({
            data: {
                definitionId: definition.id,
                name: 'Aggregate Run',
                status: 'COMPLETED',
                config: {
                    definitionSnapshot: {
                        preambleVersionId: definition.preambleVersionId,
                        version: definition.version,
                    },
                    temperature: null,
                },
                progress: { total: 0, completed: 0, failed: 0 },
            },
        });
        createdRunIds.push(aggRun.id);

        // Tag as Aggregate
        const tag = await db.tag.upsert({
            where: { name: 'Aggregate' },
            create: { name: 'Aggregate' },
            update: {},
        });

        await db.runTag.create({
            data: {
                runId: aggRun.id,
                tagId: tag.id,
            },
        });

        // 4. Inject Analysis Result with ALIAS model ID
        const canonicalModelId = 'gemini-2.5-flash-preview-09-2025';
        const requestedModelId = 'gemini-2.5-flash';

        const mockAnalysis = {
            visualizationData: {
                modelScenarioMatrix: {
                    [canonicalModelId]: {
                        [scenario.id]: 0.95
                    }
                }
            }
        };

        await db.analysisResult.create({
            data: {
                runId: aggRun.id,
                analysisType: 'aggregate',
                inputHash: 'test-hash',
                codeVersion: '1.0.0',
                status: 'CURRENT',
                output: mockAnalysis,
            },
        });

        // 5. Call planFinalTrial with REQUESTED model ID
        const plan = await planFinalTrial(definition.id, [requestedModelId]);

        // 6. Verify correct model ID is returned
        expect(plan.models).toHaveLength(1);
        const modelPlan = plan.models[0];

        expect(modelPlan.modelId).toBe(requestedModelId); // Should NOT be canonicalModelId

        // Check that it actually found data (meaning alias resolution worked for lookup)
        expect(modelPlan.conditions).toHaveLength(1);
        // If it found the data (0.95), n=1. 
        // n < 10 -> INSUFFICIENT_DATA. 
        // If it didn't find data, n=0 -> INSUFFICIENT_DATA.
        // To be sure lets check currentSamples.
        // Since we provided a matrix score, it should see n=1.
        expect(modelPlan.conditions[0].currentSamples).toBe(1);
    });
});
