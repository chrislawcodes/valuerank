import { NavLink, useLocation } from 'react-router-dom';
import { FileText, GitCompare, ClipboardList, Settings, FolderTree, ChevronDown } from 'lucide-react';

const tabs = [
  { name: 'Domains', path: '/domains', icon: FolderTree },
  { name: 'Compare', path: '/compare', icon: GitCompare },
  { name: 'Survey', path: '/survey', icon: ClipboardList },
  { name: 'Survey Results', path: '/survey-results', icon: ClipboardList },
  { name: 'Settings', path: '/settings', icon: Settings },
];

const vignetteMenuItems = [
  { name: 'List', path: '/definitions' },
  { name: 'Preambles', path: '/preambles' },
  { name: 'Trials', path: '/runs' },
  { name: 'Analysis', path: '/analysis' },
];

export function NavTabs() {
  const location = useLocation();

  // Check if the current path matches or is a child of the tab path
  const isTabActive = (tabPath: string) => {
    return location.pathname === tabPath || location.pathname.startsWith(`${tabPath}/`);
  };
  const isVignettesActive = vignetteMenuItems.some((item) => isTabActive(item.path));

  return (
    // Hidden on mobile (< 640px), visible on tablet/desktop
    <nav className="hidden sm:block bg-[#1A1A1A] border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1">
          <div className="relative group">
            <NavLink
              to="/definitions"
              className={
                `flex items-center gap-2 px-4 py-3 min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isVignettesActive
                  ? 'text-white border-teal-500'
                  : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
                }`
              }
            >
              <FileText className="w-4 h-4" />
              <span className="hidden sm:inline">Vignettes</span>
              <ChevronDown className="w-4 h-4" />
            </NavLink>
            <div className="absolute left-0 top-full z-50 min-w-[180px] pt-1 opacity-0 invisible pointer-events-none transition-all duration-150 group-hover:opacity-100 group-hover:visible group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:visible group-focus-within:pointer-events-auto">
              <div className="rounded-md border border-gray-200 bg-white shadow-lg py-1">
                {vignetteMenuItems.map((item) => {
                  const isActive = isTabActive(item.path);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`block px-3 py-2 text-sm ${isActive ? 'bg-teal-50 text-teal-700' : 'text-gray-700 hover:bg-gray-50'}`}
                    >
                      {item.name}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </div>
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = isTabActive(tab.path);
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                className={
                  `flex items-center gap-2 px-4 py-3 min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isActive
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
