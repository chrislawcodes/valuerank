import { builder } from '../builder.js';
import { DomainAnalysisVignetteDetailRef } from '../queries/domain/types-detail.js';
import type { DomainAnalysisVignetteDetail } from '../queries/domain/types-detail.js';

export type ConfidenceValueDetailResult = {
  modelLabel: string;
  valueKey: string;
  vignettes: DomainAnalysisVignetteDetail[];
};

export const ConfidenceValueDetailResultRef = builder.objectRef<ConfidenceValueDetailResult>(
  'ConfidenceValueDetailResult',
);

builder.objectType(ConfidenceValueDetailResultRef, {
  fields: (t) => ({
    modelLabel: t.exposeString('modelLabel'),
    valueKey: t.exposeString('valueKey'),
    vignettes: t.field({
      type: [DomainAnalysisVignetteDetailRef],
      resolve: (parent) => parent.vignettes,
    }),
  }),
});
