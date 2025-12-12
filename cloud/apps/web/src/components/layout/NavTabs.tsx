import { NavLink, useLocation } from 'react-router-dom';
import { FileText, Play, BarChart2, FlaskConical, Settings } from 'lucide-react';

const tabs = [
  { name: 'Definitions', path: '/definitions', icon: FileText },
  { name: 'Runs', path: '/runs', icon: Play },
  { name: 'Analysis', path: '/analysis', icon: BarChart2 },
  { name: 'Experiments', path: '/experiments', icon: FlaskConical },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export function NavTabs() {
  const location = useLocation();

  // Check if the current path matches or is a child of the tab path
  const isTabActive = (tabPath: string) => {
    return location.pathname === tabPath || location.pathname.startsWith(`${tabPath}/`);
  };

  return (
    <nav className="bg-[#1A1A1A] border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab.path);
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={
                  `flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                    isActive
                      ? 'text-white border-teal-500'
                      : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span className="hidden sm:inline">{tab.name}</span>
              </NavLink>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
