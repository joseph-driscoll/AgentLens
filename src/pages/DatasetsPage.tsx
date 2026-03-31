import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Database, ChevronRight, FileText, FlaskConical, Settings,
  Loader2, Plus, RefreshCw, Play, CheckCircle2,
  AlertCircle, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '../components/ui/Card';
import { useLangSmith } from '../contexts/LangSmithContext';
import {
  fetchDatasets, fetchDatasetExamples, fetchDatasetSessions,
  createDataset, createFeedback, createExperimentSession,
  type LangSmithDataset, type LangSmithExample, type LangSmithDatasetSession,
} from '../utils/langsmith';
import { fetchFirstAssistant, createThread, runAndWait } from '../utils/langgraph';
import { judgeResponse, type EvalScores } from '../utils/evaluator';
import { formatDate } from '../utils/format';

function scoreColor(s: number) {
  if (s >= 0.8) return 'text-emerald-400';
  if (s >= 0.5) return 'text-amber-400';
  return 'text-rose-400';
}

function DatasetSkeleton() {
  return (
    <div className="animate-pulse space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="h-4 w-32 rounded bg-slate-800" />
      <div className="h-3 w-48 rounded bg-slate-800" />
      <div className="flex gap-4">
        <div className="h-3 w-20 rounded bg-slate-800" />
        <div className="h-3 w-24 rounded bg-slate-800" />
      </div>
    </div>
  );
}

function ExampleRow({ ex }: { ex: LangSmithExample }) {
  const input = Object.values(ex.inputs).find((v) => typeof v === 'string') as string | undefined
    ?? JSON.stringify(ex.inputs).slice(0, 120);
  const output = ex.outputs
    ? Object.values(ex.outputs).find((v) => typeof v === 'string') as string | undefined
      ?? JSON.stringify(ex.outputs).slice(0, 120)
    : null;
  return (
    <tr className="border-b border-slate-800/40 transition-colors hover:bg-slate-800/20">
      <td className="max-w-xs px-4 py-2.5">
        <p className="truncate text-sm text-slate-200" title={input}>{input}</p>
      </td>
      <td className="max-w-xs px-4 py-2.5">
        <p className="truncate text-sm text-slate-400" title={output ?? '-'}>{output ?? '-'}</p>
      </td>
      <td className="px-4 py-2.5 text-right text-xs text-slate-600">
        {formatDate(new Date(ex.created_at).getTime())}
      </td>
    </tr>
  );
}

function ExperimentCard({ session }: { session: LangSmithDatasetSession }) {
  const stats = session.feedback_stats ?? {};
  const entries = Object.entries(stats);
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
      <p className="text-sm font-medium text-slate-200 truncate" title={session.name}>
        {session.name}
      </p>
      <p className="mt-0.5 text-xs text-slate-600">
        {session.run_count} runs · {formatDate(new Date(session.start_time).getTime())}
      </p>
      {entries.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {entries.map(([key, v]) => (
            <span
              key={key}
              className={`rounded-md border border-slate-700 px-2 py-0.5 text-[11px] font-semibold ${scoreColor(v.avg)}`}
            >
              {key} {Math.round(v.avg * 100)}%
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

interface DatasetDetail {
  examples: LangSmithExample[];
  experiments: LangSmithDatasetSession[];
  loading: boolean;
}

// ── Experiment runner ──────────────────────────────────────────────────────

type ExampleStatus = 'pending' | 'running' | 'scoring' | 'done' | 'error';

interface ExampleResult {
  id: string;
  input: string;
  expected: string;
  actual: string;
  scores: EvalScores | null;
  status: ExampleStatus;
  error?: string;
}

function ScorePill({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = value >= 0.8 ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
    : value >= 0.5 ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-rose-400 bg-rose-500/10 border-rose-500/20';
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${color}`}>
      {label} {pct}%
    </span>
  );
}

function StatusIcon({ status }: { status: ExampleStatus }) {
  if (status === 'done') return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />;
  if (status === 'error') return <AlertCircle className="h-3.5 w-3.5 text-rose-400" />;
  if (status === 'running' || status === 'scoring')
    return <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-400" />;
  return <Clock className="h-3.5 w-3.5 text-slate-700" />;
}

function ExperimentRunner({
  dataset,
  examples,
  apiKey,
  openAiKey,
  onDone,
}: {
  dataset: LangSmithDataset;
  examples: LangSmithExample[];
  apiKey: string;
  openAiKey: string;
  onDone: () => void;
}) {
  const [results, setResults] = useState<ExampleResult[]>([]);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [sessionName, setSessionName] = useState('');
  const abortRef = useRef(false);

  function patch(id: string, update: Partial<ExampleResult>) {
    setResults((prev) => prev.map((r) => r.id === id ? { ...r, ...update } : r));
  }

  async function run() {
    if (examples.length === 0) {
      toast.error('No examples to run', { description: 'Add examples via the Traces page first.' });
      return;
    }

    abortRef.current = false;
    const expName = `agentlens::${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;
    setSessionName(expName);
    setPhase('running');

    // Initialise result rows
    const initial: ExampleResult[] = examples.map((ex) => {
      const input = Object.values(ex.inputs).find((v) => typeof v === 'string') as string
        ?? JSON.stringify(ex.inputs);
      const expected = ex.outputs
        ? (Object.values(ex.outputs).find((v) => typeof v === 'string') as string
            ?? JSON.stringify(ex.outputs))
        : '';
      return { id: ex.id, input, expected, actual: '', scores: null, status: 'pending' };
    });
    setResults(initial);

    // Create an experiment session in LangSmith so it shows up under the dataset
    let sessionId: string | undefined;
    try {
      const session = await createExperimentSession(apiKey, expName, dataset.id);
      sessionId = session.id;
    } catch {
      // Non-fatal - runs will still be logged to the default project
    }

    // Find the LangGraph assistant once
    const assistant = await fetchFirstAssistant();
    if (!assistant) {
      toast.error('LangGraph server not running', {
        description: 'Start it with: npx @langchain/langgraph-cli dev',
      });
      setPhase('done');
      return;
    }

    let passed = 0;
    const scoreAccum = { helpfulness: 0, correctness: 0, relevance: 0, n: 0 };

    for (const row of initial) {
      if (abortRef.current) break;

      patch(row.id, { status: 'running' });

      let actual = '';
      let runId: string | undefined;

      try {
        const thread = await createThread();
        if (!thread) throw new Error('Could not create thread');
        const result = await runAndWait(thread.thread_id, assistant.assistant_id, row.input);
        actual = result.content || '(no output)';
        runId = result.runId;
        patch(row.id, { actual, status: 'scoring' });
      } catch (err) {
        patch(row.id, { actual: '', status: 'error', error: (err as Error).message });
        continue;
      }

      // LLM-as-judge
      let scores: EvalScores | null = null;
      if (openAiKey) {
        scores = await judgeResponse(openAiKey, row.input, actual);
        if (scores) {
          scoreAccum.helpfulness += scores.helpfulness;
          scoreAccum.correctness += scores.correctness;
          scoreAccum.relevance   += scores.relevance;
          scoreAccum.n++;

          // Log feedback to LangSmith
          if (runId && apiKey) {
            const comment = `LLM-as-judge (GPT-4o-mini) · experiment:${expName}${sessionId ? ` session:${sessionId}` : ''}`;
            await Promise.allSettled([
              createFeedback(apiKey, runId, 'helpfulness', scores.helpfulness, comment),
              createFeedback(apiKey, runId, 'correctness', scores.correctness, comment),
              createFeedback(apiKey, runId, 'relevance',   scores.relevance,   comment),
            ]);
          }
        }
      }

      patch(row.id, { scores, status: 'done' });
      passed++;
    }

    setPhase('done');

    const n = scoreAccum.n;
    if (n > 0) {
      const avg = (v: number) => Math.round((v / n) * 100);
      toast.success(`Experiment complete - ${passed}/${examples.length} passed`, {
        description: `Avg: helpful ${avg(scoreAccum.helpfulness)}% · correct ${avg(scoreAccum.correctness)}% · relevant ${avg(scoreAccum.relevance)}%`,
      });
    } else {
      toast.success(`Experiment complete - ${passed}/${examples.length} examples ran`);
    }

    onDone();
  }

  if (phase === 'idle') {
    return (
      <button
        onClick={run}
        className="flex items-center gap-2 rounded-lg border border-violet-600/40 bg-violet-600/10 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:bg-violet-600/20"
      >
        <Play className="h-4 w-4" />
        Run Experiment
      </button>
    );
  }

  const done = results.filter((r) => r.status === 'done').length;
  const total = results.length;
  const n = results.filter((r) => r.scores !== null).length;
  const avgScore = n > 0
    ? results.reduce((sum, r) => sum + (r.scores
        ? (r.scores.helpfulness + r.scores.correctness + r.scores.relevance) / 3
        : 0), 0) / n
    : null;

  return (
    <div className="space-y-3 rounded-xl border border-violet-500/20 bg-violet-500/5 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-violet-300">
            {phase === 'running' ? `Running experiment… ${done}/${total}` : `Experiment complete · ${done}/${total} passed`}
          </p>
          <p className="text-[11px] text-slate-600">{sessionName}</p>
        </div>
        {avgScore !== null && (
          <div className="text-right">
            <p className="text-xs text-slate-500">Avg score</p>
            <p className={`font-mono text-lg font-bold ${avgScore >= 0.8 ? 'text-emerald-400' : avgScore >= 0.5 ? 'text-amber-400' : 'text-rose-400'}`}>
              {Math.round(avgScore * 100)}%
            </p>
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
        <div
          className="h-full rounded-full bg-violet-500 transition-all duration-500"
          style={{ width: total > 0 ? `${(done / total) * 100}%` : '0%' }}
        />
      </div>

      {/* Results table */}
      <div className="overflow-x-auto rounded-lg border border-slate-800">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              <th className="px-3 py-2">Input</th>
              <th className="hidden px-3 py-2 sm:table-cell">Actual Output</th>
              <th className="px-3 py-2">Scores</th>
              <th className="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.id} className="border-b border-slate-800/40 transition-colors hover:bg-slate-800/20">
                <td className="max-w-[140px] px-3 py-2.5">
                  <p className="truncate text-xs text-slate-300" title={r.input}>{r.input}</p>
                </td>
                <td className="hidden max-w-[200px] px-3 py-2.5 sm:table-cell">
                  {r.actual ? (
                    <p className="truncate text-xs text-slate-400" title={r.actual}>{r.actual}</p>
                  ) : r.status === 'running' ? (
                    <span className="text-xs text-slate-600 italic">calling agent…</span>
                  ) : r.status === 'scoring' ? (
                    <span className="text-xs text-slate-600 italic">scoring…</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5">
                  {r.scores ? (
                    <div className="flex flex-wrap gap-1">
                      <ScorePill label="H" value={r.scores.helpfulness} />
                      <ScorePill label="C" value={r.scores.correctness} />
                      <ScorePill label="R" value={r.scores.relevance} />
                    </div>
                  ) : r.error ? (
                    <span className="text-[10px] text-rose-400">{r.error.slice(0, 40)}</span>
                  ) : (
                    <span className="text-[10px] text-slate-700">-</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <StatusIcon status={r.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {phase === 'done' && (
        <p className="text-[11px] text-slate-600">
          Scores logged to LangSmith · visible in Evaluations page
        </p>
      )}
    </div>
  );
}

export function DatasetsPage() {
  const { config, isConnected, openAiKey } = useLangSmith();
  const [datasets, setDatasets] = useState<LangSmithDataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, DatasetDetail>>({});
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [runningExp, setRunningExp] = useState<string | null>(null); // dataset id

  function loadDatasets() {
    if (!config?.apiKey) { setDatasets([]); setError(null); return; }
    setLoading(true);
    setError(null);
    fetchDatasets(config.apiKey)
      .then(setDatasets)
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadDatasets();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config]);

  async function handleCreate() {
    if (!config?.apiKey || !newName.trim()) return;
    setCreating(true);
    try {
      const ds = await createDataset(config.apiKey, newName.trim(), newDesc.trim() || undefined);
      setDatasets((prev) => [ds, ...prev]);
      setNewName('');
      setNewDesc('');
      setShowNew(false);
      toast.success(`Dataset "${ds.name}" created`, {
        description: 'Add examples by clicking "Add to Dataset" on any trace.',
      });
    } catch (err) {
      toast.error('Failed to create dataset', { description: (err as Error).message });
    } finally {
      setCreating(false);
    }
  }

  function toggle(dsId: string) {
    if (expanded === dsId) { setExpanded(null); return; }
    setExpanded(dsId);
    // Always re-fetch so freshly added examples show up immediately
    if (!config?.apiKey) return;
    setDetails((prev) => ({ ...prev, [dsId]: { examples: [], experiments: [], loading: true } }));
    Promise.all([
      fetchDatasetExamples(config.apiKey, dsId),
      fetchDatasetSessions(config.apiKey, dsId).catch(() => [] as LangSmithDatasetSession[]),
    ]).then(([examples, experiments]) => {
      setDetails((prev) => ({
        ...prev,
        [dsId]: { examples, experiments, loading: false },
      }));
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">Datasets</h1>
          <p className="text-sm text-slate-500">
            {loading
              ? 'Loading…'
              : isConnected
                ? `${datasets.length} dataset${datasets.length !== 1 ? 's' : ''} in your workspace`
                : 'Connect LangSmith to see your datasets and experiments'}
          </p>
        </div>
        {isConnected && (
          <div className="flex items-center gap-2">
            <button
              onClick={loadDatasets}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-40"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={() => setShowNew((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-violet-600/40 bg-violet-600/10 px-3 py-1.5 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-600/20"
            >
              <Plus className="h-3.5 w-3.5" />
              New Dataset
            </button>
          </div>
        )}
      </div>

      {/* Create dataset form */}
      {showNew && isConnected && (
        <Card>
          <p className="mb-3 text-sm font-semibold text-slate-200">Create Dataset</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Name</label>
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                placeholder="e.g. AgentLens Regression Suite"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-violet-500/50 placeholder-slate-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-400">Description (optional)</label>
              <input
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                placeholder="What is this dataset for?"
                className="w-full rounded-lg border border-slate-700 bg-slate-800/50 px-3 py-2 text-sm text-slate-200 outline-none transition-colors focus:border-violet-500/50 placeholder-slate-600"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-violet-500 disabled:opacity-50"
              >
                {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Create
              </button>
              <button
                onClick={() => { setShowNew(false); setNewName(''); setNewDesc(''); }}
                className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:text-slate-200"
              >
                Cancel
              </button>
            </div>
          </div>
        </Card>
      )}

      {!isConnected && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/8 px-4 py-2.5">
          <p className="text-xs text-amber-300">
            Connect LangSmith in Settings to see your datasets, examples, and experiment results.
          </p>
          <Link
            to="/settings"
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/15"
          >
            <Settings className="h-3.5 w-3.5" />
            Connect
          </Link>
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-4 py-3 text-sm text-rose-300">
          Failed to load datasets: {error}
        </div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <DatasetSkeleton key={i} />)}
        </div>
      )}

      {!loading && isConnected && datasets.length === 0 && !error && (
        <Card>
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Database className="h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-500">No datasets yet.</p>
            <p className="text-xs text-slate-600 max-w-xs">
              Click <span className="text-violet-400">New Dataset</span> above, or open any trace and use
              the <span className="text-violet-400">Add to Dataset</span> button to capture real examples.
            </p>
          </div>
        </Card>
      )}

      {datasets.map((ds) => {
        const isOpen = expanded === ds.id;
        const detail = details[ds.id];
        return (
          <Card key={ds.id} padding={false}>
            <button
              onClick={() => toggle(ds.id)}
              className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-slate-800/30"
            >
              <Database className="h-4 w-4 shrink-0 text-emerald-400" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-slate-100">{ds.name}</p>
                {ds.description && (
                  <p className="mt-0.5 truncate text-xs text-slate-500">{ds.description}</p>
                )}
              </div>
              <div className="hidden items-center gap-4 text-xs text-slate-500 sm:flex">
                <span className="flex items-center gap-1">
                  <FileText className="h-3 w-3" />
                  {ds.example_count} example{ds.example_count !== 1 ? 's' : ''}
                </span>
                <span className="flex items-center gap-1">
                  <FlaskConical className="h-3 w-3" />
                  {ds.session_count} experiment{ds.session_count !== 1 ? 's' : ''}
                </span>
                <span className="text-xs text-slate-600">{ds.data_type}</span>
              </div>
              {/* Mobile: compact stats */}
              <p className="text-[11px] text-slate-600 sm:hidden">
                {ds.example_count} ex · {ds.session_count} exp
              </p>
              <ChevronRight
                className={`h-4 w-4 shrink-0 text-slate-600 transition-transform ${isOpen ? 'rotate-90' : ''}`}
              />
            </button>

            {isOpen && (
              <div className="border-t border-slate-800 px-5 py-4">
                {detail?.loading ? (
                  <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading…
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* Run Experiment */}
                    {config?.apiKey && (detail?.examples.length ?? 0) > 0 && (
                      <div>
                        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Run Experiment
                        </h3>
                        {!openAiKey && (
                          <p className="mb-2 text-xs text-amber-400">
                            Add your OpenAI key in{' '}
                            <Link to="/settings" className="underline hover:text-amber-300">Settings</Link>
                            {' '}to enable LLM-as-judge scoring.
                          </p>
                        )}
                        {runningExp === ds.id ? (
                          <ExperimentRunner
                            dataset={ds}
                            examples={detail!.examples}
                            apiKey={config.apiKey}
                            openAiKey={openAiKey}
                            onDone={() => {
                              // Re-fetch details so experiment count updates
                              setDetails((prev) => {
                                const { [ds.id]: _, ...rest } = prev;
                                return rest;
                              });
                              toggle(ds.id);
                              setTimeout(() => toggle(ds.id), 100);
                            }}
                          />
                        ) : (
                          <button
                            onClick={() => setRunningExp(ds.id)}
                            className="flex items-center gap-2 rounded-lg border border-violet-600/40 bg-violet-600/10 px-4 py-2 text-sm font-medium text-violet-300 transition-colors hover:bg-violet-600/20"
                          >
                            <Play className="h-4 w-4" />
                            Run Experiment
                          </button>
                        )}
                      </div>
                    )}

                    {/* Experiments */}
                    {(detail?.experiments.length ?? 0) > 0 && (
                      <div>
                        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          Experiments
                        </h3>
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {detail!.experiments.map((s) => (
                            <ExperimentCard key={s.id} session={s} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Examples table */}
                    <div>
                      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Examples ({detail?.examples.length ?? 0})
                      </h3>
                      {(detail?.examples.length ?? 0) > 0 ? (
                        <div className="overflow-x-auto rounded-lg border border-slate-800">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                                <th className="px-4 py-2.5">Input</th>
                                <th className="px-4 py-2.5">Expected Output</th>
                                <th className="px-4 py-2.5 text-right">Created</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail!.examples.map((ex) => (
                                <ExampleRow key={ex.id} ex={ex} />
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="py-4 text-center text-xs text-slate-600">No examples yet.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
