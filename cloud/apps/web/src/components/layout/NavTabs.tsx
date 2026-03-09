import { type FocusEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { FileText, GitCompare, ClipboardList, Settings, FolderTree, ChevronDown, ShieldCheck } from 'lucide-react';
import { Button } from '../ui/Button';
import { useClickOutside } from '../../hooks/useClickOutside';

const tabs = [
  { name: 'Compare', path: '/compare', icon: GitCompare },
  { name: 'Settings', path: '/settings', icon: Settings },
];

const vignetteMenuItems = [
  { name: 'List', path: '/definitions' },
  { name: 'Preambles', path: '/preambles' },
  { name: 'Trials', path: '/runs' },
  { name: 'Analysis', path: '/analysis' },
];

const domainMenuItems = [
  { name: 'List', path: '/domains' },
  { name: 'Analysis', path: '/domains/analysis' },
  { name: 'Coverage', path: '/domains/coverage' },
];

const assumptionsMenuItems = [
  { name: 'Temp=0 Effect', path: '/assumptions/temp-zero-effect' },
  { name: 'Analysis', path: '/assumptions/analysis' },
  { name: 'Analysis (old v1)', path: '/assumptions/analysis-v1' },
];

const surveyMenuItems = [
  { name: 'Survey', path: '/survey' },
  { name: 'Survey Results', path: '/survey-results' },
];

export function NavTabs() {
  const location = useLocation();
  const [isVignettesMenuOpen, setIsVignettesMenuOpen] = useState(false);
  const [isDomainsMenuOpen, setIsDomainsMenuOpen] = useState(false);
  const [isAssumptionsMenuOpen, setIsAssumptionsMenuOpen] = useState(false);
  const [isSurveyMenuOpen, setIsSurveyMenuOpen] = useState(false);
  const vignetteMenuRef = useRef<HTMLDivElement>(null);
  const domainMenuRef = useRef<HTMLDivElement>(null);
  const assumptionsMenuRef = useRef<HTMLDivElement>(null);
  const surveyMenuRef = useRef<HTMLDivElement>(null);

  // Check if the current path matches or is a child of the tab path
  const isTabActive = (tabPath: string) => {
    return location.pathname === tabPath || location.pathname.startsWith(`${tabPath}/`);
  };
  const isVignettesActive = vignetteMenuItems.some((item) => isTabActive(item.path));
  const isDomainsActive = domainMenuItems.some((item) => isTabActive(item.path));
  const isAssumptionsActive = assumptionsMenuItems.some((item) => isTabActive(item.path));
  const isSurveyActive = surveyMenuItems.some((item) => isTabActive(item.path));

  useEffect(() => {
    setIsVignettesMenuOpen(false);
    setIsDomainsMenuOpen(false);
    setIsAssumptionsMenuOpen(false);
    setIsSurveyMenuOpen(false);
  }, [location.pathname]);

  useClickOutside(domainMenuRef, () => {
    if (isDomainsMenuOpen) setIsDomainsMenuOpen(false);
  }, isDomainsMenuOpen);
  useClickOutside(vignetteMenuRef, () => {
    if (isVignettesMenuOpen) setIsVignettesMenuOpen(false);
  }, isVignettesMenuOpen);
  useClickOutside(assumptionsMenuRef, () => {
    if (isAssumptionsMenuOpen) setIsAssumptionsMenuOpen(false);
  }, isAssumptionsMenuOpen);
  useClickOutside(surveyMenuRef, () => {
    if (isSurveyMenuOpen) setIsSurveyMenuOpen(false);
  }, isSurveyMenuOpen);

  const handleMenuFocus = (setOpen: (value: boolean) => void) => () => {
    setOpen(true);
  };

  const handleMenuBlur =
    (menuRef: RefObject<HTMLDivElement>, setOpen: (value: boolean) => void) =>
      (event: FocusEvent<HTMLDivElement>) => {
        const nextFocused = event.relatedTarget as Node | null;
        if (menuRef.current && nextFocused && menuRef.current.contains(nextFocused)) {
          return;
        }
        setOpen(false);
      };

  return (
    // Hidden on mobile (< 640px), visible on tablet/desktop
    <nav className="hidden sm:block bg-[#1A1A1A] border-t border-gray-800">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex gap-1">
          <div
            ref={vignetteMenuRef}
            className="relative group order-2"
            onMouseEnter={() => setIsVignettesMenuOpen(true)}
            onMouseLeave={() => setIsVignettesMenuOpen(false)}
            onFocus={handleMenuFocus(setIsVignettesMenuOpen)}
            onBlur={handleMenuBlur(vignetteMenuRef, setIsVignettesMenuOpen)}
          >
            <div
              className={
                `flex items-center min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isVignettesActive
                  ? 'text-white border-teal-500'
                  : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
                }`
              }
            >
              <NavLink to="/definitions" className="flex items-center gap-2 px-3 py-3">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Vignettes</span>
              </NavLink>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Toggle Vignettes menu"
                aria-haspopup="menu"
                aria-expanded={isVignettesMenuOpen}
                onClick={() => setIsVignettesMenuOpen((prev) => !prev)}
                className="px-2 py-3 min-h-[44px] text-white/80 hover:text-white hover:bg-transparent"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${isVignettesMenuOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>
            <div className={`absolute left-0 top-full z-50 min-w-[180px] pt-1 transition-all duration-150 ${isVignettesMenuOpen ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}>
              <div className="rounded-md border border-gray-700 bg-[#1A1A1A] shadow-lg py-1">
                {vignetteMenuItems.map((item) => {
                  const isActive = isTabActive(item.path);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`block px-3 py-2 text-sm ${isActive ? 'bg-teal-600/20 text-teal-300' : 'text-white/80 hover:bg-gray-800 hover:text-white'}`}
                    >
                      {item.name}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </div>
          <div
            ref={domainMenuRef}
            className="relative group order-1"
            onMouseEnter={() => setIsDomainsMenuOpen(true)}
            onMouseLeave={() => setIsDomainsMenuOpen(false)}
            onFocus={handleMenuFocus(setIsDomainsMenuOpen)}
            onBlur={handleMenuBlur(domainMenuRef, setIsDomainsMenuOpen)}
          >
            <div
              className={
                `flex items-center min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isDomainsActive
                  ? 'text-white border-teal-500'
                  : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
                }`
              }
            >
              <NavLink to="/domains" end className="flex items-center gap-2 px-3 py-3">
                <FolderTree className="w-4 h-4" />
                <span className="hidden sm:inline">Domains</span>
              </NavLink>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Toggle Domains menu"
                aria-haspopup="menu"
                aria-expanded={isDomainsMenuOpen}
                onClick={() => setIsDomainsMenuOpen((prev) => !prev)}
                className="px-2 py-3 min-h-[44px] text-white/80 hover:text-white hover:bg-transparent"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${isDomainsMenuOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>
            <div className={`absolute left-0 top-full z-50 min-w-[180px] pt-1 transition-all duration-150 ${isDomainsMenuOpen ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}>
              <div className="rounded-md border border-gray-700 bg-[#1A1A1A] shadow-lg py-1">
                {domainMenuItems.map((item) => {
                  const isActive = isTabActive(item.path);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`block px-3 py-2 text-sm ${isActive ? 'bg-teal-600/20 text-teal-300' : 'text-white/80 hover:bg-gray-800 hover:text-white'}`}
                    >
                      {item.name}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </div>
          <div
            ref={assumptionsMenuRef}
            className="relative group"
            onMouseEnter={() => setIsAssumptionsMenuOpen(true)}
            onMouseLeave={() => setIsAssumptionsMenuOpen(false)}
            onFocus={handleMenuFocus(setIsAssumptionsMenuOpen)}
            onBlur={handleMenuBlur(assumptionsMenuRef, setIsAssumptionsMenuOpen)}
          >
            <div
              className={
                `flex items-center min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isAssumptionsActive
                  ? 'text-white border-teal-500'
                  : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
                }`
              }
            >
              <NavLink to="/assumptions" className="flex items-center gap-2 px-3 py-3">
                <ShieldCheck className="w-4 h-4" />
                <span className="hidden sm:inline">Assumptions</span>
              </NavLink>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Toggle Assumptions menu"
                aria-haspopup="menu"
                aria-expanded={isAssumptionsMenuOpen}
                onClick={() => setIsAssumptionsMenuOpen((prev) => !prev)}
                className="px-2 py-3 min-h-[44px] text-white/80 hover:text-white hover:bg-transparent"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${isAssumptionsMenuOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>
            <div className={`absolute left-0 top-full z-50 min-w-[180px] pt-1 transition-all duration-150 ${isAssumptionsMenuOpen ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}>
              <div className="rounded-md border border-gray-700 bg-[#1A1A1A] shadow-lg py-1">
                {assumptionsMenuItems.map((item) => {
                  const isActive = isTabActive(item.path);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`block px-3 py-2 text-sm ${isActive ? 'bg-teal-600/20 text-teal-300' : 'text-white/80 hover:bg-gray-800 hover:text-white'}`}
                    >
                      {item.name}
                    </NavLink>
                  );
                })}
              </div>
            </div>
          </div>
          <div
            ref={surveyMenuRef}
            className="relative group"
            onMouseEnter={() => setIsSurveyMenuOpen(true)}
            onMouseLeave={() => setIsSurveyMenuOpen(false)}
            onFocus={handleMenuFocus(setIsSurveyMenuOpen)}
            onBlur={handleMenuBlur(surveyMenuRef, setIsSurveyMenuOpen)}
          >
            <div
              className={
                `flex items-center min-h-[44px] text-sm font-medium transition-colors border-b-2 ${isSurveyActive
                  ? 'text-white border-teal-500'
                  : 'text-white/70 border-transparent hover:text-white hover:border-gray-600'
                }`
              }
            >
              <NavLink to="/survey" className="flex items-center gap-2 px-3 py-3">
                <ClipboardList className="w-4 h-4" />
                <span className="hidden sm:inline">Survey</span>
              </NavLink>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label="Toggle Survey menu"
                aria-haspopup="menu"
                aria-expanded={isSurveyMenuOpen}
                onClick={() => setIsSurveyMenuOpen((prev) => !prev)}
                className="px-2 py-3 min-h-[44px] text-white/80 hover:text-white hover:bg-transparent"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${isSurveyMenuOpen ? 'rotate-180' : ''}`} />
              </Button>
            </div>
            <div className={`absolute left-0 top-full z-50 min-w-[180px] pt-1 transition-all duration-150 ${isSurveyMenuOpen ? 'opacity-100 visible pointer-events-auto' : 'opacity-0 invisible pointer-events-none'}`}>
              <div className="rounded-md border border-gray-700 bg-[#1A1A1A] shadow-lg py-1">
                {surveyMenuItems.map((item) => {
                  const isActive = isTabActive(item.path);
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={`block px-3 py-2 text-sm ${isActive ? 'bg-teal-600/20 text-teal-300' : 'text-white/80 hover:bg-gray-800 hover:text-white'}`}
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
