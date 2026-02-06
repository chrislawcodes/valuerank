/**
 * Model Row
 *
 * Displays a single LLM model with actions for edit, deprecate, reactivate, and set default.
 */

import { Cpu, Star, Archive, RotateCcw, Edit2 } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { ModelRowProps } from './types';

export function ModelRow({
  model,
  onEdit,
  onDeprecate,
  onReactivate,
  onSetDefault,
  onUnsetDefault,
}: ModelRowProps) {
  const isDeprecated = model.status === 'DEPRECATED';

  return (
    <div
      className={`px-6 py-4 flex items-center justify-between ${
        isDeprecated ? 'bg-gray-50 opacity-60' : ''
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isDeprecated ? 'bg-gray-200' : 'bg-teal-100'
          }`}
        >
          <Cpu className={`w-5 h-5 ${isDeprecated ? 'text-gray-400' : 'text-teal-600'}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900">{model.displayName}</p>
            {model.isDefault && (
              <span className="px-2 py-0.5 text-xs bg-yellow-100 text-yellow-700 rounded-full flex items-center gap-1">
                <Star className="w-3 h-3" />
                Default
              </span>
            )}
            {isDeprecated && (
              <span className="px-2 py-0.5 text-xs bg-gray-200 text-gray-600 rounded-full">
                Deprecated
              </span>
            )}
            {!model.isAvailable && !isDeprecated && (
              <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded-full">
                No API Key
              </span>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {model.modelId} · ${model.costInputPerMillion}/M in, ${model.costOutputPerMillion}/M out
            {typeof model.apiConfig?.maxTokens === 'number' && (
              <span className="ml-2">· {model.apiConfig.maxTokens.toLocaleString()} max tokens</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {!isDeprecated && (
          model.isDefault ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={onUnsetDefault}
              title="Remove from defaults"
              className="text-yellow-600 hover:text-yellow-700 hover:bg-yellow-50"
            >
              <Star className="w-4 h-4 fill-current" />
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={onSetDefault} title="Set as default">
              <Star className="w-4 h-4" />
            </Button>
          )
        )}
        <Button variant="ghost" size="sm" onClick={onEdit} title="Edit">
          <Edit2 className="w-4 h-4" />
        </Button>
        {isDeprecated ? (
          <Button variant="ghost" size="sm" onClick={onReactivate} title="Reactivate">
            <RotateCcw className="w-4 h-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={onDeprecate}
            title="Deprecate"
            className="text-orange-600 hover:text-orange-700 hover:bg-orange-50"
          >
            <Archive className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
