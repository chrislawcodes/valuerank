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

const PROVIDER_USAGE_DASHBOARD_URLS: Record<string, string> = {
  openai: 'https://platform.openai.com/usage',
  anthropic: 'https://console.anthropic.com/settings/cost',
  google: 'https://console.cloud.google.com/billing',
  xai: 'https://console.x.ai/',
  deepseek: 'https://platform.deepseek.com/top_up',
  mistral: 'https://console.mistral.ai/billing/',
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
  const usageDashboardUrl = PROVIDER_USAGE_DASHBOARD_URLS[provider.id];
  const hasBudget = typeof provider.remainingBudgetUsd === 'number' && Number.isFinite(provider.remainingBudgetUsd);

  return (
    <div className="grid grid-cols-[minmax(220px,1fr)_160px_220px] items-center gap-4 py-3 px-4 border-b border-gray-100 last:border-b-0">
      <div className="flex items-center gap-3">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${colorClass} flex-shrink-0`}>
          {provider.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-gray-900 truncate">{provider.name}</p>
          <p className="text-xs text-gray-500">
            {provider.configured ? (
              provider.connected ? 'Connected' : provider.error ?? 'Connection failed'
            ) : (
              'API key not configured'
            )}
          </p>
        </div>
      </div>

      <div className="flex items-center">
        <StatusIcon configured={provider.configured} connected={provider.connected} loading={loading} />
      </div>

      <div className="text-sm text-gray-700">
        {hasBudget ? (
          <span className="font-medium">
            ${provider.remainingBudgetUsd!.toFixed(2)}
          </span>
        ) : usageDashboardUrl ? (
          <a
            href={usageDashboardUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-700 hover:text-teal-800 underline"
          >
            Usage dashboard
          </a>
        ) : (
          <span className="text-gray-500">Unavailable</span>
        )}
      </div>
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
        <div className="grid grid-cols-[minmax(220px,1fr)_160px_220px] gap-4 px-4 py-2 bg-gray-50 border-b border-gray-200 text-xs font-medium uppercase tracking-wide text-gray-600">
          <span>Provider</span>
          <span>Status</span>
          <span>Remaining Budget</span>
        </div>
        {providers.map((provider) => (
          <ProviderItem key={provider.id} provider={provider} loading={loading} />
        ))}
      </div>
    </div>
  );
}
