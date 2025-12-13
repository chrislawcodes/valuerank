import { ReactNode } from 'react';
import { Header } from './Header';
import { NavTabs } from './NavTabs';

type LayoutProps = {
  children: ReactNode;
  fullWidth?: boolean;
};

export function Layout({ children, fullWidth = false }: LayoutProps) {
  return (
    <div className="min-h-screen bg-[#FDFBF7]">
      <Header />
      <NavTabs />
      <main className={fullWidth ? 'px-4 py-8' : 'max-w-7xl mx-auto px-4 py-8'}>
        {children}
      </main>
    </div>
  );
}
