import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useTutorial } from '../../hooks/useTutorial';

export function AppLayout() {
  const { startTutorial, hasSeenTour } = useTutorial();

  useEffect(() => {
    if (!hasSeenTour()) {
      const t = setTimeout(() => startTutorial(), 800);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-slate-950">
      <Sidebar onStartTour={startTutorial} />
      {/* lg: offset for the fixed sidebar; mobile: offset for the top bar */}
      <main className="pt-14 lg:ml-60 lg:pt-0">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
