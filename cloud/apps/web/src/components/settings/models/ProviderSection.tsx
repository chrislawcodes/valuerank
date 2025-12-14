/**
 * Provider Section
 *
 * Accordion-style section for a single LLM provider showing its models.
 */

import { Plus, ChevronDown, ChevronRight, Settings } from 'lucide-react';
import { Button } from '../../ui/Button';
import { ModelRow } from './ModelRow';
import type { ProviderSectionProps } from './types';

export function ProviderSection({
  provider,
  isExpanded,
  onToggle,
  onAddModel,
  onEditModel,
  onDeprecateModel,
  onReactivateModel,
  onSetDefault,
  onEditSettings,
}: ProviderSectionProps) {
  const activeModels = provider.models.filter((m) => m.status === 'ACTIVE');
  const deprecatedModels = provider.models.filter((m) => m.status === 'DEPRECATED');

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* eslint-disable-next-line react/forbid-elements -- Accordion toggle requires custom semantic button styling */}
      <button
        onClick={onToggle}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
          <div className="text-left">
            <h3 className="font-medium text-gray-900">{provider.displayName}</h3>
            <p className="text-sm text-gray-500">
              {activeModels.length} active model{activeModels.length !== 1 ? 's' : ''}
              {deprecatedModels.length > 0 && `, ${deprecatedModels.length} deprecated`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`px-2 py-1 text-xs rounded-full ${
              provider.isEnabled
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-500'
            }`}
          >
            {provider.isEnabled ? 'Enabled' : 'Disabled'}
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-gray-200">
          <div className="px-6 py-3 bg-gray-50 flex justify-between items-center">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onEditSettings();
              }}
              variant="ghost"
              size="sm"
              className="text-gray-500 hover:text-gray-700 hover:bg-transparent px-0 group"
              title="Edit rate limits"
            >
              <Settings className="w-4 h-4 text-gray-400 group-hover:text-gray-600 mr-1" />
              Rate limit: {provider.requestsPerMinute}/min, {provider.maxParallelRequests} parallel
            </Button>
            <Button variant="ghost" size="sm" onClick={onAddModel}>
              <Plus className="w-4 h-4 mr-1" />
              Add Model
            </Button>
          </div>

          <div className="divide-y divide-gray-100">
            {provider.models.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                onEdit={() => onEditModel(model)}
                onDeprecate={() => onDeprecateModel(model.id)}
                onReactivate={() => onReactivateModel(model.id)}
                onSetDefault={() => onSetDefault(model.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
