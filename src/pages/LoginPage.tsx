import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Scan } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function LoginPage() {
  const { login, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('demo@agentlens.dev');
  const [password, setPassword] = useState('demo');
  const [error, setError] = useState('');

  if (isAuthenticated) return <Navigate to="/" replace />;

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    const ok = login(email, password);
    if (!ok) setError('Invalid credentials. Use demo@agentlens.dev / demo');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/15 ring-1 ring-emerald-500/25">
            <Scan className="h-6 w-6 text-emerald-400" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">AgentLens</h1>
          <p className="text-sm text-slate-500">LLM Observability Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur-sm">
          <div>
            <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-400">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25"
              placeholder="you@company.com"
              required
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-400">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25"
              placeholder="••••••••"
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-400">{error}</p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
          >
            Sign in
          </button>

          <p className="text-center text-xs text-slate-600">
            Demo: demo@agentlens.dev / demo
          </p>
        </form>

        <p className="mt-4 text-center text-xs text-slate-500">
          After signing in, go to{' '}
          <span className="font-medium text-slate-400">Settings</span> to connect your LangSmith
          workspace and load real trace data.
        </p>

        <p className="mt-3 text-center text-xs text-slate-600">
          React + TypeScript + LangSmith
        </p>
      </div>
    </div>
  );
}
