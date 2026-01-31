
import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';

// Load env from cloud/.env
dotenv.config({ path: path.join(process.cwd(), 'cloud', '.env') });

const prisma = new PrismaClient();

// Manually duplicated from seed.ts to avoid import complexity
const llmProviders = [
    {
        name: 'openai',
        displayName: 'OpenAI',
        maxParallelRequests: 5,
        requestsPerMinute: 60,
        models: [
            { modelId: 'gpt-5-mini', displayName: 'GPT-5 Mini', costInput: 0.25, costOutput: 2.00 },
            { modelId: 'gpt-5.1', displayName: 'GPT-5.1', costInput: 1.25, costOutput: 10.00, isDefault: true },
        ],
    },
    {
        name: 'anthropic',
        displayName: 'Anthropic',
        maxParallelRequests: 3,
        requestsPerMinute: 40,
        models: [
            { modelId: 'claude-haiku-4-5-20251001', displayName: 'Claude Haiku 4.5', costInput: 1.00, costOutput: 5.00 },
            { modelId: 'claude-sonnet-4-5', displayName: 'Claude Sonnet 4.5', costInput: 3.00, costOutput: 15.00, isDefault: true },
        ],
    },
    {
        name: 'google',
        displayName: 'Google',
        maxParallelRequests: 1,
        requestsPerMinute: 10,
        models: [
            { modelId: 'gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', costInput: 1.25, costOutput: 10.00, isDefault: true },
            { modelId: 'gemini-2.5-flash-preview-09-2025', displayName: 'Gemini 2.5 Flash', costInput: 0.30, costOutput: 2.50 },
        ],
    },
    {
        name: 'xai',
        displayName: 'xAI',
        maxParallelRequests: 2,
        requestsPerMinute: 30,
        models: [
            { modelId: 'grok-4-1-fast-reasoning', displayName: 'Grok 4.1 Fast Reasoning', costInput: 0.20, costOutput: 0.50, isDefault: true },
            { modelId: 'grok-4-0709', displayName: 'Grok 4', costInput: 3.00, costOutput: 15.00 },
        ],
    },
    {
        name: 'deepseek',
        displayName: 'DeepSeek',
        maxParallelRequests: 2,
        requestsPerMinute: 30,
        models: [
            { modelId: 'deepseek-chat', displayName: 'DeepSeek Chat', costInput: 0.28, costOutput: 0.42, isDefault: true },
            { modelId: 'deepseek-reasoner', displayName: 'DeepSeek Reasoner', costInput: 0.28, costOutput: 0.42 },
        ],
    },
    {
        name: 'mistral',
        displayName: 'Mistral',
        maxParallelRequests: 2,
        requestsPerMinute: 30,
        models: [
            { modelId: 'mistral-large-2512', displayName: 'Mistral Large (Dec 2025)', costInput: 0.50, costOutput: 1.50, isDefault: true },
            { modelId: 'mistral-small-2503', displayName: 'Mistral Small', costInput: 0.60, costOutput: 2.40 },
        ],
    },
];

async function main() {
    console.log('Syncing models, enforcing strict list, and updating pricing...');

    let createdCount = 0;
    let updatedCount = 0;
    let deactivatedCount = 0;

    for (const providerData of llmProviders) {
        const provider = await prisma.llmProvider.upsert({
            where: { name: providerData.name },
            update: {
                displayName: providerData.displayName,
                maxParallelRequests: providerData.maxParallelRequests,
                requestsPerMinute: providerData.requestsPerMinute,
            },
            create: {
                name: providerData.name,
                displayName: providerData.displayName,
                maxParallelRequests: providerData.maxParallelRequests,
                requestsPerMinute: providerData.requestsPerMinute,
            },
        });

        console.log(`Provider: ${provider.displayName}`);

        // Get valid model IDs for this provider
        const validModelIds = providerData.models.map(m => m.modelId);

        // Deactivate models not in the list (using DEPRECATED status as per your schema)
        const deactivateResult = await prisma.llmModel.updateMany({
            where: {
                providerId: provider.id,
                modelId: { notIn: validModelIds }
            },
            data: { status: 'DEPRECATED' }
        });
        deactivatedCount += deactivateResult.count;

        for (const modelData of providerData.models) {
            const existing = await prisma.llmModel.findFirst({
                where: {
                    providerId: provider.id,
                    modelId: modelData.modelId
                }
            });

            const data = {
                providerId: provider.id,
                modelId: modelData.modelId,
                displayName: modelData.displayName,
                costInputPerMillion: modelData.costInput,
                costOutputPerMillion: modelData.costOutput,
                isDefault: modelData.isDefault ?? false,
                status: 'ACTIVE'
            };

            if (existing) {
                await prisma.llmModel.update({
                    where: { id: existing.id },
                    data
                });
                updatedCount++;
            } else {
                await prisma.llmModel.create({
                    data
                });
                createdCount++;
            }
        }
    }

    console.log(`Sync complete. Created ${createdCount}, Updated ${updatedCount}, Deactivated ${deactivatedCount}.`);
}

main()
    .catch((e) => {
        console.error('Sync failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
