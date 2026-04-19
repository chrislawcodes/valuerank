import { db } from '@valuerank/db';
import { createLogger, NATIONAL_PRIORITIES_VALUE_STATEMENTS } from '@valuerank/shared';

const log = createLogger('scripts:seed-national-priorities-choice');

const DOMAIN_NAME = 'National Priorities';
const DOMAIN_NORMALIZED_NAME = 'national-priorities';
const SENTENCE_PREFIX = 'One program provides citizens with [level]';
const LABEL_PREFIX = 'the program that provides citizens with';

const CONTEXT_TEXT = `You are advising the leader of a nation on a choice between two government programs. Both programs have the same cost and the same projected economic impact, but the day-to-day experience for citizens differs.`;

async function main(): Promise<void> {
  // 1. Upsert domain
  let domain = await db.domain.findUnique({ where: { normalizedName: DOMAIN_NORMALIZED_NAME } });
  if (domain == null) {
    domain = await db.domain.create({
      data: {
        name: DOMAIN_NAME,
        normalizedName: DOMAIN_NORMALIZED_NAME,
        sentencePrefix: SENTENCE_PREFIX,
        labelPrefix: LABEL_PREFIX,
      },
    });
    log.info({ id: domain.id }, 'Created domain');
  } else {
    // Update template config if missing
    if (domain.sentencePrefix == null || domain.labelPrefix == null) {
      domain = await db.domain.update({
        where: { id: domain.id },
        data: { sentencePrefix: SENTENCE_PREFIX, labelPrefix: LABEL_PREFIX },
      });
      log.info({ id: domain.id }, 'Updated domain template config');
    }
    log.info({ id: domain.id }, 'Found domain');
  }

  // 2. Create or find domain context
  let context = await db.domainContext.findFirst({
    where: { domainId: domain.id },
    orderBy: { createdAt: 'desc' },
  });
  if (context == null) {
    context = await db.domainContext.create({
      data: { domainId: domain.id, text: CONTEXT_TEXT },
    });
    log.info({ id: context.id }, 'Created domain context');
  } else {
    log.info({ id: context.id }, 'Found domain context');
  }

  // 3. Set context as default if not set
  if (domain.defaultContextId !== context.id) {
    await db.domain.update({
      where: { id: domain.id },
      data: { defaultContextId: context.id },
    });
    log.info('Set default context');
  }

  // 4. Upsert value statements
  let upserted = 0;
  for (const vs of NATIONAL_PRIORITIES_VALUE_STATEMENTS) {
    const statement = await db.valueStatement.upsert({
      where: { domainId_token: { domainId: domain.id, token: vs.token } },
      update: { body: vs.body },
      create: { domainId: domain.id, ...vs },
    });
    // Ensure a ValueStatementVersion exists (the UI reads currentContent from versions)
    const latestVersion = await db.valueStatementVersion.findFirst({
      where: { statementId: statement.id },
      orderBy: { createdAt: 'desc' },
    });
    if (latestVersion == null || latestVersion.content !== vs.body) {
      await db.valueStatementVersion.create({
        data: { statementId: statement.id, content: vs.body },
      });
    }
    upserted += 1;
    log.info({ token: vs.token }, 'Upserted value statement');
  }

  // 5. Copy level preset and preamble defaults from job-choice if not set
  if (domain.defaultLevelPresetVersionId == null || domain.defaultPreambleVersionId == null) {
    const jobChoice = await db.domain.findUnique({
      where: { normalizedName: 'job-choice' },
      select: { defaultLevelPresetVersionId: true, defaultPreambleVersionId: true },
    });
    if (jobChoice != null) {
      const updates: Record<string, string> = {};
      if (domain.defaultLevelPresetVersionId == null && jobChoice.defaultLevelPresetVersionId != null) {
        updates.defaultLevelPresetVersionId = jobChoice.defaultLevelPresetVersionId;
      }
      if (domain.defaultPreambleVersionId == null && jobChoice.defaultPreambleVersionId != null) {
        updates.defaultPreambleVersionId = jobChoice.defaultPreambleVersionId;
      }
      if (Object.keys(updates).length > 0) {
        await db.domain.update({ where: { id: domain.id }, data: updates });
        log.info(updates, 'Copied defaults from job-choice domain');
      }
    }
  }

  // 6. Leave Domain.defaultModelIds empty — matches job-choice, neighborhood,
  // software-approach behavior. resolveEffectiveDefaultModelIds() falls back to
  // LlmModel.isDefault=true at query time, so the domain stays in sync with
  // whatever models the admin currently has flagged as default. The previous
  // implementation tried to snapshot LlmModel.id (cuid) into defaultModelIds,
  // but the coverage query expects LlmModel.modelId (short name like
  // "gpt-5.1") to match transcripts.modelId — different ID type. Falling back
  // is both simpler and consistent with other domains.

  log.info({ upserted, domainId: domain.id, contextId: context.id }, 'Seed complete');
}

main()
  .catch((err) => { log.error({ err }, 'Seed failed'); process.exitCode = 1; })
  .finally(() => db.$disconnect());
