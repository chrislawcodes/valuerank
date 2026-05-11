import { useSearchParams } from 'react-router-dom';
import { ActiveEvaluationsSection } from '../components/status/ActiveEvaluationsSection';
import { HeartbeatStrip } from '../components/status/HeartbeatStrip';
import { OpenAnomaliesSection } from '../components/status/OpenAnomaliesSection';
import { StandaloneActiveRunsSection } from '../components/status/StandaloneActiveRunsSection';
import { StatusFilters } from '../components/status/StatusFilters';

const POLL_MS = 5000;

export function Status() {
  const [searchParams] = useSearchParams();
  const domainId = searchParams.get('domain');
  const typeFilter = searchParams.get('type');
  const normalizedDomainId = domainId != null && domainId.trim() !== '' ? domainId : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Status</h1>
      <StatusFilters />
      <HeartbeatStrip domainId={normalizedDomainId} />
      <OpenAnomaliesSection domainId={normalizedDomainId} type={typeFilter} pollIntervalMs={POLL_MS} />
      <ActiveEvaluationsSection domainId={normalizedDomainId} pollIntervalMs={POLL_MS} />
      <StandaloneActiveRunsSection pollIntervalMs={POLL_MS} />
    </div>
  );
}
