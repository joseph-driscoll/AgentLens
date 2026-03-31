import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, ListTree, FlaskConical, Database,
  Settings, LogOut, Scan, MessageSquare, Menu, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useLangSmith } from '../../contexts/LangSmithContext';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/traces', label: 'Traces', icon: ListTree },
  { to: '/evaluations', label: 'Evaluations', icon: FlaskConical },
  { to: '/datasets', label: 'Datasets', icon: Database },
  { to: '/chat', label: 'Chat', icon: MessageSquare },
];

function NavContent({ onClose }: { onClose?: () => void }) {
  const { logout, user } = useAuth();
  const { isConnected, config } = useLangSmith();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-800 px-5">
        <Scan className="h-5 w-5 text-emerald-400" />
        <div>
          <span className="text-sm font-bold tracking-tight text-slate-100">AgentLens</span>
          <p className="text-[10px] leading-none text-slate-400">LangGraph observability</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
              }`
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-800 px-3 py-3">
        <NavLink
          to="/settings"
          onClick={onClose}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-emerald-500/10 text-emerald-400'
                : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
            }`
          }
        >
          <Settings className="h-4 w-4" />
          <span className="flex-1">Settings</span>
          <span
            title={isConnected ? `Connected: ${config?.projectName}` : 'Not connected'}
            className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-slate-600'}`}
          />
        </NavLink>
      </div>

      <div className="border-t border-slate-800 p-4">
        <div className="mb-3 flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-500/20 text-xs font-semibold text-emerald-400">
            {user?.name.charAt(0) ?? 'U'}
          </div>
          <div className="truncate text-xs text-slate-400">{user?.email}</div>
        </div>
        <button
          onClick={logout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-800/60 hover:text-slate-300"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-800 bg-slate-950 lg:flex">
        <NavContent />
      </aside>

      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-800 bg-slate-950 px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Scan className="h-4 w-4 text-emerald-400" />
        <span className="text-sm font-bold tracking-tight text-slate-100">AgentLens</span>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-72 border-r border-slate-800 bg-slate-950 shadow-2xl">
            <button
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3.5 rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              aria-label="Close menu"
            >
              <X className="h-4 w-4" />
            </button>
            <NavContent onClose={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
