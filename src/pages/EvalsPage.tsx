import { useState, useMemo, useEffect } from 'react';
import { Settings, ChevronUp, ChevronDown as ChevronDownIcon, Sparkles, User, Cpu, FlaskConical } from 'lucide-react';
import { Pagination, type PageSize } from '../components/ui/Pagination';
import { Link } from 'react-router-dom';
import { Card } from '../components/ui/Card';
import { useEvals, useDashboard } from '../hooks/useLangSmithData';
import { formatDate } from '../utils/format';
import type { EvalResult, EvalSource } from '../types';

type SortCol = 'score' | 'time';
type SortDir = 'asc' | 'desc';

function scoreColor(s: number) {
  if (s >= 0.8) return 'text-emerald-400';
  if (s >= 0.5) return 'text-amber-400';
  return 'text-rose-400';
}

function scoreBarColor(s: number) {
  if (s >= 0.8) return 'bg-emerald-500';
  if (s >= 0.5) return 'bg-amber-500';
  return 'bg-rose-500';
}

/** Tiny 7-bar sparkline showing daily avg score for a single evaluator */
function ScoreSparkline({ evals }: { evals: EvalResult[] }) {
  const bars = useMemo(() => {
    const now = Date.now();
    const DAY = 86_400_000;
    return Array.from({ length: 7 }, (_, i) => {
      const start = now - (6 - i) * DAY;
      const end = start + DAY;
      const dayEvals = evals.filter((e) => e.createdAt >= start && e.createdAt < end);
      const avg =
        dayEvals.length > 0
          ? dayEvals.reduce((s, e) => s + e.score, 0) / dayEvals.length
          : null;
      return { avg };
    });
  }, [evals]);

  return (
    <div className="mt-2 flex h-8 items-end gap-0.5">
      {bars.map(({ avg }, i) =>
        avg == null ? (
          <div key={i} className="h-1 w-full rounded-sm bg-slate-800" />
        ) : (
          <div
            key={i}
            className={`w-full rounded-sm ${scoreBarColor(avg)} opacity-70`}
            style={{ height: `${Math.max(4, avg * 100)}%` }}
            title={`${(avg * 100).toFixed(0)}%`}
          />
        ),
      )}
    </div>
  );
}

function EvalSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-2 h-3 w-20 rounded bg-slate-800" />
      <div className="mb-1 h-7 w-14 rounded bg-slate-800" />
      <div className="h-3 w-24 rounded bg-slate-800" />
    </div>
  );
}

function SortIcon({ col, active, dir }: { col: SortCol; active: SortCol | null; dir: SortDir }) {
  if (active !== col) return <ChevronUpIcon className="ml-1 inline h-3 w-3 text-slate-700" />;
  return dir === 'asc'
    ? <ChevronUp className="ml-1 inline h-3 w-3 text-emerald-400" />
    : <ChevronDownIcon className="ml-1 inline h-3 w-3 text-emerald-400" />;
}

function ChevronUpIcon({ className }: { className?: string }) {
  return <ChevronUp className={className} />;
}

function SourceBadge({ source }: { source: EvalSource }) {
  if (source === 'llm-judge') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-violet-500/20 bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-violet-400">
        <Sparkles className="h-2.5 w-2.5" />
        LLM Judge
      </span>
    );
  }
  if (source === 'experiment') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-400">
        <FlaskConical className="h-2.5 w-2.5" />
        Experiment
      </span>
    );
  }
  if (source === 'human') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-sky-500/20 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-400">
        <User className="h-2.5 w-2.5" />
        Human
      </span>
    );
  }
  if (source === 'heuristic') {
    return (
      <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-amber-400">
        <Cpu className="h-2.5 w-2.5" />
        Heuristic
      </span>
    );
  }
  return (
    <span className="text-[10px] text-slate-600">-</span>
  );
}

export function EvalsPage() {
  const { data: evalResults, loading: evalsLoading, error, isLive } = useEvals();
  const { data: dashboardMetrics, loading: dashLoading } = useDashboard();
  const [selected, setSelected] = useState('all');
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(15);

  const loading = evalsLoading || dashLoading;
  const EVALUATORS = ['all', ...new Set(evalResults.map((e) => e.evaluator))];

  function handleSort(col: SortCol) {
    if (sortCol === col) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const filtered = useMemo(() => {
    let rows = selected === 'all' ? evalResults : evalResults.filter((e) => e.evaluator === selected);
    if (sortCol === 'score') {
      rows = [...rows].sort((a, b) => sortDir === 'desc' ? b.score - a.score : a.score - b.score);
    } else if (sortCol === 'time') {
      rows = [...rows].sort((a, b) => sortDir === 'desc' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
    }
    return rows;
  }, [evalResults, selected, sortCol, sortDir]);

  // Reset to page 1 when filter, sort, or page size changes
  useEffect(() => { setPage(1); }, [selected, sortCol, sortDir, pageSize]);

  const pageStart = (page - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">Evaluations</h1>
          <p className="text-sm text-slate-500">
            {loading
              ? 'Loading…'
              : `${evalResults.length} evaluation results across ${EVALUATORS.length - 1} evaluators`}
          </p>
        </div>
        {isLive && (
          <a
            href="https://smith.langchain.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/8 px-2.5 py-1 text-[11px] font-medium text-emerald-400 transition-colors hover:bg-emerald-500/15"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live · LangSmith
          </a>
        )}
      </div>

      {!isLive && (
        <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/8 px-4 py-2.5">
          <p className="text-xs text-amber-300">
            Viewing demo data - connect LangSmith in Settings to see your real evaluations.
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
          Failed to load evaluations: {error}
        </div>
      )}

      {/* Summary cards with 7-day sparkline */}
      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 3 }).map((_, i) => <EvalSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {dashboardMetrics.evalScoresByType.map((ev) => {
            const evEvals = evalResults.filter((e) => e.evaluator === ev.evaluator);
            return (
              <Card
                key={ev.evaluator}
                className="cursor-pointer transition-colors hover:border-slate-700"
                onClick={() => setSelected(selected === ev.evaluator ? 'all' : ev.evaluator)}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
                  {ev.evaluator}
                </p>
                <p className={`mt-1 text-2xl font-bold tracking-tight ${scoreColor(ev.avgScore)}`}>
                  {(ev.avgScore * 100).toFixed(0)}%
                </p>
                <p className="mt-0.5 text-xs text-slate-600">{ev.count} runs</p>
                <ScoreSparkline evals={evEvals} />
              </Card>
            );
          })}
        </div>
      )}

      {/* Filter chips */}
      {!loading && (
        <div className="flex flex-wrap gap-2">
          {EVALUATORS.map((ev) => (
            <button
              key={ev}
              onClick={() => setSelected(ev)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                selected === ev
                  ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25'
                  : 'bg-slate-800/50 text-slate-400 hover:text-slate-300'
              }`}
            >
              {ev}
            </button>
          ))}
        </div>
      )}

      {/* Results table */}
      {!loading && (
        <Card padding={false}>
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-600">No evaluation results found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                    <th className="px-4 py-3">Query</th>
                    <th className="hidden px-4 py-3 sm:table-cell">Evaluator</th>
                    <th
                      className="cursor-pointer select-none px-4 py-3 text-right hover:text-slate-400"
                      onClick={() => handleSort('score')}
                    >
                      Score <SortIcon col="score" active={sortCol} dir={sortDir} />
                    </th>
                    <th className="hidden px-4 py-3 sm:table-cell">Source</th>
                    <th
                      className="cursor-pointer select-none px-4 py-3 text-right hover:text-slate-400 hidden sm:table-cell"
                      onClick={() => handleSort('time')}
                    >
                      Time <SortIcon col="time" active={sortCol} dir={sortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {paginated.map((ev) => (
                    <tr
                      key={ev.id}
                      className="border-b border-slate-800/40 transition-colors hover:bg-slate-800/20"
                    >
                      <td className="max-w-[140px] px-4 py-3 sm:max-w-xs">
                        <p className="truncate text-sm text-slate-200" title={ev.traceName}>
                          {ev.traceName}
                        </p>
                        {/* Show evaluator inline on mobile */}
                        <p className="mt-0.5 text-[10px] text-slate-500 sm:hidden">{ev.evaluator}</p>
                        <p className="font-mono text-[10px] text-slate-700 hidden sm:block">{ev.traceId}</p>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <span className="rounded-md bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-400">
                          {ev.evaluator}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {/* Score bar */}
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className={`h-full rounded-full ${scoreBarColor(ev.score)}`}
                              style={{ width: `${ev.score * 100}%` }}
                            />
                          </div>
                          <span className={`w-10 text-right font-mono text-sm font-semibold ${scoreColor(ev.score)}`}>
                            {(ev.score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </td>
                      <td className="hidden px-4 py-3 sm:table-cell">
                        <SourceBadge source={ev.source} />
                      </td>
                      <td className="hidden px-4 py-3 text-right text-xs text-slate-500 sm:table-cell">
                        {formatDate(ev.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filtered.length > 0 && (
            <Pagination
              page={page}
              pageSize={pageSize}
              total={filtered.length}
              onPage={setPage}
              onPageSize={setPageSize}
            />
          )}
        </Card>
      )}
    </div>
  );
}
