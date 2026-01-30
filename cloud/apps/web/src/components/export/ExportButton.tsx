/**
 * ExportButton Component
 *
 * Dropdown button for exporting definitions in various formats.
 * Currently supports: Markdown (MD)
 * Future: YAML scenarios, full bundle
 */

import { useState, useRef, useEffect } from 'react';
import { Download, ChevronDown, FileText, FileCode } from 'lucide-react';
import { Button } from '../ui/Button';
import { exportDefinitionAsMd, exportScenariosAsYaml } from '../../api/export';

type ExportFormat = 'md' | 'yaml';

type ExportButtonProps = {
  /** Definition ID to export */
  definitionId: string;
  /** Whether scenarios are available for YAML export */
  hasScenarios?: boolean;
  /** Additional CSS classes */
  className?: string;
};

export function ExportButton({
  definitionId,
  hasScenarios = false,
  className = '',
}: ExportButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  async function handleExport(format: ExportFormat) {
    setIsExporting(true);
    setError(null);
    setIsOpen(false);

    try {
      if (format === 'md') {
        await exportDefinitionAsMd(definitionId);
      } else if (format === 'yaml') {
        await exportScenariosAsYaml(definitionId);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      setError(message);
      console.error('Export error:', err);
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div ref={dropdownRef} className={`relative inline-block ${className}`}>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        isLoading={isExporting}
        className="gap-1 sm:gap-2"
        title="Export"
      >
        <Download size={16} />
        <span className="hidden sm:inline">Export</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </Button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
          {/* MD Export Option */}
          {/* eslint-disable-next-line react/forbid-elements -- Menu item requires custom full-width layout */}
          <button
            type="button"
            onClick={() => handleExport('md')}
            className="w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3"
          >
            <FileText size={16} className="text-gray-400" />
            <div>
              <div className="font-medium">Vignette (Markdown)</div>
              <div className="text-xs text-gray-500">Devtool-compatible format</div>
            </div>
          </button>

          {/* YAML Export Option (future) */}
          {/* eslint-disable-next-line react/forbid-elements -- Menu item requires custom full-width layout */}
          <button
            type="button"
            onClick={() => handleExport('yaml')}
            disabled={!hasScenarios}
            className={`w-full px-4 py-2 text-left text-sm flex items-center gap-3 ${
              hasScenarios
                ? 'text-gray-700 hover:bg-gray-50'
                : 'text-gray-400 cursor-not-allowed'
            }`}
          >
            <FileCode size={16} className={hasScenarios ? 'text-gray-400' : 'text-gray-300'} />
            <div>
              <div className="font-medium">Scenarios (YAML)</div>
              <div className="text-xs text-gray-500">
                {hasScenarios ? 'CLI-compatible format' : 'Generate scenarios first'}
              </div>
            </div>
          </button>
        </div>
      )}

      {error && (
        <div className="absolute right-0 mt-1 w-56 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  );
}
