/**
 * Definition Content View
 *
 * Displays the definition content: preamble, template, and dimensions.
 */

import type { DefinitionContent } from '../../api/operations/definitions';

type DefinitionContentViewProps = {
  content: DefinitionContent | null | undefined;
};

export function DefinitionContentView({ content }: DefinitionContentViewProps) {
  if (!content) {
    return (
      <div className="text-gray-400 text-sm italic">No content defined</div>
    );
  }

  const { preamble = '', template = '', dimensions = [] } = content;

  return (
    <div className="space-y-6">
      {/* Preamble */}
      {preamble && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Preamble</h3>
          <p className="text-gray-600 bg-gray-50 rounded-lg p-4">{preamble}</p>
        </div>
      )}

      {/* Template */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Scenario Template</h3>
        <pre className="text-gray-600 bg-gray-50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
          {template}
        </pre>
      </div>

      {/* Dimensions */}
      {dimensions.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Dimensions ({dimensions.length})
          </h3>
          <div className="space-y-3">
            {dimensions.map((dim, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">[{dim.name}]</h4>
                <div className="space-y-2">
                  {/* Handle 'levels' format (with score/label/options) */}
                  {dim.levels &&
                    dim.levels.length > 0 &&
                    dim.levels.map((level, levelIndex) => (
                      <div key={levelIndex} className="flex items-start gap-3 text-sm">
                        <span className="inline-flex px-2 py-0.5 bg-teal-100 text-teal-800 rounded font-medium">
                          {level.score}
                        </span>
                        <div>
                          <span className="font-medium text-gray-900">{level.label}</span>
                          {level.description && (
                            <p className="text-gray-500">{level.description}</p>
                          )}
                          {level.options && level.options.length > 0 && (
                            <p className="text-gray-400 text-xs">
                              Options: {level.options.join(', ')}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  {/* Handle 'values' format (simple string array) */}
                  {(!dim.levels || dim.levels.length === 0) &&
                    dim.values &&
                    dim.values.length > 0 &&
                    dim.values.map((value: string, valueIndex: number) => (
                      <div key={valueIndex} className="flex items-start gap-3 text-sm">
                        <span className="inline-flex px-2 py-0.5 bg-gray-200 text-gray-700 rounded font-medium">
                          {valueIndex + 1}
                        </span>
                        <span className="text-gray-900">{value}</span>
                      </div>
                    ))}
                  {/* Show message if no levels or values */}
                  {(!dim.levels || dim.levels.length === 0) &&
                    (!dim.values || dim.values.length === 0) && (
                      <p className="text-gray-400 text-sm italic">No levels defined</p>
                    )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
