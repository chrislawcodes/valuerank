import { Select } from '../ui/Select';

type Option = { value: string; label: string };

type Props = {
  domainId: string | null;
  providerId: string | null;
  signature: string;
  domainOptions: Option[];
  providerOptions: Option[];
  signatureOptions: Option[];
  onDomainChange: (value: string | null) => void;
  onProviderChange: (value: string | null) => void;
  onSignatureChange: (value: string) => void;
};

export function PressureSensitivityFilters({
  domainId,
  providerId,
  signature,
  domainOptions,
  providerOptions,
  signatureOptions,
  onDomainChange,
  onProviderChange,
  onSignatureChange,
}: Props) {
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
            label="Signature"
            value={signature}
            onChange={(value) => onSignatureChange(value)}
            options={signatureOptions.length > 0 ? signatureOptions : [{ value: signature, label: signature }]}
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
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Domain and signature are URL-driven so deep links and the Models sub-tab nav stay in sync.
      </p>
    </section>
  );
}
