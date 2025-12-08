import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Code2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Loading } from '../ui/Loading';
import { ErrorMessage } from '../ui/ErrorMessage';
import { ProviderStatus } from './ProviderStatus';
import { QueueStatus } from './QueueStatus';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import type { WorkerHealth } from '../../api/operations/health';

type WorkerStatusProps = {
  worker: WorkerHealth;
  loading?: boolean;
};

function WorkerStatus({ worker, loading }: WorkerStatusProps) {
  const configuredProviders = worker.apiKeys
    ? Object.entries(worker.apiKeys)
        .filter(([, configured]) => configured)
        .map(([provider]) => provider)
    : [];

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-900 flex items-center gap-2">
          <Code2 className="w-4 h-4 text-gray-500" />
          Python Workers
        </h3>
        {worker.isHealthy ? (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
            <CheckCircle2 className="w-3 h-3" />
            Healthy
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
            <XCircle className="w-3 h-3" />
            Unhealthy
          </span>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {worker.error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-700">{worker.error}</p>
          </div>
        )}

        {worker.warnings.length > 0 && (
          <div className="mb-4 space-y-2">
            {worker.warnings.map((warning, index) => (
              <div key={index} className="flex items-start gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded-md">
                <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-yellow-700">{warning}</p>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          {worker.pythonVersion && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Python Version</span>
              <span className="font-mono text-gray-900">{worker.pythonVersion}</span>
            </div>
          )}

          {configuredProviders.length > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Configured Providers</span>
              <span className="text-gray-900">{configuredProviders.join(', ')}</span>
            </div>
          )}

          {worker.packages && Object.keys(worker.packages).length > 0 && (
            <div className="pt-3 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Installed Packages</p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(worker.packages).map(([name, version]) => (
                  <span
                    key={name}
                    className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-xs font-mono text-gray-700"
                  >
                    {name}@{version}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SystemHealth() {
  const { health, loading, error, refetch } = useSystemHealth();

  if (loading && !health) {
    return (
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">System Health</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor LLM providers, job queue, and worker status</p>
        </div>
        <div className="px-6 py-8">
          <Loading text="Checking system health..." />
        </div>
      </section>
    );
  }

  if (error && !health) {
    return (
      <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">System Health</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor LLM providers, job queue, and worker status</p>
        </div>
        <div className="px-6 py-4">
          <ErrorMessage message={error.message} onRetry={() => refetch(true)} />
        </div>
      </section>
    );
  }

  if (!health) {
    return null;
  }

  return (
    <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-medium text-gray-900">System Health</h2>
          <p className="text-sm text-gray-500 mt-1">Monitor LLM providers, job queue, and worker status</p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => refetch(true)}
          disabled={loading}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="px-6 py-4 space-y-6">
        <ProviderStatus providers={health.providers.providers} loading={loading} />
        <QueueStatus queue={health.queue} loading={loading} />
        <WorkerStatus worker={health.worker} loading={loading} />
      </div>
    </section>
  );
}
