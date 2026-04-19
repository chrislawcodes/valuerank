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
            value={minScenarios}
            onChange={(event) => onMinScenariosChange(Math.max(1, Number(event.target.value) || 1))}
            className="h-11 w-full rounded-lg border border-gray-300 px-3 text-sm text-gray-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/20"
          />
        </label>
      </div>
    </section>
  );
}
