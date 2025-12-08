/**
 * TranscriptViewer Component
 *
 * Displays the full content of a transcript in a modal or expanded view.
 */

import { X, User, Bot, Clock, Hash, Zap } from 'lucide-react';
import { Button } from '../ui/Button';
import type { Transcript } from '../../api/operations/runs';

type TranscriptViewerProps = {
  transcript: Transcript;
  onClose: () => void;
};

type Turn = {
  role: 'user' | 'assistant';
  content: string;
};

type TranscriptContent = {
  turns: Turn[];
  preamble?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Parse transcript content from unknown type.
 * Handles both standard role/content format and worker schema (probePrompt/targetResponse).
 */
function parseTranscriptContent(content: unknown): TranscriptContent {
  if (!content || typeof content !== 'object') {
    return { turns: [] };
  }

  const data = content as Record<string, unknown>;
  const turns: Turn[] = [];

  if (Array.isArray(data.turns)) {
    for (const turn of data.turns) {
      if (!turn || typeof turn !== 'object') continue;

      // Handle standard role/content format
      if ('role' in turn && 'content' in turn) {
        turns.push({
          role: turn.role as 'user' | 'assistant',
          content: String(turn.content),
        });
      }
      // Handle worker schema format (probePrompt/targetResponse)
      else if ('probePrompt' in turn || 'targetResponse' in turn) {
        const t = turn as { probePrompt?: string; targetResponse?: string };
        if (t.probePrompt) {
          turns.push({
            role: 'user',
            content: t.probePrompt,
          });
        }
        if (t.targetResponse) {
          turns.push({
            role: 'assistant',
            content: t.targetResponse,
          });
        }
      }
    }
  }

  return {
    turns,
    preamble: typeof data.preamble === 'string' ? data.preamble : undefined,
    metadata: data.metadata as Record<string, unknown> | undefined,
  };
}

/**
 * Format duration in ms to human readable.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.round(ms / 100) / 10;
  return `${seconds}s`;
}

export function TranscriptViewer({ transcript, onClose }: TranscriptViewerProps) {
  const content = parseTranscriptContent(transcript.content);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-medium text-gray-900">
              Transcript
            </h2>
            <p className="text-sm text-gray-500">
              {transcript.modelId}
              {transcript.modelVersion && ` (${transcript.modelVersion})`}
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Metadata bar */}
        <div className="flex items-center gap-6 px-4 py-3 bg-gray-50 border-b border-gray-200 text-sm text-gray-600">
          <span className="flex items-center gap-1">
            <Hash className="w-4 h-4" />
            {transcript.turnCount} turn{transcript.turnCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <Zap className="w-4 h-4" />
            {transcript.tokenCount.toLocaleString()} tokens
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {formatDuration(transcript.durationMs)}
          </span>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Preamble if present */}
          {content.preamble && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <h3 className="text-sm font-medium text-amber-800 mb-2">System Preamble</h3>
              <p className="text-sm text-amber-900 whitespace-pre-wrap">{content.preamble}</p>
            </div>
          )}

          {/* Conversation turns */}
          {content.turns.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No conversation turns found
            </div>
          ) : (
            <div className="space-y-4">
              {content.turns.map((turn, index) => (
                <div
                  key={index}
                  className={`flex gap-3 ${
                    turn.role === 'user' ? '' : ''
                  }`}
                >
                  <div
                    className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      turn.role === 'user'
                        ? 'bg-gray-100 text-gray-600'
                        : 'bg-teal-100 text-teal-600'
                    }`}
                  >
                    {turn.role === 'user' ? (
                      <User className="w-4 h-4" />
                    ) : (
                      <Bot className="w-4 h-4" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="text-xs font-medium text-gray-500 mb-1">
                      {turn.role === 'user' ? 'User' : 'Assistant'}
                    </div>
                    <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-800 whitespace-pre-wrap">
                      {turn.content}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
