import { CheckCircle2, XCircle, AlertCircle, Loader2 } from 'lucide-react';
import type { ProviderHealthStatus } from '../../api/operations/health';

// Provider icons/colors
const PROVIDER_COLORS: Record<string, string> = {
  openai: 'bg-green-100 text-green-700',
  anthropic: 'bg-amber-100 text-amber-700',
  google: 'bg-blue-100 text-blue-700',
  xai: 'bg-gray-100 text-gray-700',
  deepseek: 'bg-indigo-100 text-indigo-700',
  mistral: 'bg-orange-100 text-orange-700',
};

type ProviderStatusProps = {
  providers: ProviderHealthStatus[];
  loading?: boolean;
};

function StatusIcon({ configured, connected, loading }: { configured: boolean; connected: boolean; loading?: boolean }) {
  if (loading) {
    return <Loader2 className="w-5 h-5 text-gray-400 animate-spin" />;
  }

  if (!configured) {
    return (
      <span title="Not configured">
        <AlertCircle className="w-5 h-5 text-gray-400" />
      </span>
    );
  }

  if (connected) {
    return (
      <span title="Connected">
        <CheckCircle2 className="w-5 h-5 text-green-500" />
      </span>
    );
  }

  return (
    <span title="Connection failed">
      <XCircle className="w-5 h-5 text-red-500" />
    </span>
  );
}

function ProviderItem({
  provider,
  loading,
}: {
  provider: ProviderHealthStatus;
  loading?: boolean;
}) {
  const colorClass = PROVIDER_COLORS[provider.id] ?? 'bg-gray-100 text-gray-700';

  return (
    <div className="flex items-center justify-between py-3 px-4 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${colorClass}`}>
          {provider.name.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <p className="font-medium text-gray-900">{provider.name}</p>
          <p className="text-xs text-gray-500">
            {provider.configured ? (
              provider.connected ? 'Connected' : provider.error ?? 'Connection failed'
            ) : (
              'API key not configured'
            )}
          </p>
        </div>
      </div>
      <StatusIcon configured={provider.configured} connected={provider.connected} loading={loading} />
    </div>
  );
}

export function ProviderStatus({ providers, loading }: ProviderStatusProps) {
  const configuredCount = providers.filter((p) => p.configured).length;
  const connectedCount = providers.filter((p) => p.connected).length;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900">LLM Providers</h3>
        <span className="text-xs text-gray-500">
          {connectedCount}/{configuredCount} connected
        </span>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {providers.map((provider) => (
          <ProviderItem key={provider.id} provider={provider} loading={loading} />
        ))}
      </div>
    </div>
  );
}
