/**
 * Expansion Settings
 *
 * Toggle between code-based and LLM-based scenario generation.
 */

import { Code, Cpu, Check } from 'lucide-react';

type ExpansionSettingsProps = {
  useCodeGeneration: boolean;
  isSaving: boolean;
  saveSuccess: boolean;
  onToggle: () => Promise<void>;
};

export function ExpansionSettings({
  useCodeGeneration,
  isSaving,
  saveSuccess,
  onToggle,
}: ExpansionSettingsProps) {
  return (
    <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <Code className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-gray-900">Scenario Expansion Method</h2>
            <p className="text-sm text-gray-500">
              Choose between LLM-based or code-based scenario generation
            </p>
          </div>
        </div>
      </div>

      <div className="px-6 py-4 space-y-4">
        <div className="flex items-start gap-4">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={useCodeGeneration}
              onChange={onToggle}
              disabled={isSaving}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600"></div>
          </label>
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-900">Use Code-based Generation</p>
            <p className="text-sm text-gray-500 mt-1">
              Generate scenarios using deterministic combinatorial logic instead of calling an LLM.
              This is faster, cheaper (no LLM costs), and produces consistent results.
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2">
          {useCodeGeneration ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-full text-sm">
              <Code className="w-4 h-4" />
              Code generation enabled
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-800 rounded-full text-sm">
              <Cpu className="w-4 h-4" />
              LLM generation enabled
            </div>
          )}
          {saveSuccess && (
            <div className="flex items-center gap-1 text-green-600">
              <Check className="w-4 h-4" />
              <span className="text-sm">Saved</span>
            </div>
          )}
        </div>

        {/* Trade-offs info */}
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <p className="text-sm font-medium text-gray-700 mb-2">Trade-offs:</p>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-medium text-green-700">Code Generation</p>
              <ul className="mt-1 text-gray-600 space-y-1">
                <li>+ Fast and deterministic</li>
                <li>+ No LLM costs</li>
                <li>+ Consistent output</li>
                <li>- Simple placeholder replacement</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-purple-700">LLM Generation</p>
              <ul className="mt-1 text-gray-600 space-y-1">
                <li>+ Natural language variations</li>
                <li>+ Can follow matching rules</li>
                <li>- Costs tokens per expansion</li>
                <li>- Results may vary</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
