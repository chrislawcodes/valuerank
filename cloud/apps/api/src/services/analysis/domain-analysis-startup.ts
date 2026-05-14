import { db } from '@valuerank/db';
import { createLogger } from '@valuerank/shared';
import {
  prepareDomainAnalysisState,
  parseSnapshotOutput,
} from './domain-analysis-snapshot-builder.js';
import { getCurrentSnapshot, queueDomainAnalysisRefresh } from './domain-analysis-cache.js';
import {
  DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE,
  buildDomainAnalysisDomainSetId,
  normalizeDomainIds,
  type DomainAnalysisScope,
} from './domain-analysis-scope.js';

const log = createLogger('analysis:domain-startup');

/**
 * On startup, queue background refreshes for priority analysis combinations that are
 * stale or have never been built. Priority set:
 *   1. ALL_DOMAINS
 *   2. Every individual domain
 *   3. All domains minus "Motivation for Invasion Choice" (the most-used domain set)
 *
 * Runs non-blocking after the queue orchestrator is ready.
 * Skips any combination whose rebuild is already in progress.
 */
export async function queueStaleAnalysesOnStartup(): Promise<void> {
  const domains = await db.domain.findMany({
    select: { id: true, name: true },
  });

  let queued = 0;

  async function checkAndQueue(
    scope: DomainAnalysisScope,
    domainId: string,
    domainIds: string[] | undefined,
    logContext: Record<string, unknown>,
  ): Promise<void> {
    try {
      const state = await prepareDomainAnalysisState({
        scope,
        domainId,
        domainIds,
        requestedSignature: null,
      });

      if (state.definitions.length === 0) return;

      const currentSnapshot = await getCurrentSnapshot(db, state.scope, domainId, state.configSignature);
      const parsedCurrent = currentSnapshot != null ? parseSnapshotOutput(currentSnapshot.output) : null;

      if (parsedCurrent == null && currentSnapshot != null) return; // rebuild already in progress
      if (currentSnapshot != null && currentSnapshot.inputHash === state.inputHash) return; // already fresh

      const didQueue = await queueDomainAnalysisRefresh({
        scope: state.scope,
        domainId,
        domainIds: scope === 'ALL_DOMAINS' ? undefined : domainIds,
        signature: state.selectedSignature,
        reason: currentSnapshot == null ? 'startup-never-built' : 'startup-stale',
      });
      if (didQueue) queued += 1;
    } catch (err) {
      log.warn({ err, ...logContext }, 'startup stale check failed');
    }
  }

  await checkAndQueue('ALL_DOMAINS', DOMAIN_ANALYSIS_ALL_DOMAINS_SCOPE, undefined, { scope: 'ALL_DOMAINS' });

  for (const domain of domains) {
    await checkAndQueue('DOMAIN', domain.id, undefined, { scope: 'DOMAIN', domainId: domain.id });
  }

  // All domains minus "Motivation for Invasion Choice" (most-used multi-domain combination)
  const motivationDomain = domains.find((d) => d.name.includes('Motivation for Invasion'));
  if (motivationDomain != null) {
    const domainSetIds = normalizeDomainIds(domains.filter((d) => d.id !== motivationDomain.id).map((d) => d.id));
    const domainSetId = buildDomainAnalysisDomainSetId(domainSetIds);
    await checkAndQueue('DOMAIN_SET', domainSetId, domainSetIds, { scope: 'DOMAIN_SET', size: domainSetIds.length });
  }

  log.info({ queued }, 'Startup priority domain analysis check complete');
}
