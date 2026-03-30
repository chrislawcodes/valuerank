import { AccountPanel } from '../components/settings/AccountPanel';

export function SettingsAccount() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Account</h1>
      <AccountPanel />
    </div>
  );
}
