/**
 * Definition Content View
 *
 * Displays the definition content: preamble, template, and dimensions.
 */

import type { DefinitionContent, PreambleVersion } from '../../api/operations/definitions';
import { formatDisplayLabel } from '../../utils/displayLabels';

type DefinitionContentViewProps = {
  content: DefinitionContent | null | undefined;
  preambleVersion?: PreambleVersion | null;
};

export function DefinitionContentView({ content, preambleVersion }: DefinitionContentViewProps) {
  if (!content) {
    return (
      <div className="text-gray-400 text-sm italic">No content defined</div>
    );
  }

  const { preamble = '', template = '', dimensions = [] } = content;
  const isJobChoice = content.methodology?.family === 'job-choice';
  const sharedScaleSignature = dimensions[0] == null
    ? null
    : JSON.stringify({
        levels: dimensions[0].levels?.map((level) => ({
          score: level.score,
          label: level.label,
          description: level.description,
          options: level.options,
        })) ?? null,
        values: dimensions[0].values ?? null,
      });
  const hasSharedScale =
    isJobChoice &&
    dimensions.length > 0 &&
    sharedScaleSignature != null &&
    dimensions.every((dimension) =>
      JSON.stringify({
        levels: dimension.levels?.map((level) => ({
          score: level.score,
          label: level.label,
          description: level.description,
          options: level.options,
        })) ?? null,
        values: dimension.values ?? null,
      }) === sharedScaleSignature,
    );
  const sharedScale = hasSharedScale ? dimensions[0] : null;

  return (
    <div className="space-y-6">
      {/* Preamble */}
      {/* Preamble */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Preamble
          {preambleVersion?.preamble?.name && (
            <span className="ml-2 font-normal text-gray-500">
              {preambleVersion.preamble.name} <span className="text-gray-400">(v{preambleVersion.version})</span>
            </span>
          )}
        </h3>
        <div className="text-gray-600 bg-gray-50 rounded-lg p-4 whitespace-pre-wrap">
          {preambleVersion?.content || preamble || <span className="text-gray-400 italic">No preamble defined</span>}
        </div>
      </div>

      {/* Template */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">Narrative</h3>
        <pre className="text-gray-600 bg-gray-50 rounded-lg p-4 font-mono text-sm whitespace-pre-wrap">
          {template}
        </pre>
      </div>

      {/* Dimensions */}
      {sharedScale != null && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Level Scale</h3>
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs uppercase tracking-wide text-gray-500 mb-3">
              Applies to all values in this vignette
            </p>
            <div className="space-y-2">
              {sharedScale.levels &&
                sharedScale.levels.length > 0 &&
                sharedScale.levels.map((level, levelIndex) => (
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
              {(!sharedScale.levels || sharedScale.levels.length === 0) &&
                sharedScale.values &&
                sharedScale.values.length > 0 &&
                sharedScale.values.map((value: string, valueIndex: number) => (
                  <div key={valueIndex} className="flex items-start gap-3 text-sm">
                    <span className="inline-flex px-2 py-0.5 bg-gray-200 text-gray-700 rounded font-medium">
                      {valueIndex + 1}
                    </span>
                    <span className="text-gray-900">{value}</span>
                  </div>
                ))}
              {(!sharedScale.levels || sharedScale.levels.length === 0) &&
                (!sharedScale.values || sharedScale.values.length === 0) && (
                  <p className="text-gray-400 text-sm italic">No levels defined</p>
                )}
            </div>
          </div>
        </div>
      )}

      {dimensions.length > 0 && sharedScale == null && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">
            Attributes ({dimensions.length})
          </h3>
          <div className="space-y-3">
            {dimensions.map((dim, index) => (
              <div key={index} className="bg-gray-50 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">[{formatDisplayLabel(dim.name)}]</h4>
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
                        <span className="text-gray-900">{formatDisplayLabel(value)}</span>
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
