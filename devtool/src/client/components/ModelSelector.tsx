import { useState, useEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';

export interface AvailableModel {
  id: string;
  name: string;
  providerId: string;
  providerName: string;
  providerIcon: string;
  isDefault?: boolean;
}

interface ModelSelectorProps {
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  models: AvailableModel[];
  loading?: boolean;
  disabled?: boolean;
  className?: string;
  /** Storage key for localStorage persistence */
  storageKey?: string;
}

export function ModelSelector({
  selectedModel,
  onModelChange,
  models,
  loading = false,
  disabled = false,
  className = '',
  storageKey,
}: ModelSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    if (storageKey && !selectedModel) {
      const saved = localStorage.getItem(storageKey);
      if (saved && models.some(m => m.id === saved)) {
        onModelChange(saved);
      }
    }
  }, [storageKey, models, selectedModel, onModelChange]);

  // Save to localStorage when changed
  useEffect(() => {
    if (storageKey && selectedModel) {
      localStorage.setItem(storageKey, selectedModel);
    }
  }, [storageKey, selectedModel]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selected = models.find(m => m.id === selectedModel);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-gray-100 rounded text-gray-500 ${className}`}>
        Loading models...
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 bg-gray-100 rounded text-gray-500 ${className}`}>
        No models available
      </div>
    );
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed min-w-[200px] ${className}`}
      >
        {selected ? (
          <>
            <span
              className="w-5 h-5 flex-shrink-0"
              dangerouslySetInnerHTML={{ __html: selected.providerIcon }}
            />
            <span className="flex-1 text-left truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 text-left text-gray-500">Select model...</span>
        )}
        <ChevronDown size={16} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-auto">
          {models.map(model => (
            <button
              key={model.id}
              type="button"
              onClick={() => {
                onModelChange(model.id);
                setIsOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-100 text-left ${
                model.id === selectedModel ? 'bg-blue-50' : ''
              }`}
            >
              <span
                className="w-5 h-5 flex-shrink-0"
                dangerouslySetInnerHTML={{ __html: model.providerIcon }}
              />
              <span className="flex-1 truncate">{model.name}</span>
              {model.isDefault && (
                <span className="text-xs text-gray-400">(default)</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Hook to fetch available models from the API */
export function useAvailableModels() {
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchModels() {
      try {
        const response = await fetch('/api/config/available-models');
        if (!response.ok) {
          throw new Error('Failed to fetch available models');
        }
        const data = await response.json();
        setModels(data.models || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }
    fetchModels();
  }, []);

  // Get the first default model, or first model overall
  const defaultModel = models.find(m => m.isDefault)?.id || models[0]?.id || '';

  return { models, loading, error, defaultModel };
}
