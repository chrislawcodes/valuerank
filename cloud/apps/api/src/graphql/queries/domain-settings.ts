/**
 * Domain Settings Queries
 *
 * Returns current domain settings (value statements with versions) and config snapshot history.
 */

import { db } from '@valuerank/db';
import { builder } from '../builder.js';
import {
  DomainSettingsRef,
  DomainConfigSnapshotSummaryRef,
  type DomainSettingsShape,
  type DomainConfigSnapshotSummaryShape,
} from '../types/domain.js';

// domainSettings query — returns current pickers + value statements with current/previous content
builder.queryField('domainSettings', (t) =>
  t.field({
    type: DomainSettingsRef,
    nullable: true,
    args: {
      domainId: t.arg.id({ required: true }),
    },
    resolve: async (_root, args) => {
      const domainId = args.domainId as string;

      const domain = await db.domain.findUnique({
        where: { id: domainId },
        select: {
          id: true,
          defaultPreambleVersionId: true,
          defaultLevelPresetVersionId: true,
          defaultContextId: true,
        },
      });

      if (!domain) return null;

      // Single findMany with take:2 nested versions (no N+1)
      const statements = await db.valueStatement.findMany({
        where: { domainId },
        orderBy: { token: 'asc' },
        select: {
          id: true,
          token: true,
          versions: {
            orderBy: { createdAt: 'desc' },
            take: 2,
            select: { id: true, content: true },
          },
        },
      });

      const valueStatements = statements.map((s) => ({
        id: s.id,
        token: s.token,
        currentContent: s.versions[0]?.content ?? '',
        previousContent: s.versions[1]?.content ?? null,
      }));

      const result: DomainSettingsShape = {
        domainId,
        preambleVersionId: domain.defaultPreambleVersionId,
        levelPresetVersionId: domain.defaultLevelPresetVersionId,
        contextId: domain.defaultContextId,
        valueStatements,
      };

      return result;
    },
  }),
);

// domainConfigSnapshots query — returns history of snapshots with labels
builder.queryField('domainConfigSnapshots', (t) =>
  t.field({
    type: [DomainConfigSnapshotSummaryRef],
    args: {
      domainId: t.arg.id({ required: true }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (_root, args) => {
      const domainId = args.domainId as string;
      const limit = args.limit ?? 20;

      const snapshots = await db.domainConfigSnapshot.findMany({
        where: { domainId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          preambleVersion: {
            include: { preamble: true },
          },
          levelPresetVersion: {
            include: { levelPreset: true },
          },
          context: {
            select: { text: true },
          },
        },
      });

      const results: DomainConfigSnapshotSummaryShape[] = snapshots.map((s) => ({
        id: s.id,
        createdAt: s.createdAt,
        preambleLabel:
          s.preambleVersion
            ? `${s.preambleVersion.preamble.name} ${s.preambleVersion.version}`
            : null,
        levelPresetLabel:
          s.levelPresetVersion
            ? `${s.levelPresetVersion.levelPreset.name} ${s.levelPresetVersion.version}`
            : null,
        contextLabel: s.context?.text?.slice(0, 40) ?? null,
        valueStatementCount: s.valueStatementVersionIds.length,
      }));

      return results;
    },
  }),
);
