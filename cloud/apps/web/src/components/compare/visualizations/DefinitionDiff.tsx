/**
 * Definition Diff Visualization (2 runs)
 *
 * Shows side-by-side Monaco diff editor comparing full definition content
 * in markdown format between exactly two runs.
 */

import { useState, useMemo } from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { FileText, Copy, Check } from 'lucide-react';
import { Button } from '../../ui/Button';
import type { RunWithAnalysis, DefinitionContent, DefinitionDimension } from '../types';
import { formatRunNameShort } from '../../../lib/format';

type DefinitionDiffProps = {
  leftRun: RunWithAnalysis;
  rightRun: RunWithAnalysis;
};

/**
 * Monaco diff editor options
 */
const DIFF_EDITOR_OPTIONS = {
  readOnly: true,
  renderSideBySide: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  lineNumbers: 'on' as const,
  fontSize: 13,
  automaticLayout: true,
  // Force word wrap on both sides consistently
  wordWrap: 'on' as const,
  diffWordWrap: 'on' as const,
  // Disable all highlighting
  renderValidationDecorations: 'off' as const,
  unicodeHighlight: {
    ambiguousCharacters: false,
    invisibleCharacters: false,
    nonBasicASCII: false,
  },
};

/**
 * Serialize a dimension to markdown table format
 */
function serializeDimension(dim: DefinitionDimension): string {
  const lines: string[] = [];
  lines.push(`## ${dim.name}`);
  lines.push('');

  if (dim.levels && dim.levels.length > 0) {
    lines.push('| Score | Label | Options |');
    lines.push('|-------|-------|---------|');

    const sortedLevels = [...dim.levels].sort((a, b) => a.score - b.score);
    for (const level of sortedLevels) {
      const options = level.options?.join(', ') || '';
      lines.push(`| ${level.score} | ${level.label} | ${options} |`);
    }
  } else if (dim.values && dim.values.length > 0) {
    // Legacy format
    lines.push('| Value |');
    lines.push('|-------|');
    for (const value of dim.values) {
      lines.push(`| ${value} |`);
    }
  } else {
    lines.push('(No values defined)');
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Convert definition content to markdown format for diff view
 */
function serializeDefinitionToMarkdown(
  content: DefinitionContent | undefined,
  definitionName: string
): string {
  if (!content) {
    return '(Vignette content not available)';
  }

  const lines: string[] = [];

  // Header with definition name
  lines.push(`# ${definitionName}`);
  lines.push('');

  // Preamble section
  lines.push('## Preamble');
  lines.push('');
  if (content.preamble && content.preamble.trim()) {
    lines.push(content.preamble);
  } else {
    lines.push('(No preamble defined)');
  }
  lines.push('');

  // Template section
  lines.push('## Template');
  lines.push('');
  if (content.template && content.template.trim()) {
    lines.push(content.template);
  } else {
    lines.push('(No template defined)');
  }
  lines.push('');

  // Dimensions section
  if (content.dimensions && content.dimensions.length > 0) {
    lines.push('# Dimensions');
    lines.push('');
    for (const dim of content.dimensions) {
      lines.push(serializeDimension(dim));
    }
  }

  // Matching Rules section
  if (content.matchingRules && content.matchingRules.trim()) {
    lines.push('# Matching Rules');
    lines.push('');
    lines.push(content.matchingRules);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Get definition content with fallback for missing data
 */
function getDefinitionMarkdown(run: RunWithAnalysis): string {
  const definitionName = run.definition?.name ?? 'Unknown Vignette';
  return serializeDefinitionToMarkdown(run.definitionContent, definitionName);
}

/**
 * Check if two definitions are identical
 */
function areDefinitionsIdentical(left: string, right: string): boolean {
  return left === right;
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
    try {
      const textWithHeader = `# ${runInfo}\n\n${content}`;
      await navigator.clipboard.writeText(textWithHeader);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access denied - silently fail
    }
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
  // Convert to markdown
  const leftMarkdown = useMemo(() => getDefinitionMarkdown(leftRun), [leftRun]);
  const rightMarkdown = useMemo(() => getDefinitionMarkdown(rightRun), [rightRun]);

  // Check if definitions are identical
  const isIdentical = useMemo(
    () => areDefinitionsIdentical(leftMarkdown, rightMarkdown),
    [leftMarkdown, rightMarkdown]
  );

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

      {/* Copy buttons */}
      <div className="flex items-center justify-end border-b border-gray-200 pb-2">
        <div className="flex gap-1">
          <CopyButton
            content={leftMarkdown}
            label="Left"
            runInfo={`Run: ${leftName} | Vignette: ${leftDefName}`}
          />
          <CopyButton
            content={rightMarkdown}
            label="Right"
            runInfo={`Run: ${rightName} | Vignette: ${rightDefName}`}
          />
        </div>
      </div>

      {/* Identical definitions message */}
      {isIdentical && (
        <div className="bg-teal-50 border border-teal-200 rounded-lg p-4 flex items-center gap-3">
          <FileText className="w-5 h-5 text-teal-600 flex-shrink-0" />
          <div>
            <div className="font-medium text-teal-800">Vignettes are identical</div>
            <div className="text-sm text-teal-600">
              Both runs use the same vignette content
            </div>
          </div>
        </div>
      )}

      {/* Monaco Diff Editor */}
      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <DiffEditor
          height="600px"
          language="plaintext"
          original={leftMarkdown}
          modified={rightMarkdown}
          options={DIFF_EDITOR_OPTIONS}
          theme="vs"
        />
      </div>
    </div>
  );
}
