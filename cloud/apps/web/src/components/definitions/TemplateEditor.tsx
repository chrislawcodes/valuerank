import { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Editor, { type Monaco, type OnMount } from '@monaco-editor/react';
import type { editor, IDisposable, Position, languages } from 'monaco-editor';

type TemplateEditorProps = {
  value: string;
  dimensions: string[];
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
};

export type TemplateEditorHandle = {
  insertAtCursor: (text: string) => void;
  focus: () => void;
};

// Custom language ID for our template syntax
const LANGUAGE_ID = 'scenario-template';

export const TemplateEditor = forwardRef<TemplateEditorHandle, TemplateEditorProps>(
  function TemplateEditor({ value, dimensions, onChange, disabled = false, placeholder }, ref) {
    const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
    const monacoRef = useRef<Monaco | null>(null);
    const disposablesRef = useRef<IDisposable[]>([]);
    const dimensionsRef = useRef<string[]>(dimensions);

    // Keep dimensions ref updated for autocomplete provider
    dimensionsRef.current = dimensions;

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      insertAtCursor: (text: string) => {
        const editor = editorRef.current;
        if (!editor) return;

        const selection = editor.getSelection();
        if (!selection) return;

        editor.executeEdits('insert-dimension', [
          {
            range: selection,
            text,
            forceMoveMarkers: true,
          },
        ]);

        editor.focus();
      },
      focus: () => {
        editorRef.current?.focus();
      },
    }));

    // Update markers when dimensions or value change
    useEffect(() => {
      if (editorRef.current && monacoRef.current) {
        updateMarkers(editorRef.current, monacoRef.current, value, dimensions);
      }
    }, [dimensions, value]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleEditorMount: OnMount = (editor, monaco: any) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Register custom language if not already registered
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      if (!monaco.languages.getLanguages().some((lang: languages.ILanguageExtensionPoint) => lang.id === LANGUAGE_ID)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        monaco.languages.register({ id: LANGUAGE_ID });

        // Syntax highlighting - colorize [dimension] patterns
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
          tokenizer: {
            root: [
              [/\[[^\]]+\]/, 'dimension-placeholder'],
            ],
          },
        });

        // Define custom theme with teal colors matching the app
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        monaco.editor.defineTheme('scenario-template-theme', {
          base: 'vs',
          inherit: true,
          rules: [
            { token: 'dimension-placeholder', foreground: '0d9488', fontStyle: 'bold' },
          ],
          colors: {},
        });
      }

      // Set up autocomplete provider
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      const completionProvider = monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
        triggerCharacters: ['['],
        provideCompletionItems: (model: editor.ITextModel, position: Position) => {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });

          // Check if we're right after a [
          const match = textUntilPosition.match(/\[([^\]]*)$/);
          if (!match || match[1] === undefined) {
            return { suggestions: [] };
          }

          const partialText = match[1];
          const range = {
            startLineNumber: position.lineNumber,
            startColumn: position.column - partialText.length,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          };

          const suggestions = dimensionsRef.current.map((dim) => ({
            label: dim.toLowerCase(),
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            kind: monaco.languages.CompletionItemKind.Variable,
            insertText: dim.toLowerCase() + ']',
            range,
            detail: 'Dimension placeholder',
            documentation: `Insert [${dim.toLowerCase()}] dimension placeholder`,
          }));

          return { suggestions };
        },
      });

      disposablesRef.current.push(completionProvider);

      // Apply custom theme
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      monaco.editor.setTheme('scenario-template-theme');

      // Initial markers
      updateMarkers(editor, monaco, value, dimensions);
    };

    const updateMarkers = (
      editor: editor.IStandaloneCodeEditor,
      monaco: Monaco,
      content: string,
      dims: string[]
    ) => {
      const model = editor.getModel();
      if (!model) return;

      const markers: editor.IMarkerData[] = [];
      const dimNamesLower = dims.map((d) => d.toLowerCase());

      // Find all [placeholder] patterns
      const regex = /\[([^\]]+)\]/g;
      let match;

      while ((match = regex.exec(content)) !== null) {
        if (match[1] === undefined) continue;
        const placeholderName = match[1].toLowerCase();

        // Check if this placeholder matches a valid dimension
        if (!dimNamesLower.includes(placeholderName)) {
          const startIndex = match.index;
          const endIndex = startIndex + match[0].length;

          // Convert index to line/column
          const startPos = model.getPositionAt(startIndex);
          const endPos = model.getPositionAt(endIndex);

          const validDims = dims.length > 0 ? dims.join(', ') : '(none defined)';
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: `Unknown dimension: "${match[1]}". Valid dimensions: ${validDims}`,
            startLineNumber: startPos.lineNumber,
            startColumn: startPos.column,
            endLineNumber: endPos.lineNumber,
            endColumn: endPos.column,
          });
        }
      }

      monaco.editor.setModelMarkers(model, 'template-validation', markers);
    };

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        disposablesRef.current.forEach((d) => d.dispose());
        disposablesRef.current = [];
      };
    }, []);

    return (
      <div className="border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-teal-500 focus-within:border-transparent">
        <Editor
          height="160px"
          language={LANGUAGE_ID}
          value={value}
          onChange={(v) => onChange(v || '')}
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
            padding: { top: 12, bottom: 12 },
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
            placeholder,
          }}
        />
      </div>
    );
  }
);
