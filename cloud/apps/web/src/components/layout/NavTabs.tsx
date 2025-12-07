import { NavLink } from 'react-router-dom';
import { FileText, Play, FlaskConical, Settings } from 'lucide-react';

const tabs = [
  { name: 'Definitions', path: '/definitions', icon: FileText },
  { name: 'Runs', path: '/runs', icon: Play },
  { name: 'Experiments', path: '/experiments', icon: FlaskConical },
  { name: 'Settings', path: '/settings', icon: Settings },
];

export function NavTabs() {
  return (
    <nav className="bg-[#1A1A1A] border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={({ isActive }) =>
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
