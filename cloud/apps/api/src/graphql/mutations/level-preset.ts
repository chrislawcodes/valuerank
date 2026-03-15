import { builder } from '../builder.js';
import { db, Prisma } from '@valuerank/db';
import { LevelPresetRef, LevelPresetVersionRef } from '../types/refs.js';
import { createAuditLog } from '../../services/audit/index.js';

const DeleteLevelPresetResultRef = builder.objectRef<{ id: string }>('DeleteLevelPresetResult');

builder.objectType(DeleteLevelPresetResultRef, {
  fields: (t) => ({
    id: t.exposeID('id'),
  }),
});

builder.mutationField('createLevelPreset', (t) =>
  t.field({
    type: LevelPresetRef,
    args: {
      name: t.arg.string({ required: true }),
      l1: t.arg.string({ required: true }),
      l2: t.arg.string({ required: true }),
      l3: t.arg.string({ required: true }),
      l4: t.arg.string({ required: true }),
      l5: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      let preset;
      try {
        preset = await db.$transaction(async (tx) => {
          const p = await tx.levelPreset.create({
            data: { name: args.name },
          });
          await tx.levelPresetVersion.create({
            data: {
              levelPresetId: p.id,
              version: 'v1',
              l1: args.l1,
              l2: args.l2,
              l3: args.l3,
              l4: args.l4,
              l5: args.l5,
            },
          });
          return p;
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new Error(`Level preset "${args.name}" already exists`);
        }
        throw error;
      }

      await createAuditLog({
        action: 'CREATE',
        entityType: 'LevelPreset',
        entityId: preset.id,
        userId: ctx.user?.id ?? null,
        metadata: { name: preset.name },
      });

      return preset;
    },
  })
);

builder.mutationField('updateLevelPreset', (t) =>
  t.field({
    type: LevelPresetVersionRef,
    args: {
      id: t.arg.id({ required: true }),
      l1: t.arg.string({ required: true }),
      l2: t.arg.string({ required: true }),
      l3: t.arg.string({ required: true }),
      l4: t.arg.string({ required: true }),
      l5: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const existing = await db.levelPreset.findUnique({ where: { id } });
      if (existing == null) throw new Error(`Level preset not found: ${id}`);

      // Count existing versions to derive a version label
      const versionCount = await db.levelPresetVersion.count({
        where: { levelPresetId: id },
      });
      const versionLabel = `v${versionCount + 1}`;

      const newVersion = await db.$transaction(async (tx) => {
        const v = await tx.levelPresetVersion.create({
          data: {
            levelPresetId: id,
            version: versionLabel,
            l1: args.l1,
            l2: args.l2,
            l3: args.l3,
            l4: args.l4,
            l5: args.l5,
          },
        });
        // Touch updatedAt on parent
        await tx.levelPreset.update({
          where: { id },
          data: { updatedAt: new Date() },
        });
        return v;
      });

      await createAuditLog({
        action: 'UPDATE',
        entityType: 'LevelPreset',
        entityId: id,
        userId: ctx.user?.id ?? null,
        metadata: { name: existing.name, newVersion: versionLabel },
      });

      return newVersion;
    },
  })
);

builder.mutationField('deleteLevelPreset', (t) =>
  t.field({
    type: DeleteLevelPresetResultRef,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const id = String(args.id);
      const existing = await db.levelPreset.findUnique({ where: { id } });
      if (existing == null) throw new Error(`Level preset not found: ${id}`);

      await db.levelPreset.delete({ where: { id } });

      await createAuditLog({
        action: 'DELETE',
        entityType: 'LevelPreset',
        entityId: id,
        userId: ctx.user?.id ?? null,
        metadata: { name: existing.name },
      });

      return { id };
    },
  })
);
