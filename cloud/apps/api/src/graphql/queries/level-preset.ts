import { builder } from '../builder.js';
import { db } from '@valuerank/db';
import { LevelPresetRef } from '../types/refs.js';

builder.queryFields((t) => ({
  levelPresets: t.field({
    description: 'List all level presets',
    type: [LevelPresetRef],
    resolve: async () => {
      return db.levelPreset.findMany({
        orderBy: { updatedAt: 'desc' },
      });
    },
  }),
  levelPreset: t.field({
    description: 'Get a specific level preset by ID',
    type: LevelPresetRef,
    nullable: true,
    args: {
      id: t.arg.id({ required: true }),
    },
    resolve: async (_root, args) => {
      return db.levelPreset.findUnique({
        where: { id: String(args.id) },
      });
    },
  }),
}));
