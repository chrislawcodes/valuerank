/**
 * Definition Diff Visualization (2 runs)
 *
 * Shows side-by-side Monaco diff editor comparing definition templates
 * between exactly two runs. Supports tabs for template/preamble.
 */

import { useState, useMemo } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { FileText, Copy, Check } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { RunWithAnalysis } from '../types';
import { formatRunNameShort } from '../../../lib/format';

type DefinitionDiffProps = {
  leftRun: RunWithAnalysis;
  rightRun: RunWithAnalysis;
};

type TabType = 'template' | 'preamble';

/**
 * Monaco diff editor options
 */
const DIFF_EDITOR_OPTIONS = {
  readOnly: true,
  renderSideBySide: true,
  minimap: { enabled: true },
  scrollBeyondLastLine: false,
  wordWrap: 'on' as const,
  lineNumbers: 'on' as const,
  fontSize: 13,
  automaticLayout: true,
};

/**
 * Get definition content with fallback for missing data
 */
function getDefinitionContent(run: RunWithAnalysis): { template: string; preamble: string } {
  if (run.definitionContent) {
    return {
      template: run.definitionContent.template || '(No template defined)',
      preamble: run.definitionContent.preamble || '',
    };
  }
  return {
    template: '(Definition content not available)',
    preamble: '',
  };
}

/**
 * Check if two definitions are identical
 */
function areDefinitionsIdentical(
  left: { template: string; preamble: string },
  right: { template: string; preamble: string }
): boolean {
  return left.template === right.template && left.preamble === right.preamble;
}

/**
 * Copy button component with feedback
 */
function CopyButton({
  content,
  label,
  runInfo,
}: {
  content: string;
  label: string;
  runInfo: string;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const textWithHeader = `# ${runInfo}\n\n${content}`;
    await navigator.clipboard.writeText(textWithHeader);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleCopy}
      className="text-xs h-7 px-2"
      title={`Copy ${label} to clipboard`}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 mr-1" />
          Copied
        </>
      ) : (
        <>
          <Copy className="w-3 h-3 mr-1" />
          Copy {label}
        </>
      )}
    </Button>
  );
}

/**
 * Definition diff visualization for exactly 2 runs
 */
export function DefinitionDiff({ leftRun, rightRun }: DefinitionDiffProps) {
  const [activeTab, setActiveTab] = useState<TabType>('template');

  // Extract definition content
  const leftContent = useMemo(() => getDefinitionContent(leftRun), [leftRun]);
  const rightContent = useMemo(() => getDefinitionContent(rightRun), [rightRun]);

  // Check if preamble tab should be shown
  const showPreambleTab = leftContent.preamble || rightContent.preamble;

  // Check if definitions are identical
  const isIdentical = useMemo(
    () => areDefinitionsIdentical(leftContent, rightContent),
    [leftContent, rightContent]
  );

  // Get current content based on active tab
  const currentLeft = activeTab === 'template' ? leftContent.template : leftContent.preamble;
  const currentRight = activeTab === 'template' ? rightContent.template : rightContent.preamble;

  // Format run names
  const leftName = formatRunNameShort(leftRun);
  const rightName = formatRunNameShort(rightRun);

  // Format definition names
  const leftDefName = leftRun.definition?.name ?? 'Unknown';
  const rightDefName = rightRun.definition?.name ?? 'Unknown';

  return (
    <div className="space-y-4">
      {/* Header with run info */}
      <div className="flex items-start justify-between">
        <div className="flex-1 grid grid-cols-2 gap-4">
          {/* Left run info */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Original</div>
            <div className="font-medium text-gray-900 truncate" title={leftName}>
              {leftName}
            </div>
            <div className="text-sm text-gray-600 truncate" title={leftDefName}>
              {leftDefName}
            </div>
          </div>

          {/* Right run info */}
          <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
            <div className="text-xs text-gray-500 uppercase tracking-wide">Modified</div>
            <div className="font-medium text-gray-900 truncate" title={rightName}>
              {rightName}
            </div>
            <div className="text-sm text-gray-600 truncate" title={rightDefName}>
              {rightDefName}
            </div>
          </div>
        </div>
      </div>

      {/* Tab bar and copy buttons */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-2">
        <div className="flex gap-1">
          <Button
            variant={activeTab === 'template' ? 'primary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('template')}
            className="h-8"
          >
            Template
          </Button>
          {showPreambleTab && (
            <Button
              variant={activeTab === 'preamble' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('preamble')}
              className="h-8"
            >
              Preamble
            </Button>
          )}
        </div>

        <div className="flex gap-1">
          <CopyButton
            content={currentLeft}
            label="Left"
            runInfo={`Run: ${leftName} | Definition: ${leftDefName}`}
          />
          <CopyButton
            content={currentRight}
            label="Right"
            runInfo={`Run: ${rightName} | Definition: ${rightDefName}`}
          />
        </div>
      </div>

      {/* Identical definitions message */}
      {isIdentical && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex items-center gap-3">
          <FileText className="w-5 h-5 text-teal-600 flex-shrink-0" />
          <div>
            <div className="font-medium text-teal-800">Definitions are identical</div>
            <div className="text-sm text-teal-600">
              Both runs use the same definition content
            </div>
          </div>
        </div>
      )}

      {/* Monaco Diff Editor */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <DiffEditor
          height="500px"
          language="plaintext"
          original={currentLeft}
          modified={currentRight}
          options={DIFF_EDITOR_OPTIONS}
          theme="vs"
        />
      </div>
    </div>
  );
}
