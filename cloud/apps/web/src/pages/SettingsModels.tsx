import { ModelsPanel } from '../components/settings/models';

export function SettingsModels() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Models</h1>
      <ModelsPanel />
    </div>
  );
}
