import { formatDisplayLabel } from '../../utils/displayLabels';
import type { ModelHeader, ModelHeaderGroup } from './modelHeaderLabels';

type ConditionDecisionsTableHeadProps = {
  attributeA: string;
  attributeB: string;
  modelHeaders: ModelHeader[];
  groupedModelHeaders: ModelHeaderGroup[];
  hasGroupedFamilies: boolean;
};

export function ConditionDecisionsTableHead({
  attributeA,
  attributeB,
  modelHeaders,
  groupedModelHeaders,
  hasGroupedFamilies,
}: ConditionDecisionsTableHeadProps) {
  if (hasGroupedFamilies) {
    return (
      <thead>
        <tr>
          <th
            rowSpan={2}
            className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600"
          >
            {formatDisplayLabel(attributeA)}
          </th>
          <th
            rowSpan={2}
            className="w-36 border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600 whitespace-normal break-words"
          >
            {formatDisplayLabel(attributeB)}
          </th>
          {groupedModelHeaders.map((group) => (
            <th
              key={group.familyKey}
              colSpan={group.models.length}
              rowSpan={
                group.models.length === 1 && group.models[0]?.variantLabel === group.familyLabel
                  ? 2
                  : undefined
              }
              className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold uppercase tracking-wide text-gray-600"
            >
              {group.familyLabel}
            </th>
          ))}
        </tr>
        <tr>
          {groupedModelHeaders.flatMap((group) =>
            group.models.length === 1 && group.models[0]?.variantLabel === group.familyLabel
              ? []
              : group.models.map((header) => (
                  <th
                    key={header.modelId}
                    className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700 whitespace-pre-line break-words leading-4"
                    title={header.modelId}
                  >
                    {header.variantLabel}
                  </th>
                )),
          )}
        </tr>
      </thead>
    );
  }

  return (
    <thead>
      <tr>
        <th className="border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600">
          {formatDisplayLabel(attributeA)}
        </th>
        <th className="w-36 border border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase text-gray-600 whitespace-normal break-words">
          {formatDisplayLabel(attributeB)}
        </th>
        {modelHeaders.map((header) => (
          <th
            key={header.modelId}
            className="border border-gray-200 bg-gray-50 px-3 py-2 text-center text-xs font-semibold text-gray-700 whitespace-pre-line break-words leading-4"
            title={header.modelId}
          >
            {header.variantLabel}
          </th>
        ))}
      </tr>
    </thead>
  );
}
