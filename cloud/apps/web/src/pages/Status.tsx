import { useSearchParams } from 'react-router-dom';
import { OpenAnomaliesSection } from '../components/status/OpenAnomaliesSection';

const POLL_MS = 5000;

export function Status() {
  const [searchParams] = useSearchParams();
  const domainId = searchParams.get('domain');
  const typeFilter = searchParams.get('type');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Status</h1>

      <OpenAnomaliesSection
        domainId={domainId}
        type={typeFilter}
        pollIntervalMs={POLL_MS}
      />

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-medium text-gray-900">Active Evaluations</h2>
        <p className="mt-2 text-sm text-gray-500">
          Wave 5 will surface live evaluation status here.
        </p>
      </section>
    </div>
  );
}
