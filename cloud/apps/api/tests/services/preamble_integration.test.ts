
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { db } from '@valuerank/db';
import { startRun } from '../../src/services/run/start';
import { createPreamble } from '../../src/services/preamble';

// Mock dependencies
vi.mock('../../src/queue/boss', () => ({
    getBoss: vi.fn().mockReturnValue({
        send: vi.fn().mockResolvedValue('mock-job-id'),
    }),
}));

vi.mock('../../src/services/parallelism', () => ({
    getQueueNameForModel: vi.fn().mockResolvedValue('probe-queue'),
}));

vi.mock('../../src/services/cost', () => ({
    estimateCost: vi.fn().mockResolvedValue({ total: 0.01, isUsingFallback: false }),
}));

// Mock signalRunActivity
vi.mock('../../src/services/run/scheduler', () => ({
    signalRunActivity: vi.fn(),
}));

describe('Preamble Integration', () => {
    const userId = 'preamble-test-user-id';
    const createdIds = {
        runIds: [] as string[],
        scenarioIds: [] as string[],
        definitionIds: [] as string[],
        preambleVersionIds: [] as string[],
        preambleIds: [] as string[],
    };

    beforeEach(async () => {
        // Ensure provider
        const provider = await db.llmProvider.upsert({
            where: { name: 'openai' },
            create: { name: 'openai', displayName: 'OpenAI' },
            update: {},
        });

        // Ensure active model
        await db.llmModel.upsert({
            where: {
                providerId_modelId: {
                    providerId: provider.id,
                    modelId: 'gpt-4',
                }
            },
            create: {
                providerId: provider.id,
                modelId: 'gpt-4',
                displayName: 'GPT-4',
                status: 'ACTIVE',
                costInputPerMillion: 30,
                costOutputPerMillion: 60,
            },
            update: { status: 'ACTIVE' },
        });

        // Ensure User
        await db.user.upsert({
            where: { id: userId },
            create: { id: userId, email: 'preamble-test@example.com', passwordHash: 'hash' },
            update: {},
        });
    });

    afterEach(async () => {
        if (createdIds.runIds.length > 0) {
            await db.runScenarioSelection.deleteMany({
                where: { runId: { in: createdIds.runIds } },
            });
            await db.run.deleteMany({
                where: { id: { in: createdIds.runIds } },
            });
            createdIds.runIds = [];
        }

        if (createdIds.scenarioIds.length > 0) {
            await db.scenario.deleteMany({
                where: { id: { in: createdIds.scenarioIds } },
            });
            createdIds.scenarioIds = [];
        }

        if (createdIds.definitionIds.length > 0) {
            await db.definition.deleteMany({
                where: { id: { in: createdIds.definitionIds } },
            });
            createdIds.definitionIds = [];
        }

        if (createdIds.preambleVersionIds.length > 0) {
            await db.preambleVersion.deleteMany({
                where: { id: { in: createdIds.preambleVersionIds } },
            });
            createdIds.preambleVersionIds = [];
        }

        if (createdIds.preambleIds.length > 0) {
            await db.preamble.deleteMany({
                where: { id: { in: createdIds.preambleIds } },
            });
            createdIds.preambleIds = [];
        }

        await db.user.deleteMany({ where: { id: userId } });
    });

    it('injects preamble content into run snapshot', async () => {
        const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        // 1. Create Preamble
        // Note: createPreamble signature is (name, content) based on error, assuming no userId param for now?
        // Wait, trace didn't show userId in signature.
        const preamble = await createPreamble(
            `Integration Test Preamble ${uniqueSuffix}`,
            'You are a helpful assistant serving the public interest.'
        );
        createdIds.preambleIds.push(preamble.id);

        const preambleVersion = preamble.latestVersion;
        expect(preambleVersion).toBeDefined();
        createdIds.preambleVersionIds.push(preambleVersion!.id);

        // 2. Create Definition linked to Preamble
        const content = {
            schema_version: 1,
            template: 'Scenario template...',
            dimensions: [],
        };

        // Direct DB create or use service if available. 
        // Using service might be better to test service logic, but let's use Prisma for setup to be sure.
        // Actually, createDefinition service creates the definition.
        // But type signature might be tricky with recent changes.
        // Let's use DB directly for setup fidelity.

        // Using Prisma to create definition with preambleVersionId
        const definition = await db.definition.create({
            data: {
                name: `Test Definition with Preamble ${uniqueSuffix}`,
                content,
                preambleVersionId: preambleVersion!.id,
                createdByUserId: userId,
            },
        });
        createdIds.definitionIds.push(definition.id);

        // 3. Create Scenarios (required for run)
        const scenario = await db.scenario.create({
            data: {
                definitionId: definition.id,
                name: `Test Scenario 1 ${uniqueSuffix}`,
                content: {
                    text: 'Scenario text',
                    values: {},
                },
            },
        });
        createdIds.scenarioIds.push(scenario.id);

        // 4. Start Run
        const result = await startRun({
            definitionId: definition.id,
            models: ['gpt-4'],
            userId,
        });
        createdIds.runIds.push(result.run.id);

        // 5. Verify Run Config
        const run = await db.run.findUnique({
            where: { id: result.run.id },
        });

        expect(run).toBeDefined();

        const config = run!.config as any;
        const snapshot = config.definitionSnapshot;

        // The Snapshot should have the Preamble Content injected
        expect(snapshot.preamble).toBe(preambleVersion!.content);

        // Metadata verification
        expect(snapshot._meta).toBeDefined();
        expect(snapshot._meta.preambleVersionId).toBe(preambleVersion!.id);
        expect(snapshot._meta.definitionVersion).toBe(1);
    });
});
