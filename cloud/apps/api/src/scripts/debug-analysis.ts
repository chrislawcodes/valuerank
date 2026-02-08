
import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

const RUN_ID = 'cmlcuk9ey000i12upc6p6sa18';
const MODEL_ID = 'deepseek-chat';

async function main() {
    const analysis = await db.analysisResult.findFirst({
        where: { runId: RUN_ID, status: 'CURRENT' },
    });

    if (!analysis) {
        console.log('No CURRENT analysis found');
        return;
    }

    const output = analysis.output as any;
    const varianceAnalysis = output.varianceAnalysis;

    if (!varianceAnalysis) {
        console.log('Variance Analysis MISSING');
        return;
    }

    const modelStats = varianceAnalysis.perModel?.[MODEL_ID];
    if (!modelStats) {
        console.log(`No variance stats for model ${MODEL_ID}`);
        console.log('Available models:', Object.keys(varianceAnalysis.perModel));
        return;
    }

    console.log(`Stats for ${MODEL_ID}:`);
    console.log('  samplesPerScenario:', modelStats.samplesPerScenario);
    console.log('  totalSamples:', modelStats.totalSamples);
    console.log('  uniqueScenarios:', modelStats.uniqueScenarios);

    if (modelStats.perScenario) {
        const scenarioKeys = Object.keys(modelStats.perScenario);
        console.log(`  perScenario keys (count: ${scenarioKeys.length}):`);
        console.log('  First 5 keys:', scenarioKeys.slice(0, 5));

        // Check sample counts for first few
        scenarioKeys.slice(0, 5).forEach(key => {
            const s = modelStats.perScenario[key];
            console.log(`    Scenario ${key}: sampleCount=${s.sampleCount}, stdDev=${s.stdDev}`);
        });
    } else {
        console.log('  perScenario is MISSING');
    }
}

main()
    .catch(console.error)
    .finally(() => db.$disconnect());
