import { Wand2 } from 'lucide-react';

interface YamlPreviewProps {
  name: string;
  generating: boolean;
  yaml: string | null;
}

export function YamlPreview({ name, generating, yaml }: YamlPreviewProps) {
  return (
    <div className="w-96 flex flex-col bg-gray-900">
      <div className="p-4 border-b border-gray-700">
        <h3 className="font-semibold text-white">Generated YAML</h3>
        <p className="text-xs text-gray-400 mt-1">{name}.yaml</p>
      </div>
      <div className="flex-1 overflow-auto p-4">
        {generating ? (
          <div className="flex items-center justify-center h-full text-gray-400">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-4"></div>
              <p>Generating scenarios...</p>
            </div>
          </div>
        ) : yaml ? (
          <pre className="text-sm text-gray-300 font-mono whitespace-pre-wrap">{yaml}</pre>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            <div className="text-center">
              <Wand2 size={48} className="mx-auto mb-4 opacity-30" />
              <p>Click "Generate YAML" to create scenarios</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
