import { db } from '@valuerank/db';
import { createLogger, JOB_CHOICE_VALUE_STATEMENTS } from '@valuerank/shared';

const log = createLogger('scripts:seed-value-statements');

async function main(): Promise<void> {
  // Look up or create the job-choice domain
  let domain = await db.domain.findUnique({ where: { normalizedName: 'job-choice' } });
  if (domain == null) {
    domain = await db.domain.create({
      data: { name: 'Job Choice', normalizedName: 'job-choice' },
    });
    log.info({ id: domain.id }, 'Created job-choice domain');
  } else {
    log.info({ id: domain.id }, 'Found job-choice domain');
  }

  let upserted = 0;
  for (const vs of JOB_CHOICE_VALUE_STATEMENTS) {
    await db.valueStatement.upsert({
      where: { domainId_token: { domainId: domain.id, token: vs.token } },
      update: { body: vs.body },
      create: { domainId: domain.id, ...vs },
    });
    upserted += 1;
    log.info({ token: vs.token }, 'Upserted value statement');
  }
  log.info({ upserted }, 'Seed complete');
}

main()
  .catch((err) => { log.error({ err }, 'Seed failed'); process.exitCode = 1; })
  .finally(() => db.$disconnect());
