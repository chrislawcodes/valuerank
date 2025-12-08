/**
 * ImportDialog Component
 *
 * Dialog for importing definitions from markdown files.
 * Features drag-and-drop file upload and validation error display.
 */

import { useState, useCallback, useRef } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { importDefinitionFromMd, ImportApiError } from '../../api/import';

type ImportDialogProps = {
  onClose: () => void;
  onSuccess: (definitionId: string, name: string) => void;
};

type ImportState = 'idle' | 'selected' | 'importing' | 'success' | 'error';

export function ImportDialog({ onClose, onSuccess }: ImportDialogProps) {
  const [state, setState] = useState<ImportState>('idle');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<Array<{ field: string; message: string }> | null>(null);
  const [alternativeName, setAlternativeName] = useState<string | null>(null);
  const [importedId, setImportedId] = useState<string | null>(null);
  const [importedName, setImportedName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File) => {
    if (!file.name.endsWith('.md')) {
      setError('Please select a markdown (.md) file');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFileContent(content);
      setFileName(file.name);
      setState('selected');
      setError(null);
      setErrorDetails(null);
      setAlternativeName(null);
    };
    reader.onerror = () => {
      setError('Failed to read file');
    };
    reader.readAsText(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile]
  );

  const handleImport = async (forceAlternativeName = false) => {
    if (!fileContent) return;

    setState('importing');
    setError(null);
    setErrorDetails(null);

    try {
      const result = await importDefinitionFromMd(fileContent, {
        name: nameOverride.trim() || undefined,
        forceAlternativeName,
      });

      setImportedId(result.id);
      setImportedName(result.name);
      setState('success');
    } catch (err) {
      setState('error');

      if (err instanceof ImportApiError) {
        setError(err.message);
        setErrorDetails(err.details || null);
        if (err.suggestions?.alternativeName) {
          setAlternativeName(err.suggestions.alternativeName);
        }
      } else {
        setError(err instanceof Error ? err.message : 'Import failed');
      }
    }
  };

  const handleGoToDefinition = () => {
    if (importedId && importedName) {
      onSuccess(importedId, importedName);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-25 transition-opacity"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative w-full max-w-lg transform overflow-hidden rounded-lg bg-white shadow-xl transition-all">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-teal-600" />
              <h2 className="text-lg font-medium text-gray-900">Import Definition</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-gray-400 hover:text-gray-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            {state === 'success' ? (
              // Success state
              <div className="text-center py-6">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">
                  Import Successful!
                </h3>
                <p className="text-gray-600 mb-6">
                  Definition &ldquo;{importedName}&rdquo; has been imported.
                </p>
                <Button variant="primary" onClick={handleGoToDefinition}>
                  Go to Definition
                </Button>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-600 mb-4">
                  Import a definition from a markdown (.md) file. The file should be in
                  devtool-compatible format with frontmatter and sections.
                </p>

                {/* Drop zone */}
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                    isDragging
                      ? 'border-teal-400 bg-teal-50'
                      : fileName
                        ? 'border-green-300 bg-green-50'
                        : 'border-gray-300 hover:border-gray-400'
                  }`}
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                >
                  {fileName ? (
                    <div className="flex items-center justify-center gap-2 text-green-700">
                      <FileText className="w-6 h-6" />
                      <span className="font-medium">{fileName}</span>
                    </div>
                  ) : (
                    <>
                      <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                      <p className="text-gray-600 mb-2">
                        Drag and drop a .md file here, or
                      </p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        Browse Files
                      </Button>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".md"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>

                {/* Name override (optional) */}
                {fileName && (
                  <div className="mt-4">
                    <Input
                      label="Name override (optional)"
                      value={nameOverride}
                      onChange={(e) => setNameOverride(e.target.value)}
                      placeholder="Leave blank to use name from file"
                      disabled={state === 'importing'}
                    />
                  </div>
                )}

                {/* Error display */}
                {error && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-red-800">{error}</p>
                        {errorDetails && errorDetails.length > 0 && (
                          <ul className="mt-2 text-sm text-red-700 list-disc list-inside">
                            {errorDetails.map((detail, i) => (
                              <li key={i}>
                                <strong>{detail.field}:</strong> {detail.message}
                              </li>
                            ))}
                          </ul>
                        )}
                        {alternativeName && (
                          <div className="mt-3">
                            <p className="text-sm text-red-700 mb-2">
                              Suggested alternative name: <strong>{alternativeName}</strong>
                            </p>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => handleImport(true)}
                              disabled={state === 'importing'}
                            >
                              Use Alternative Name
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          {state !== 'success' && (
            <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
              <Button variant="secondary" onClick={onClose} disabled={state === 'importing'}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => handleImport(false)}
                disabled={!fileContent || state === 'importing'}
                isLoading={state === 'importing'}
              >
                <Upload className="w-4 h-4 mr-2" />
                Import
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
