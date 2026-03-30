import { SystemHealth } from '../components/settings/SystemHealth';

export function SettingsSystemHealth() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">System Health</h1>
      <SystemHealth />
    </div>
  );
}
