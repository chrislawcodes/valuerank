import { useState } from 'react';
import { Key, Cpu, Activity, Settings2 } from 'lucide-react';
import type { Tab } from '../components/ui/Tabs';
import { Tabs } from '../components/ui/Tabs';
import { SystemHealth } from '../components/settings/SystemHealth';
import { ApiKeysPanel } from '../components/settings/ApiKeysPanel';
import { ModelsPanel } from '../components/settings/ModelsPanel';
import { InfraPanel } from '../components/settings/InfraPanel';

const TABS: Tab[] = [
  { id: 'health', label: 'System Health', icon: <Activity className="w-4 h-4" /> },
  { id: 'models', label: 'Models', icon: <Cpu className="w-4 h-4" /> },
  { id: 'infra', label: 'Infrastructure', icon: <Settings2 className="w-4 h-4" /> },
  { id: 'api-keys', label: 'API Keys', icon: <Key className="w-4 h-4" /> },
];

export function Settings() {
  const [activeTab, setActiveTab] = useState('health');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-serif font-medium text-[#1A1A1A]">Settings</h1>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

      <div className="mt-6">
        {activeTab === 'health' && <SystemHealth />}
        {activeTab === 'models' && <ModelsPanel />}
        {activeTab === 'infra' && <InfraPanel />}
        {activeTab === 'api-keys' && <ApiKeysPanel />}
      </div>
    </div>
  );
}
