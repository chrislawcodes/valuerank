import { useLocation, useNavigate } from 'react-router-dom';
import { Tabs } from '../ui/Tabs';

type DomainAnalysisTabsProps = {
  activeTab: 'analysis' | 'assumptions';
};

const TAB_CONFIG = {
  analysis: '/domains/analysis',
  assumptions: '/assumptions',
} as const;

export function DomainAnalysisTabs({ activeTab }: DomainAnalysisTabsProps) {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <Tabs
      tabs={[
        { id: 'analysis', label: 'Value Analysis' },
        { id: 'assumptions', label: 'Assumptions' },
      ]}
      activeTab={activeTab}
      onChange={(nextTab) => {
        const target = TAB_CONFIG[nextTab as keyof typeof TAB_CONFIG];
        if (!target) return;
        navigate(`${target}${location.search}`);
      }}
    />
  );
}
