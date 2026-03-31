import { useState, useEffect, type FormEvent } from 'react';
import { CheckCircle, XCircle, Loader2, Link2, Link2Off, ExternalLink, RefreshCw, Sparkles, Trash2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../components/ui/Card';
import { useLangSmith } from '../contexts/LangSmithContext';
import { fetchSessions, deleteAllFeedbackForSession, clearAndRecreateSession, deleteSession } from '../utils/langsmith';
import { invalidateCache } from '../hooks/useLangSmithData';
import type { LangSmithSession } from '../utils/langsmith';

type ValidationState = 'idle' | 'validating' | 'valid' | 'error';

export function SettingsPage() {
  const { config, isConnected, setConfig, clearConfig, openAiKey, setOpenAiKey } = useLangSmith();

  const [apiKey, setApiKey] = useState(config?.apiKey ?? '');
  const [sessions, setSessions] = useState<LangSmithSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState(config?.projectId ?? '');
  const [validationState, setValidationState] = useState<ValidationState>(
    isConnected ? 'valid' : 'idle',
  );
  const [errorMessage, setErrorMessage] = useState('');
  const [oaiDraft, setOaiDraft] = useState(openAiKey);
  const [oaiSaved, setOaiSaved] = useState(false);

  type DangerOp = 'evals' | 'traces' | 'project' | null;
  const [dangerConfirm, setDangerConfirm] = useState<DangerOp>(null);
  const [dangerLoading, setDangerLoading] = useState(false);

  // Reload sessions list when already connected
  useEffect(() => {
    if (config?.apiKey && isConnected) {
      fetchSessions(config.apiKey)
        .then(setSessions)
        .catch(() => setSessions([]));
    }
  }, [config?.apiKey, isConnected]);

  async function handleValidate() {
    if (!apiKey.trim()) return;
    setValidationState('validating');
    setErrorMessage('');
    setSessions([]);
    setSelectedSessionId('');

    try {
      const data = await fetchSessions(apiKey.trim());
      setSessions(data);
      setValidationState('valid');
      // Auto-select first session
      if (data.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data[0].id);
      }
    } catch (err) {
      setValidationState('error');
      setErrorMessage((err as Error).message);
    }
  }

  function handleSave(e: FormEvent) {
    e.preventDefault();
    if (validationState !== 'valid') return;

    const session = sessions.find((s) => s.id === selectedSessionId);
    setConfig({
      apiKey: apiKey.trim(),
      projectId: selectedSessionId,
      projectName: session?.name ?? selectedSessionId,
    });
  }

  function handleDisconnect() {
    clearConfig();
    setApiKey('');
    setSessions([]);
    setSelectedSessionId('');
    setValidationState('idle');
    setErrorMessage('');
  }

  function handleSaveOaiKey() {
    setOpenAiKey(oaiDraft.trim());
    setOaiSaved(true);
    setTimeout(() => setOaiSaved(false), 2000);
  }

  async function handleClearEvals() {
    if (!config?.apiKey || !config.projectId) return;
    setDangerLoading(true);
    try {
      const n = await deleteAllFeedbackForSession(config.apiKey, config.projectId);
      invalidateCache();
      toast.success(`Cleared ${n} evaluation${n !== 1 ? 's' : ''}`, {
        description: 'All feedback scores removed from this project.',
      });
      setDangerConfirm(null);
    } catch (err) {
      toast.error('Failed to clear evaluations', { description: (err as Error).message });
    } finally {
      setDangerLoading(false);
    }
  }

  async function handleClearTraces() {
    if (!config?.apiKey || !config.projectId || !config.projectName) return;
    setDangerLoading(true);
    try {
      // LangSmith doesn't support DELETE on individual runs via REST.
      // We delete the session and immediately recreate it with the same name -
      // datasets are stored separately and are unaffected.
      const newSession = await clearAndRecreateSession(
        config.apiKey,
        config.projectId,
        config.projectName,
      );
      setConfig({ ...config, projectId: newSession.id });
      invalidateCache();
      toast.success('All traces cleared', {
        description: `Project recreated as "${config.projectName}" with a fresh session.`,
      });
      setDangerConfirm(null);
    } catch (err) {
      toast.error('Failed to clear traces', { description: (err as Error).message });
    } finally {
      setDangerLoading(false);
    }
  }

  async function handleDeleteProject() {
    if (!config?.apiKey || !config.projectId) return;
    setDangerLoading(true);
    try {
      await deleteSession(config.apiKey, config.projectId);
      invalidateCache();
      clearConfig();
      toast.success('Project deleted', {
        description: 'All traces and evaluations have been removed. Reconnect to a new project.',
      });
      setDangerConfirm(null);
    } catch (err) {
      toast.error('Failed to delete project', { description: (err as Error).message });
    } finally {
      setDangerLoading(false);
    }
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-100">Settings</h1>
        <p className="text-sm text-slate-500">Connect AgentLens to your LangSmith workspace.</p>
      </div>

      {/* Connection status banner */}
      {isConnected && (
        <div className="flex items-center gap-3 rounded-lg border border-emerald-500/20 bg-emerald-500/8 px-4 py-3">
          <CheckCircle className="h-4 w-4 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1 text-sm text-emerald-300">
            Connected to{' '}
            <span className="font-semibold">{config?.projectName || 'LangSmith'}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => invalidateCache()}
              title="Clear cache - next page visit will reload from LangSmith"
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/15"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
            <button
              type="button"
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/15"
            >
              <Link2Off className="h-3.5 w-3.5" />
              Disconnect
            </button>
          </div>
        </div>
      )}

      <Card>
        <form onSubmit={handleSave} className="space-y-5">
          {/* API Key */}
          <div>
            <label
              htmlFor="apiKey"
              className="mb-1.5 flex items-center justify-between text-xs font-medium text-slate-400"
            >
              <span>LangSmith API Key</span>
              <a
                href="https://smith.langchain.com/settings"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-emerald-500 hover:text-emerald-400"
              >
                Get API key
                <ExternalLink className="h-3 w-3" />
              </a>
            </label>
            <div className="flex gap-2">
              <input
                id="apiKey"
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (validationState !== 'idle') setValidationState('idle');
                }}
                placeholder="ls__••••••••••••••••••••••••••••"
                className="flex-1 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 font-mono text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25"
              />
              <button
                type="button"
                onClick={handleValidate}
                disabled={!apiKey.trim() || validationState === 'validating'}
                className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {validationState === 'validating' ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : validationState === 'valid' ? (
                  <CheckCircle className="h-4 w-4 text-emerald-400" />
                ) : validationState === 'error' ? (
                  <XCircle className="h-4 w-4 text-rose-400" />
                ) : null}
                {validationState === 'validating' ? 'Checking…' : 'Validate'}
              </button>
            </div>

            {validationState === 'error' && (
              <p className="mt-2 text-xs text-rose-400">{errorMessage}</p>
            )}
            {validationState === 'valid' && (
              <p className="mt-2 text-xs text-emerald-400">
                Key valid - {sessions.length} project{sessions.length !== 1 ? 's' : ''} found
              </p>
            )}
          </div>

          {/* Project selector */}
          {sessions.length > 0 && (
            <div>
              <label
                htmlFor="project"
                className="mb-1.5 block text-xs font-medium text-slate-400"
              >
                Project
              </label>
              <select
                id="project"
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25"
              >
                <option value="">All projects</option>
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}{s.run_count != null ? ` (${s.run_count.toLocaleString()} runs)` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <button
            type="submit"
            disabled={validationState !== 'valid'}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Link2 className="h-4 w-4" />
            Connect LangSmith
          </button>
        </form>
      </Card>

      {/* OpenAI key - used for LLM-as-judge eval scoring */}
      <Card>
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-400" />
          <h2 className="text-sm font-semibold text-slate-200">LLM-as-Judge Evaluations</h2>
        </div>
        <p className="mb-4 text-xs text-slate-500">
          When set, every Chat response is automatically scored by GPT-4o-mini on helpfulness,
          correctness, and relevance - and the scores are logged to LangSmith. Costs ~$0.00001
          per message.
        </p>
        <div className="flex gap-2">
          <input
            type="password"
            value={oaiDraft}
            onChange={(e) => { setOaiDraft(e.target.value); setOaiSaved(false); }}
            placeholder="sk-proj-••••••••••••••••••••••••••••"
            className="flex-1 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 font-mono text-sm text-slate-100 placeholder-slate-600 outline-none transition-colors focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/25"
          />
          <button
            type="button"
            onClick={handleSaveOaiKey}
            disabled={!oaiDraft.trim() || oaiDraft.trim() === openAiKey}
            className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {oaiSaved ? <CheckCircle className="h-4 w-4" /> : null}
            {oaiSaved ? 'Saved' : 'Save'}
          </button>
        </div>
        {openAiKey && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-violet-400">
            <CheckCircle className="h-3 w-3" />
            LLM judge active - scores auto-log after each chat message
          </p>
        )}
      </Card>

      {/* How it works */}
      <Card>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-500">
          How it works
        </h2>
        <ul className="space-y-2 text-sm text-slate-400">
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-emerald-500">1.</span>
            AgentLens calls the LangSmith REST API directly from your browser using your API key.
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-emerald-500">2.</span>
            Traces, spans, and evaluations are fetched from{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">
              api.smith.langchain.com
            </code>{' '}
            and displayed in real time.
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-emerald-500">3.</span>
            Your API key is stored only in{' '}
            <code className="rounded bg-slate-800 px-1 py-0.5 text-xs text-slate-300">
              localStorage
            </code>{' '}
            - never sent anywhere else.
          </li>
          <li className="flex gap-2">
            <span className="mt-0.5 shrink-0 font-mono text-xs text-emerald-500">4.</span>
            Without a key, the app falls back to demo data so it always works as a showcase.
          </li>
        </ul>
      </Card>

      {/* Danger Zone */}
      {isConnected && (
        <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-5">
          <div className="mb-4 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            <h2 className="text-sm font-semibold text-rose-300">Danger Zone</h2>
          </div>

          <div className="space-y-3">
            {/* Clear evaluations */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Clear all evaluations</p>
                <p className="text-xs text-slate-500">
                  Deletes every feedback score in <span className="text-slate-400">{config?.projectName}</span>. Traces are kept.
                </p>
              </div>
              {dangerConfirm === 'evals' ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-rose-400">Sure?</span>
                  <button
                    onClick={handleClearEvals}
                    disabled={dangerLoading}
                    className="flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    {dangerLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Delete
                  </button>
                  <button
                    onClick={() => setDangerConfirm(null)}
                    className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDangerConfirm('evals')}
                  className="shrink-0 rounded-md border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
                >
                  Clear evals
                </button>
              )}
            </div>

            {/* Clear traces */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Clear all traces</p>
                <p className="text-xs text-slate-500">
                  Deletes and recreates <span className="text-slate-400">{config?.projectName}</span> - all traces and evals gone, datasets kept.
                </p>
              </div>
              {dangerConfirm === 'traces' ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-rose-400">Sure?</span>
                  <button
                    onClick={handleClearTraces}
                    disabled={dangerLoading}
                    className="flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    {dangerLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Delete
                  </button>
                  <button
                    onClick={() => setDangerConfirm(null)}
                    className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDangerConfirm('traces')}
                  className="shrink-0 rounded-md border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
                >
                  Clear traces
                </button>
              )}
            </div>

            {/* Delete project */}
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-200">Delete project</p>
                <p className="text-xs text-slate-500">
                  Permanently removes <span className="text-slate-400">{config?.projectName}</span> and all its traces and evaluations from LangSmith.
                </p>
              </div>
              {dangerConfirm === 'project' ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-rose-400">Irreversible!</span>
                  <button
                    onClick={handleDeleteProject}
                    disabled={dangerLoading}
                    className="flex items-center gap-1 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-50"
                  >
                    {dangerLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                    Delete
                  </button>
                  <button
                    onClick={() => setDangerConfirm(null)}
                    className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setDangerConfirm('project')}
                  className="shrink-0 rounded-md border border-rose-500/30 px-3 py-1.5 text-xs font-medium text-rose-400 transition-colors hover:bg-rose-500/10"
                >
                  Delete project
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
