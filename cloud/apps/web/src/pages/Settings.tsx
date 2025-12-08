import { useState } from 'react';
import { useQuery, useMutation } from 'urql';
import { Key, Plus, Trash2, Copy, Check, AlertTriangle } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Loading } from '../components/ui/Loading';
import { EmptyState } from '../components/ui/EmptyState';
import { ErrorMessage } from '../components/ui/ErrorMessage';
import { SystemHealth } from '../components/settings/SystemHealth';
import {
  API_KEYS_QUERY,
  CREATE_API_KEY_MUTATION,
  REVOKE_API_KEY_MUTATION,
  ApiKeysQueryResult,
  CreateApiKeyResult,
  RevokeApiKeyResult,
  ApiKey,
} from '../api/operations/api-keys';

export function Settings() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKey | null>(null);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);

  const [{ data, fetching, error }, reexecuteQuery] = useQuery<ApiKeysQueryResult>({
    query: API_KEYS_QUERY,
  });

  const [, createApiKey] = useMutation<CreateApiKeyResult>(CREATE_API_KEY_MUTATION);
  const [, revokeApiKey] = useMutation<RevokeApiKeyResult>(REVOKE_API_KEY_MUTATION);

  const handleCreateKey = async (name: string) => {
    const result = await createApiKey({ input: { name } });
    if (result.data?.createApiKey.key) {
      setNewlyCreatedKey(result.data.createApiKey.key);
      setIsCreateModalOpen(false);
      reexecuteQuery({ requestPolicy: 'network-only' });
    }
  };

  const handleRevokeKey = async (id: string) => {
    await revokeApiKey({ id });
    setKeyToRevoke(null);
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Settings</h1>

      {/* System Health Section */}
      <SystemHealth />

      {/* API Keys Section */}
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium text-gray-900">API Keys</h2>
            <p className="text-sm text-gray-500 mt-1">
              Manage API keys for MCP server access
            </p>
          </div>
          <Button
            onClick={() => setIsCreateModalOpen(true)}
            variant="primary"
            size="sm"
          >
            <Plus className="w-4 h-4 mr-1" />
            Create Key
          </Button>
        </div>

        <div className="px-6 py-4">
          {fetching && <Loading text="Loading API keys..." />}

          {error && (
            <ErrorMessage
              message={error.message}
              onRetry={() => reexecuteQuery({ requestPolicy: 'network-only' })}
            />
          )}

          {!fetching && !error && data?.apiKeys.length === 0 && (
            <EmptyState
              icon={Key}
              title="No API keys"
              description="Create an API key to authenticate with the MCP server"
              action={{
                label: 'Create API Key',
                onClick: () => setIsCreateModalOpen(true),
              }}
            />
          )}

          {!fetching && !error && data && data.apiKeys.length > 0 && (
            <ApiKeysList
              keys={data.apiKeys}
              onRevoke={(key) => setKeyToRevoke(key)}
            />
          )}
        </div>
      </section>

      {/* Newly Created Key Banner */}
      {newlyCreatedKey && (
        <NewKeyBanner
          keyValue={newlyCreatedKey}
          onDismiss={() => setNewlyCreatedKey(null)}
        />
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <CreateKeyModal
          onClose={() => setIsCreateModalOpen(false)}
          onCreate={handleCreateKey}
        />
      )}

      {/* Revoke Confirmation Dialog */}
      {keyToRevoke && (
        <RevokeConfirmDialog
          keyName={keyToRevoke.name}
          onConfirm={() => handleRevokeKey(keyToRevoke.id)}
          onCancel={() => setKeyToRevoke(null)}
        />
      )}
    </div>
  );
}

// API Keys List Component
function ApiKeysList({
  keys,
  onRevoke,
}: {
  keys: ApiKey[];
  onRevoke: (key: ApiKey) => void;
}) {
  return (
    <div className="divide-y divide-gray-100">
      {keys.map((key) => (
        <div key={key.id} className="py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center">
              <Key className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <p className="font-medium text-gray-900">{key.name}</p>
              <p className="text-sm text-gray-500">
                {key.keyPrefix}... · Created {formatDate(key.createdAt)}
                {key.lastUsedAt && ` · Last used ${formatDate(key.lastUsedAt)}`}
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRevoke(key)}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ))}
    </div>
  );
}

// New Key Banner Component
function NewKeyBanner({
  keyValue,
  onDismiss,
}: {
  keyValue: string;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(keyValue);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
        <div className="flex items-center gap-2 text-green-600 mb-4">
          <Check className="w-5 h-5" />
          <h3 className="font-medium">API Key Created</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          Copy your API key now. You won't be able to see it again!
        </p>
        <div className="flex items-center gap-2 bg-gray-100 p-3 rounded-lg font-mono text-sm">
          <code className="flex-1 break-all">{keyValue}</code>
          <button
            onClick={handleCopy}
            className="p-2 hover:bg-gray-200 rounded transition-colors"
            title="Copy to clipboard"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-600" />
            ) : (
              <Copy className="w-4 h-4 text-gray-600" />
            )}
          </button>
        </div>
        <div className="mt-6 flex justify-end">
          <Button onClick={onDismiss} variant="primary">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

// Create Key Modal Component
function CreateKeyModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setIsCreating(true);
    await onCreate(name.trim());
    setIsCreating(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">
          Create API Key
        </h3>
        <form onSubmit={handleSubmit}>
          <Input
            label="Key Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., MCP Server Production"
            autoFocus
          />
          <div className="mt-6 flex justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!name.trim() || isCreating}
              isLoading={isCreating}
            >
              Create Key
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Revoke Confirmation Dialog
function RevokeConfirmDialog({
  keyName,
  onConfirm,
  onCancel,
}: {
  keyName: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [isRevoking, setIsRevoking] = useState(false);

  const handleConfirm = async () => {
    setIsRevoking(true);
    await onConfirm();
    setIsRevoking(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
        <div className="flex items-center gap-3 text-red-600 mb-4">
          <AlertTriangle className="w-6 h-6" />
          <h3 className="text-lg font-medium">Revoke API Key</h3>
        </div>
        <p className="text-gray-600 mb-6">
          Are you sure you want to revoke <strong>"{keyName}"</strong>? This
          action cannot be undone and any services using this key will stop
          working.
        </p>
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onCancel} disabled={isRevoking}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            isLoading={isRevoking}
          >
            Revoke Key
          </Button>
        </div>
      </div>
    </div>
  );
}

// Date formatter helper
function formatDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}
