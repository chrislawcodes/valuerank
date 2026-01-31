
import { PrismaClient } from '@prisma/client';
import path from 'path';
import dotenv from 'dotenv';

// Load env from cloud/.env
dotenv.config({ path: path.join(process.cwd(), 'cloud', '.env') });

const prisma = new PrismaClient();

async function main() {
    console.log('Checking most recent run...');
    const lastRun = await prisma.run.findFirst({
        orderBy: { createdAt: 'desc' },
        include: {
            probeResults: {
                where: { status: 'FAILED' }
            }
        }
    });

    if (!lastRun) {
        console.log('No runs found.');
        return;
    }

    console.log(`Run ID: ${lastRun.id}`);
    console.log(`Created At: ${lastRun.createdAt}`);
    console.log(`Status: ${lastRun.status}`);

    if (lastRun.probeResults.length === 0) {
        console.log('No failed probes found in the last run.');
        // Check if there are any probes at all
        const allProbeCount = await prisma.probeResult.count({
            where: { runId: lastRun.id }
        });
        console.log(`Total probes in run: ${allProbeCount}`);
    } else {
        console.log('Failed Probes:');
        for (const p of lastRun.probeResults) {
            const model = await prisma.llmModel.findFirst({
                where: { modelId: p.modelId }
            });

            console.log(`- Model ID: ${p.modelId}`);
            console.log(`  Name: ${model ? model.displayName : 'Unknown Model'}`);
            console.log(`  Current DB Status: ${model ? model.status : 'NOT IN DB'}`);
            console.log(`  Error: ${p.errorMessage || 'No error message'}`);
        }
    }

    // Check for unwanted ACTIVE models
    console.log('\nChecking for ACTIVE models not in strict user list...');
    const strictList = [
        'gpt-5.1', 'gpt-5-mini', // Verified user list + recent swap
        'claude-4-5-haiku', 'claude-sonnet-4-5',
        'gemini-2.5-pro', 'gemini-2.5-flash-preview-09-2025',
        'grok-4-1-fast-reasoning', 'grok-4-0709',
        'deepseek-chat', 'deepseek-reasoner',
        'mistral-large-2512', 'mistral-small-2503'
    ];

    const activeModels = await prisma.llmModel.findMany({
        where: { status: 'ACTIVE' },
        select: { modelId: true, provider: { select: { name: true } } }
    });

    const unwanted = activeModels.filter(m => !strictList.includes(m.modelId));

    if (unwanted.length > 0) {
        console.log('ALERT: The following unwanted models are still ACTIVE:');
        unwanted.forEach(m => console.log(`${m.provider.name}:${m.modelId}`));
    } else {
        console.log('✓ No unwanted models are currently ACTIVE.');
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
