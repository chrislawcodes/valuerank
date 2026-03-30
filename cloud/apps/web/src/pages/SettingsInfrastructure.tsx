import { InfraPanel } from '../components/settings/infra';

export function SettingsInfrastructure() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Infrastructure</h1>
      <InfraPanel />
    </div>
  );
}
