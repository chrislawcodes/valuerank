
import { db } from '@valuerank/db';

async function main() {
    const analysis = await db.analysisResult.findFirst({
        where: {
            analysisType: 'AGGREGATE',
            run: {
                tags: { some: { tag: { name: 'Aggregate' } } }
            }
        },
        orderBy: { createdAt: 'desc' }
    });

    if (!analysis) {
        console.log('No aggregate analysis found');
        return;
    }

    const output = analysis.output as any;
    const vizData = output.visualizationData;
    console.log('Scenario Dimensions:', JSON.stringify(vizData?.scenarioDimensions, null, 2));
}

main().catch(console.error).finally(() => db.$disconnect());
