import { Select } from '../ui/Select';

type Option = { value: string; label: string };

type ConsistencyFiltersProps = {
  domainId: string | null;
  providerId: string | null;
  minScenarios: number;
  domainOptions: Option[];
  providerOptions: Option[];
  onDomainChange: (value: string | null) => void;
  onProviderChange: (value: string | null) => void;
  onMinScenariosChange: (value: number) => void;
};

export function ConsistencyFilters({
  domainId,
  providerId,
  minScenarios,
  domainOptions,
  providerOptions,
  onDomainChange,
  onProviderChange,
  onMinScenariosChange,
}: ConsistencyFiltersProps) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap gap-4">
        <div className="min-w-[220px] flex-1">
          <Select
            label="Domain"
            value={domainId ?? 'all'}
            onChange={(value) => onDomainChange(value === 'all' ? null : value)}
            options={[{ value: 'all', label: 'All domains' }, ...domainOptions]}
          />
        </div>
        <div className="min-w-[220px] flex-1">
          <Select
            label="Provider"
            value={providerId ?? 'all'}
            onChange={(value) => onProviderChange(value === 'all' ? null : value)}
            options={[{ value: 'all', label: 'All providers' }, ...providerOptions]}
          />
        </div>
        <label className="min-w-[120px] flex-1">
          <span className="mb-1 block text-sm font-medium text-gray-700">Min n</span>
          <input
            type="number"
            min={1}
            step={1}
            value={minScenarios}
            onChange={(event) => {
              // GraphQL $minScenarios is Int; coerce to a positive integer so
              // fractional input (e.g. 5.5) does not produce a validation error.
              const parsed = Number.parseInt(event.target.value, 10);
              onMinScenariosChange(Number.isFinite(parsed) && parsed >= 1 ? parsed : 1);
            }}
            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
      </div>
    </section>
  );
}
