/**
 * Agreement Tab
 *
 * Displays model agreement matrix showing how models agree/disagree.
 */

import { ModelComparisonMatrix } from '../ModelComparisonMatrix';
import type { ModelAgreement } from '../../../api/operations/analysis';
import type { PerModelStats } from './types';

type AgreementTabProps = {
  modelAgreement: ModelAgreement | null | undefined;
  perModel: Record<string, PerModelStats>;
};

export function AgreementTab({ modelAgreement, perModel }: AgreementTabProps) {
  if (!modelAgreement) {
    return (
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-4">Model Agreement Matrix</h3>
        <div className="text-center py-8 text-gray-500">
          Model agreement data not available.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-4">Model Agreement Matrix</h3>
      <ModelComparisonMatrix modelAgreement={modelAgreement} perModel={perModel} />
    </div>
  );
}
