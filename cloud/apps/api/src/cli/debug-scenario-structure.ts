
import { db } from '@valuerank/db';

async function main() {
    const scenario = await db.scenario.findFirst({
        where: { deletedAt: null },
        select: { content: true }
    });

    if (!scenario) {
        console.log('No scenarios found');
        return;
    }

    console.log(JSON.stringify(scenario.content, null, 2));
}

main().catch(console.error).finally(() => db.$disconnect());
