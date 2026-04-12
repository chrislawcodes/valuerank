import { db } from '@valuerank/db';
import { AuthenticationError, NotFoundError, ValidationError } from '@valuerank/shared';
import { builder } from '../../builder.js';
import { LOCKED_ASSUMPTION_VIGNETTES } from '../../assumptions-constants.js';
import { ReviewOrderInvariancePairPayloadRef } from './types.js';

builder.mutationField('reviewOrderInvariancePair', (t) =>
  t.field({
    type: ReviewOrderInvariancePairPayloadRef,
    args: {
      pairId: t.arg.id({ required: true }),
      reviewStatus: t.arg.string({ required: true }),
      reviewNotes: t.arg.string({ required: false }),
    },
    resolve: async (_root, args, ctx) => {
      if (!ctx.user) {
        throw new AuthenticationError('Authentication required');
      }

      const pairId = String(args.pairId);

      const reviewStatus = args.reviewStatus === 'APPROVED' || args.reviewStatus === 'REJECTED'
        ? args.reviewStatus
        : null;
      if (reviewStatus == null) {
        throw new ValidationError('Review status must be APPROVED or REJECTED');
      }

      const existingPair = await db.assumptionScenarioPair.findUnique({
        where: { id: pairId },
        select: {
          id: true,
          assumptionKey: true,
          sourceScenarioId: true,
        },
      });
      if (!existingPair || existingPair.assumptionKey !== 'order_invariance') {
        throw new NotFoundError('OrderInvariancePair', pairId);
      }
      const sourceScenario = await db.scenario.findUnique({
        where: { id: existingPair.sourceScenarioId },
        select: { definitionId: true },
      });
      if (!sourceScenario || !LOCKED_ASSUMPTION_VIGNETTES.some((vignette) => vignette.id === sourceScenario.definitionId)) {
        throw new ValidationError('Order-invariance review is limited to the locked vignette package');
      }

      const siblingPairs = await db.assumptionScenarioPair.findMany({
        where: {
          assumptionKey: 'order_invariance',
          sourceScenario: {
            definitionId: sourceScenario.definitionId,
            deletedAt: null,
          },
          variantScenario: {
            deletedAt: null,
          },
        },
        select: { id: true },
      });
      if (siblingPairs.length === 0) {
        throw new NotFoundError('OrderInvariancePairs', sourceScenario.definitionId);
      }

      const reviewedAt = new Date();
      const trimmedNotes = args.reviewNotes?.trim() ?? '';
      const reviewer = await db.user.findUnique({
        where: { id: ctx.user.id },
        select: { id: true, name: true, email: true },
      });
      const reviewerName = reviewer?.name?.trim();
      const reviewerEmail = reviewer?.email;
      const reviewedBy = reviewerName != null && reviewerName !== ''
        ? reviewerName
        : reviewerEmail != null && reviewerEmail !== ''
          ? reviewerEmail
          : ctx.user.id;

      await db.assumptionScenarioPair.updateMany({
        where: {
          id: { in: siblingPairs.map((pair) => pair.id) },
        },
        data: {
          equivalenceReviewStatus: reviewStatus,
          equivalenceReviewedBy: reviewedBy,
          equivalenceReviewedAt: reviewedAt,
          equivalenceReviewNotes: trimmedNotes === '' ? null : trimmedNotes,
        },
      });

      return {
        pairId,
        reviewStatus,
        reviewedAt,
      };
    },
  }),
);
