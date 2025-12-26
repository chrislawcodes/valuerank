import type { ReactNode } from 'react';
import { Header } from './Header';
import { NavTabs } from './NavTabs';

type LayoutProps = {
  children: ReactNode;
  fullWidth?: boolean;
};

export function Layout({ children, fullWidth = false }: LayoutProps) {
  return (
    <div className="h-screen flex flex-col bg-[#FDFBF7]">
      <Header />
      {/* NavTabs hidden on mobile (sm breakpoint), shown on tablet/desktop */}
      <NavTabs />
      <main className={`flex-1 min-h-0 overflow-auto ${fullWidth ? 'px-4 py-8' : 'max-w-7xl mx-auto px-4 py-8 w-full'}`}>
        {children}
      </main>
    </div>
  );
}
