import { useState, useEffect, useImperativeHandle, forwardRef, useRef } from 'react';
import { scenarios, generator } from '../lib/api';
import { FolderOpen, FileText, ChevronRight, ChevronDown, Plus, Wand2, Trash2 } from 'lucide-react';

interface FolderContents {
  files: string[];
  definitions: string[];
}

interface ScenarioListProps {
  onSelectYaml: (folder: string, file: string) => void;
  onSelectDefinition: (folder: string, name: string, isNew: boolean) => void;
  onCreateNew: (folder: string) => void;
  onDeleteFile?: (folder: string, file: string) => void;
  selectedFolder?: string;
  selectedFile?: string;
}

export interface ScenarioListHandle {
  refreshFolder: (folder: string) => Promise<void>;
}

export const ScenarioList = forwardRef<ScenarioListHandle, ScenarioListProps>(
  function ScenarioList(
    { onSelectYaml, onSelectDefinition, onCreateNew, onDeleteFile, selectedFolder, selectedFile },
    ref
  ) {
    const [folders, setFolders] = useState<string[]>([]);
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [folderContents, setFolderContents] = useState<Record<string, FolderContents>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Track expanded folders to know which ones to refresh
    const expandedFoldersRef = useRef(expandedFolders);
    expandedFoldersRef.current = expandedFolders;

    useEffect(() => {
      loadFolders();
    }, []);

    // Set up directory watcher
    useEffect(() => {
      const cleanup = scenarios.watchDirectory(
        () => {
          // Connected - no action needed
        },
        (changedFolder) => {
          if (changedFolder === null) {
            // Root-level change (new folder added/removed)
            loadFolders();
          } else {
            // File change in a specific folder - refresh if expanded
            if (expandedFoldersRef.current.has(changedFolder)) {
              loadFolderContents(changedFolder);
            }
          }
        },
        (error) => {
          console.error('Directory watcher error:', error);
        }
      );

      return cleanup;
    }, []);

    const loadFolders = async () => {
      try {
        setLoading(true);
        const { folders } = await scenarios.getFolders();
        setFolders(folders);
        setError(null);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    };

    const loadFolderContents = async (folder: string) => {
      try {
        const contents = await scenarios.getFiles(folder);
        setFolderContents((prev) => ({ ...prev, [folder]: contents }));
      } catch (e) {
        setError(`Failed to load files: ${e}`);
      }
    };

    const toggleFolder = async (folder: string) => {
      const newExpanded = new Set(expandedFolders);
      if (newExpanded.has(folder)) {
        newExpanded.delete(folder);
      } else {
        newExpanded.add(folder);
        if (!folderContents[folder]) {
          await loadFolderContents(folder);
        }
      }
      setExpandedFolders(newExpanded);
    };

    const handleDeleteFile = async (folder: string, file: string, isDefinition: boolean) => {
      const confirmed = confirm(`Are you sure you want to delete "${file}"?`);
      if (!confirmed) return;

      try {
        if (isDefinition) {
          const name = file.replace(/\.md$/, '');
          await generator.deleteDefinition(folder, name);
        } else {
          await scenarios.deleteFile(folder, file);
        }
        // Notify parent that file was deleted (e.g., to clear selection if this file was selected)
        onDeleteFile?.(folder, file);
        // Refresh the folder contents
        await loadFolderContents(folder);
      } catch (e) {
        setError(`Failed to delete file: ${e}`);
      }
    };

    // Expose refresh method via ref
    useImperativeHandle(ref, () => ({
      refreshFolder: async (folder: string) => {
        await loadFolderContents(folder);
        // Also expand the folder if not already
        setExpandedFolders((prev) => new Set([...prev, folder]));
      },
    }));

    if (loading) {
      return <div className="p-4 text-gray-500">Loading scenarios...</div>;
    }

    if (error) {
      return (
        <div className="p-4 text-red-500">
          Error: {error}
          <button onClick={loadFolders} className="ml-2 text-blue-500 underline">
            Retry
          </button>
        </div>
      );
    }

    return (
      <div className="h-full overflow-auto">
        <div className="p-3 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-700">Scenarios</h2>
          <button
            className="p-1 hover:bg-gray-100 rounded"
            title="Create new folder"
            onClick={async () => {
              const name = prompt('Enter folder name:');
              if (name) {
                await scenarios.createFolder(name);
                loadFolders();
              }
            }}
          >
            <Plus size={16} />
          </button>
        </div>

        <div className="p-2">
          {folders.map((folder) => {
            const contents = folderContents[folder];
            const isExpanded = expandedFolders.has(folder);

            return (
              <div key={folder}>
                {/* Folder Header */}
                <div className="flex items-center">
                  <button
                    className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded text-left hover:bg-gray-100 ${
                      selectedFolder === folder && !selectedFile ? 'bg-blue-50' : ''
                    }`}
                    onClick={() => toggleFolder(folder)}
                  >
                    {isExpanded ? (
                      <ChevronDown size={16} className="text-gray-400" />
                    ) : (
                      <ChevronRight size={16} className="text-gray-400" />
                    )}
                    <FolderOpen size={16} className="text-yellow-500" />
                    <span className="text-sm truncate flex-1" title={folder}>
                      {folder}
                    </span>
                  </button>
                  <button
                    className="p-1.5 hover:bg-purple-100 rounded mr-1"
                    title="New scenario definition"
                    onClick={(e) => {
                      e.stopPropagation();
                      onCreateNew(folder);
                    }}
                  >
                    <Plus size={14} className="text-purple-600" />
                  </button>
                </div>

                {/* Folder Contents */}
                {isExpanded && contents && (
                  <div className="ml-6">
                    {/* Definition files (.md) */}
                    {contents.definitions.map((file) => {
                      const name = file.replace(/\.md$/, '');
                      return (
                        <div key={file} className="group flex items-center">
                          <button
                            className={`flex-1 flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-gray-100 ${
                              selectedFolder === folder && selectedFile === file
                                ? 'bg-purple-100 text-purple-700'
                                : ''
                            }`}
                            onClick={() => onSelectDefinition(folder, name, false)}
                          >
                            <Wand2 size={14} className="text-purple-500" />
                            <span className="text-sm truncate" title={file}>
                              {file}
                            </span>
                          </button>
                          <button
                            className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-opacity"
                            title={`Delete ${file}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteFile(folder, file, true);
                            }}
                          >
                            <Trash2 size={14} className="text-red-500" />
                          </button>
                        </div>
                      );
                    })}

                    {/* YAML files */}
                    {contents.files.map((file) => (
                      <div key={file} className="group flex items-center">
                        <button
                          className={`flex-1 flex items-center gap-2 px-2 py-1 rounded text-left hover:bg-gray-100 ${
                            selectedFolder === folder && selectedFile === file
                              ? 'bg-blue-100 text-blue-700'
                              : ''
                          }`}
                          onClick={() => onSelectYaml(folder, file)}
                        >
                          <FileText size={14} className="text-gray-400" />
                          <span className="text-sm truncate" title={file}>
                            {file}
                          </span>
                        </button>
                        <button
                          className="p-1 opacity-0 group-hover:opacity-100 hover:bg-red-100 rounded transition-opacity"
                          title={`Delete ${file}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFile(folder, file, false);
                          }}
                        >
                          <Trash2 size={14} className="text-red-500" />
                        </button>
                      </div>
                    ))}

                    {contents.files.length === 0 && contents.definitions.length === 0 && (
                      <div className="px-2 py-1 text-sm text-gray-400 italic">Empty folder</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }
);
