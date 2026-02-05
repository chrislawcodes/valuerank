
import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('cli:debug-scenario-structure');

async function main() {
    const scenario = await db.scenario.findFirst({
        where: { deletedAt: null },
        select: { content: true }
    });

    if (!scenario) {
        log.info('No scenarios found');
        return;
    }

    log.info({ content: scenario.content }, 'Scenario content');
}

void main()
    .catch((err) => {
        log.error({ err }, 'Failed to debug scenario structure');
    })
    .finally(() => {
        void db.$disconnect();
    });
