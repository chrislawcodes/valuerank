import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { LevelPresetRef, LevelPresetVersionRef } from './refs.js';

export { LevelPresetRef, LevelPresetVersionRef };

// LevelPresetVersion Type
builder.objectType(LevelPresetVersionRef, {
  description: 'A versioned snapshot of a level preset (5-word intensity scale)',
  fields: (t) => ({
    id: t.exposeID('id'),
    levelPresetId: t.exposeString('levelPresetId'),
    version: t.exposeString('version'),
    l1: t.exposeString('l1'),
    l2: t.exposeString('l2'),
    l3: t.exposeString('l3'),
    l4: t.exposeString('l4'),
    l5: t.exposeString('l5'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),

    // Relation: parent LevelPreset
    levelPreset: t.field({
      type: LevelPresetRef,
      nullable: true,
      description: 'The parent level preset',
      resolve: async (parent) => {
        return db.levelPreset.findUnique({
          where: { id: parent.levelPresetId },
        });
      },
    }),
  }),
});

// LevelPreset Type
builder.objectType(LevelPresetRef, {
  description: 'A named level preset defining the 5-word intensity scale for job-choice conditions',
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),

    // All versions (newest first)
    versions: t.field({
      type: [LevelPresetVersionRef],
      description: 'All versions of this level preset (newest first)',
      resolve: async (parent) => {
        return db.levelPresetVersion.findMany({
          where: { levelPresetId: parent.id },
          orderBy: { createdAt: 'desc' },
        });
      },
    }),

    // Helper: latest version
    latestVersion: t.field({
      type: LevelPresetVersionRef,
      nullable: true,
      description: 'The most recently created version',
      resolve: async (parent) => {
        const versions = await db.levelPresetVersion.findMany({
          where: { levelPresetId: parent.id },
          orderBy: { createdAt: 'desc' },
          take: 1,
        });
        return versions[0] ?? null;
      },
    }),
  }),
});

// Input types
export const CreateLevelPresetInput = builder.inputType('CreateLevelPresetInput', {
  fields: (t) => ({
    name: t.string({ required: true }),
    l1: t.string({ required: true }),
    l2: t.string({ required: true }),
    l3: t.string({ required: true }),
    l4: t.string({ required: true }),
    l5: t.string({ required: true }),
  }),
});

export const UpdateLevelPresetInput = builder.inputType('UpdateLevelPresetInput', {
  fields: (t) => ({
    l1: t.string({ required: true }),
    l2: t.string({ required: true }),
    l3: t.string({ required: true }),
    l4: t.string({ required: true }),
    l5: t.string({ required: true }),
  }),
});
