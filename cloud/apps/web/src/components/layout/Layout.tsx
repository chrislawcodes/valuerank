import type { ReactNode } from 'react';
import { Header } from './Header';

type LayoutProps = {
  children: ReactNode;
  fullWidth?: boolean;
};

export function Layout({ children, fullWidth = false }: LayoutProps) {
  return (
    <div className="min-h-screen flex flex-col bg-[#FDFBF7]">
      <Header />
      <main className={`flex-1 ${fullWidth ? 'px-4 py-8' : 'max-w-7xl mx-auto px-4 py-8 w-full'}`}>
        {children}
      </main>
    </div>
  );
}
