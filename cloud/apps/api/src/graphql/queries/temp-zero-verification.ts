import { db } from '@valuerank/db';
import { AuthenticationError } from '@valuerank/shared';
import { builder } from '../builder.js';

type TempZeroModelVerification = {
  modelId: string;
  transcriptCount: number;
  adapterModes: string[];
  promptHashStabilityPct: number | null;
  fingerprintDriftPct: number | null;
  decisionMatchRatePct: number | null;
};

type TempZeroVerificationReport = {
  generatedAt: Date;
  transcriptCount: number;
  daysLookedBack: number;
  models: TempZeroModelVerification[];
};

type TranscriptRecord = {
  id: string;
  modelId: string;
  scenarioId: string | null;
  decisionCode: string | null;
  content: unknown;
  createdAt: Date;
};

function getNestedString(value: unknown, path: string[]): string | null {
  let current: unknown = value;
  for (const key of path) {
    if (!current || typeof current !== 'object' || !(key in current)) return null;
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.trim() !== '' ? current : null;
}

function calculatePct(numerator: number, denominator: number): number | null {
  if (denominator === 0) return null;
  return (numerator / denominator) * 100;
}

const TempZeroModelVerificationRef = builder.objectRef<TempZeroModelVerification>('TempZeroModelVerification');
const TempZeroVerificationReportRef = builder.objectRef<TempZeroVerificationReport>('TempZeroVerificationReport');

builder.objectType(TempZeroModelVerificationRef, {
  fields: (t) => ({
    modelId: t.exposeString('modelId'),
    transcriptCount: t.exposeInt('transcriptCount'),
    adapterModes: t.exposeStringList('adapterModes'),
    promptHashStabilityPct: t.exposeFloat('promptHashStabilityPct', { nullable: true }),
    fingerprintDriftPct: t.exposeFloat('fingerprintDriftPct', { nullable: true }),
    decisionMatchRatePct: t.exposeFloat('decisionMatchRatePct', { nullable: true }),
  }),
});

builder.objectType(TempZeroVerificationReportRef, {
  fields: (t) => ({
    generatedAt: t.field({
      type: 'DateTime',
      resolve: (parent) => parent.generatedAt,
    }),
    transcriptCount: t.exposeInt('transcriptCount'),
    daysLookedBack: t.exposeInt('daysLookedBack'),
    models: t.field({
      type: [TempZeroModelVerificationRef],
      resolve: (parent) => parent.models,
    }),
  }),
});

builder.queryField('tempZeroVerificationReport', (t) =>
  t.field({
    type: TempZeroVerificationReportRef,
    nullable: true,
    args: {
      days: t.arg.int({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const daysLookedBack = args.days ?? 30;
      const runs = await db.run.findMany({
        where: {
          config: { path: ['temperature'], equals: 0 },
          createdAt: { gte: new Date(Date.now() - daysLookedBack * 24 * 60 * 60 * 1000) },
          deletedAt: null,
        },
        select: { id: true },
      });

      const transcripts = await db.transcript.findMany({
        where: {
          runId: { in: runs.map((run) => run.id) },
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          modelId: true,
          scenarioId: true,
          decisionCode: true,
          content: true,
          createdAt: true,
        },
      });

      const transcriptsByModel = new Map<string, Map<string | null, TranscriptRecord[]>>();

      for (const transcript of transcripts) {
        const modelGroups = transcriptsByModel.get(transcript.modelId) ?? new Map<string | null, TranscriptRecord[]>();
        const scenarioTranscripts = modelGroups.get(transcript.scenarioId) ?? [];
        scenarioTranscripts.push(transcript);
        modelGroups.set(transcript.scenarioId, scenarioTranscripts);
        transcriptsByModel.set(transcript.modelId, modelGroups);
      }

      const models = [...transcriptsByModel.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([modelId, scenarioGroups]) => {
          let transcriptCount = 0;
          const adapterModes = new Set<string>();

          let promptHashEligibleGroups = 0;
          let promptHashMatchedGroups = 0;
          let fingerprintEligibleGroups = 0;
          let fingerprintDriftedGroups = 0;
          let decisionEligibleGroups = 0;
          let decisionMatchedGroups = 0;

          for (const scenarioTranscripts of scenarioGroups.values()) {
            transcriptCount += scenarioTranscripts.length;

            for (const transcript of scenarioTranscripts) {
              const adapterMode = getNestedString(transcript.content, ['turns', '0', 'providerMetadata', 'adapterMode']);
              if (adapterMode != null) {
                adapterModes.add(adapterMode);
              }
            }

            if (scenarioTranscripts.length >= 2) {
              const promptHashes = scenarioTranscripts.map((transcript) => (
                getNestedString(transcript.content, ['turns', '0', 'providerMetadata', 'promptHash'])
              ));
              if (promptHashes.every((value): value is string => value !== null)) {
                promptHashEligibleGroups += 1;
                if (promptHashes.every((value) => value === promptHashes[0])) {
                  promptHashMatchedGroups += 1;
                }
              }

              const systemFingerprints = scenarioTranscripts.map((transcript) => (
                getNestedString(transcript.content, ['turns', '0', 'providerMetadata', 'raw', 'system_fingerprint'])
              ));
              if (systemFingerprints.every((value): value is string => value !== null)) {
                fingerprintEligibleGroups += 1;
                if (!systemFingerprints.every((value) => value === systemFingerprints[0])) {
                  fingerprintDriftedGroups += 1;
                }
              }
            }

            const recentTranscripts = scenarioTranscripts.slice(0, 3);
            if (recentTranscripts.length === 3) {
              const decisionCodes = recentTranscripts.map((transcript) => transcript.decisionCode);
              if (decisionCodes.every((value): value is string => value !== null)) {
                decisionEligibleGroups += 1;
                if (decisionCodes.every((value) => value === decisionCodes[0])) {
                  decisionMatchedGroups += 1;
                }
              }
            }
          }

          return {
            modelId,
            transcriptCount,
            adapterModes: [...adapterModes].sort((left, right) => left.localeCompare(right)),
            promptHashStabilityPct: calculatePct(promptHashMatchedGroups, promptHashEligibleGroups),
            fingerprintDriftPct: calculatePct(fingerprintDriftedGroups, fingerprintEligibleGroups),
            decisionMatchRatePct: calculatePct(decisionMatchedGroups, decisionEligibleGroups),
          };
        });

      return {
        generatedAt: new Date(),
        transcriptCount: transcripts.length,
        daysLookedBack,
        models,
      };
    },
  }),
);
