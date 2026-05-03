import { builder } from '../builder.js';
import { PressureSensitivityResultRef } from '../types/pressure-sensitivity.js';
import { getPressureSensitivityResult } from '../../services/pressure-sensitivity/snapshot-cache.js';

builder.queryField('pressureSensitivity', (t) =>
  t.field({
    type: PressureSensitivityResultRef,
    args: {
      domainId: t.arg.id({ required: false }),
      modelIds: t.arg.stringList({ required: false }),
      providerId: t.arg.id({ required: false }),
      signature: t.arg.string({ required: true }),
    },
    resolve: async (_root, args) => {
      return getPressureSensitivityResult({
        domainId: args.domainId != null ? String(args.domainId) : null,
        modelIds: args.modelIds != null
          ? [...new Set(args.modelIds.map((v) => String(v)).filter((v) => v.length > 0))]
          : null,
        providerId: args.providerId != null ? String(args.providerId) : null,
        signature: String(args.signature),
      });
    },
  }),
);
