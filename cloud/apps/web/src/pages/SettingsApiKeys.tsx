import { ApiKeysPanel } from '../components/settings/ApiKeysPanel';

export function SettingsApiKeys() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">API Keys</h1>
      <ApiKeysPanel />
    </div>
  );
}
