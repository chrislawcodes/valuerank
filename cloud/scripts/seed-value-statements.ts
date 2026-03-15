import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';

const log = createLogger('scripts:seed-value-statements');

// Bodies include [level] token for level-set preset substitution at scenario expansion time.
// The [level] word is replaced per-condition (e.g. "moderate", "substantial") when creating
// job-choice pairs with a level preset.
const VALUE_STATEMENTS = [
  { token: 'self_direction_action', body: '[level] freedom in how they work because of how it relates to independent choice in goals and actions' },
  { token: 'power_dominance', body: '[level] authority over others because of how it relates to control over people and the decisions that affect them' },
  { token: 'security_personal', body: '[level] personal security in everyday life because of how it relates to financial and physical stability, safety, and predictability' },
  { token: 'conformity_interpersonal', body: '[level] harmony in their close relationships because of how it relates to maintaining smooth interactions with family, friends, and neighbors' },
  { token: 'tradition', body: '[level] connection to their heritage because of how it relates to long-standing customs and inherited ways of doing things' },
  { token: 'stimulation', body: '[level] variety and excitement in their daily work because of how it relates to change, challenge, and unpredictability' },
  { token: 'benevolence_dependability', body: '[level] trust from other people because of how it relates to being someone others can rely on to carry through on shared responsibilities' },
  { token: 'universalism_nature', body: '[level] connection to the natural world because of how it relates to care for nature and the environment' },
  { token: 'achievement', body: '[level] recognition of their expertise because of how it relates to success through strong performance' },
  { token: 'hedonism', body: '[level] enjoyment in their daily experience because of how it relates to pleasure and comfort in everyday work' },
];

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
  for (const vs of VALUE_STATEMENTS) {
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
