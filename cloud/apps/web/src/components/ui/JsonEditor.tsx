import { useRef, useEffect } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor, IDisposable, Uri } from 'monaco-editor';

/**
 * JSON Schema for LLM Model API Config
 * This schema provides IntelliSense and validation for the apiConfig field.
 *
 * Provider support matrix:
 * | Setting          | OpenAI | Anthropic | Google | xAI | DeepSeek | Mistral |
 * |------------------|--------|-----------|--------|-----|----------|---------|
 * | temperature      |   ✓    |     ✓     |   ✓    |  ✓  |    ✓     |    ✓    |
 * | maxTokens        |   ✓    |     ✓     |   ✓    |  ✓  |    ✓     |    ✓    |
 * | maxTokensParam   |   ✓    |     -     |   -    |  -  |    -     |    -    |
 * | topP             |   ✓    |     ✓     |   ✓    |  ✓  |    ✓     |    ✓    |
 * | frequencyPenalty |   ✓    |     -     |   -    |  ✓  |    ✓     |    -    |
 * | presencePenalty  |   ✓    |     -     |   -    |  ✓  |    ✓     |    -    |
 * | stopSequences    |   ✓    |     ✓     |   ✓    |  ✓  |    ✓     |    ✓    |
 */
const API_CONFIG_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'LLM Model API Configuration',
  description: 'Provider-specific configuration for LLM model API calls',
  type: 'object',
  properties: {
    temperature: {
      type: 'number',
      minimum: 0,
      maximum: 2,
      description:
        'Sampling temperature (0-2). Lower = more deterministic, higher = more creative. Default is 0.7. Supported by all providers.',
    },
    maxTokens: {
      oneOf: [
        { type: 'integer', minimum: 1 },
        { type: 'null' },
      ],
      description:
        'Maximum tokens to generate. Set to null for unlimited (provider default). Supported by all providers.',
    },
    maxTokensParam: {
      type: 'string',
      description:
        'OpenAI only: Parameter name for max tokens. Use "max_completion_tokens" for newer models (o1, o3, gpt-4.1). Default is "max_tokens".',
      examples: ['max_tokens', 'max_completion_tokens'],
    },
    topP: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description:
        'Top-p (nucleus sampling) parameter (0-1). Supported by all providers.',
    },
    frequencyPenalty: {
      type: 'number',
      minimum: -2,
      maximum: 2,
      description:
        'Frequency penalty (-2 to 2). Supported by: OpenAI, xAI, DeepSeek. NOT supported by: Anthropic, Google, Mistral.',
    },
    presencePenalty: {
      type: 'number',
      minimum: -2,
      maximum: 2,
      description:
        'Presence penalty (-2 to 2). Supported by: OpenAI, xAI, DeepSeek. NOT supported by: Anthropic, Google, Mistral.',
    },
    stopSequences: {
      type: 'array',
      items: { type: 'string' },
      description: 'Stop sequences to end generation. Supported by all providers.',
    },
  },
  additionalProperties: true,
};

type JsonEditorProps = {
  value: string;
  onChange: (value: string) => void;
  onValidationChange?: (isValid: boolean, error: string | null) => void;
  disabled?: boolean;
  placeholder?: string;
  height?: string;
};

export function JsonEditor({
  value,
  onChange,
  onValidationChange,
  disabled = false,
  placeholder,
  height = '120px',
}: JsonEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const disposablesRef = useRef<IDisposable[]>([]);
  const schemaConfiguredRef = useRef(false);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure JSON schema validation only once
    if (!schemaConfiguredRef.current) {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [
          {
            uri: 'http://valuerank.ai/schemas/api-config.json',
            fileMatch: ['*'],
            schema: API_CONFIG_SCHEMA,
          },
        ],
        enableSchemaRequest: false,
        allowComments: false,
        trailingCommas: 'error',
      });
      schemaConfiguredRef.current = true;
    }

    // Listen for validation markers to report errors
    const model = editor.getModel();
    if (model) {
      const checkMarkers = () => {
        const markers = monaco.editor.getModelMarkers({ resource: model.uri });
        const errors = markers.filter(
          (m: editor.IMarkerData) => m.severity === monaco.MarkerSeverity.Error
        );
        if (onValidationChange) {
          if (errors.length > 0) {
            onValidationChange(false, errors[0]?.message ?? 'Invalid JSON');
          } else {
            onValidationChange(true, null);
          }
        }
      };

      // Check markers after a delay to allow Monaco to validate
      const markerListener = monaco.editor.onDidChangeMarkers((uris: readonly Uri[]) => {
        if (uris.some((uri: Uri) => uri.toString() === model.uri.toString())) {
          checkMarkers();
        }
      });
      disposablesRef.current.push(markerListener);

      // Initial check after mount
      setTimeout(checkMarkers, 100);
    }
  };

  const handleChange = (newValue: string | undefined) => {
    const val = newValue ?? '';
    onChange(val);

    // Also do a quick JSON parse check for immediate feedback
    if (val.trim() === '') {
      onValidationChange?.(true, null);
      return;
    }

    try {
      JSON.parse(val);
      // Monaco will handle schema validation, but at least JSON is valid
    } catch {
      onValidationChange?.(false, 'Invalid JSON syntax');
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disposablesRef.current.forEach((d) => d.dispose());
      disposablesRef.current = [];
    };
  }, []);

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-transparent">
      <Editor
        height={height}
        language="json"
        value={value}
        onChange={handleChange}
        onMount={handleEditorMount}
        options={{
          readOnly: disabled,
          minimap: { enabled: false },
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 8,
          lineNumbersMinChars: 0,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          wrappingIndent: 'same',
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
          padding: { top: 8, bottom: 8 },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          overviewRulerBorder: false,
          scrollbar: {
            vertical: 'auto',
            horizontal: 'hidden',
            verticalScrollbarSize: 8,
          },
          quickSuggestions: true,
          suggestOnTriggerCharacters: true,
          occurrencesHighlight: 'off',
          selectionHighlight: false,
          renderLineHighlight: 'none',
          tabSize: 2,
          automaticLayout: true,
          // Show validation markers (red squiggles)
          renderValidationDecorations: 'on',
        }}
      />
      {placeholder && !value && (
        <div className="absolute top-2 left-3 text-gray-400 text-sm pointer-events-none font-mono">
          {placeholder}
        </div>
      )}
    </div>
  );
}
