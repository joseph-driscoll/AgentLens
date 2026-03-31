import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronRight, ChevronDown, Search, Settings, Loader2,
  DatabaseZap, CheckCircle2, Plus, X, MessageSquare,
} from 'lucide-react';
import { Pagination, type PageSize } from '../components/ui/Pagination';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { TypeBadge, StatusBadge } from '../components/ui/Badge';
import { useTraces } from '../hooks/useLangSmithData';
import { useLangSmith } from '../contexts/LangSmithContext';
import {
  fetchRunChildren, fetchDatasets, createExample, createDataset,
  type LangSmithDataset,
} from '../utils/langsmith';
import { buildSpanTree } from '../utils/adapters';
import { formatDuration, formatCost, formatDate, formatNumber } from '../utils/format';
import type { Span, Trace } from '../types';

function SpanDetail({ span }: { span: Span }) {
  if (!span.input && !span.output && !span.error) return null;
  return (
    <tr className="border-b border-slate-800/50 bg-slate-950/40">
      <td colSpan={6} className="px-4 pb-3 pt-1">
        <div className="space-y-2 pl-5">
          {span.input && (
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Input
              </p>
              <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-400">
                {span.input}
              </p>
            </div>
          )}
          {span.output && (
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Output
              </p>
              <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-emerald-400/80">
                {span.output}
              </p>
            </div>
          )}
          {span.error && (
            <div>
              <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                Error
              </p>
              <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-rose-400">
                {span.error}
              </p>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function SpanRow({
  span,
  depth = 0,
  suppressDetail = false,
}: {
  span: Span;
  depth?: number;
  suppressDetail?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const hasChildren = span.children && span.children.length > 0;
  const hasDetail = !suppressDetail && !!(span.input || span.output || span.error);
  const duration = span.endTime - span.startTime;

  function handleClick() {
    if (hasChildren) {
      setOpen((v) => !v);
    } else if (hasDetail) {
      setShowDetail((v) => !v);
    }
  }

  return (
    <>
      <tr
        className="group border-b border-slate-800/50 transition-colors hover:bg-slate-800/30 cursor-pointer"
        onClick={handleClick}
      >
        <td className="py-2.5 pl-3 pr-2">
          <div className="flex items-center" style={{ paddingLeft: `${depth * 20}px` }}>
            {hasChildren ? (
              open
                ? <ChevronDown className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                : <ChevronRight className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
            ) : hasDetail ? (
              showDetail
                ? <ChevronDown className="mr-1.5 h-3.5 w-3.5 text-slate-600" />
                : <ChevronRight className="mr-1.5 h-3.5 w-3.5 text-slate-600" />
            ) : (
              <span className="mr-1.5 inline-block w-3.5" />
            )}
            <span className="font-mono text-xs text-slate-300">{span.name}</span>
          </div>
        </td>
        <td className="px-3 py-2.5"><TypeBadge type={span.type} /></td>
        <td className="px-3 py-2.5"><StatusBadge status={span.status} /></td>
        <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-400">
          {formatDuration(duration)}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-400">
          {span.tokens ? formatNumber(span.tokens.total) : '-'}
        </td>
        <td className="px-3 py-2.5 text-right font-mono text-xs text-slate-400">
          {span.model ?? '-'}
        </td>
      </tr>
      {showDetail && !hasChildren && <SpanDetail span={span} />}
      {open && span.children?.map((child) => (
        <SpanRow key={child.id} span={child} depth={depth + 1} />
      ))}
    </>
  );
}

// ── Add-to-Dataset picker ────────────────────────────────────────────────────

function AddToDataset({
  apiKey,
  traceInput,
  traceOutput,
}: {
  apiKey: string;
  traceInput: string;
  traceOutput: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [datasets, setDatasets] = useState<LangSmithDataset[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || dropRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!open) return;
    function reposition() {
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  async function handleOpen(e: React.MouseEvent) {
    e.stopPropagation();
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    setOpen((v) => !v);
    if (datasets.length === 0 && !loading) {
      setLoading(true);
      try {
        const data = await fetchDatasets(apiKey);
        setDatasets(data);
      } catch {
        toast.error('Could not load datasets');
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleAdd(datasetId: string, datasetName: string) {
    setSaving(datasetId);
    try {
      await createExample(
        apiKey,
        datasetId,
        { input: traceInput },
        { output: traceOutput },
      );
      setSaved(datasetId);
      toast.success(`Added to "${datasetName}"`, {
        description: 'Example saved - visible in Datasets page.',
      });
      setTimeout(() => { setSaved(null); setOpen(false); }, 1500);
    } catch (err) {
      toast.error('Failed to add example', { description: (err as Error).message });
    } finally {
      setSaving(null);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const ds = await createDataset(apiKey, newName.trim());
      setDatasets((prev) => [ds, ...prev]);
      setNewName('');
      setShowNew(false);
      await handleAdd(ds.id, ds.name);
    } catch (err) {
      toast.error('Failed to create dataset', { description: (err as Error).message });
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        className="flex items-center gap-1.5 rounded-md border border-slate-700 bg-slate-800/50 px-2.5 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-300"
        title="Add this trace as a labeled example in a LangSmith dataset"
      >
        <DatabaseZap className="h-3.5 w-3.5" />
        Add to Dataset
      </button>

      {open && pos && (
        <div
          ref={dropRef}
          style={{ position: 'fixed', top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-72 overflow-hidden rounded-xl border border-slate-700 bg-slate-900 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2.5">
            <span className="text-xs font-semibold text-slate-300">Add to Dataset</span>
            <button onClick={() => setOpen(false)} className="text-slate-600 hover:text-slate-400">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {loading && (
              <div className="flex items-center gap-2 px-3 py-4 text-xs text-slate-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading datasets…
              </div>
            )}
            {!loading && datasets.length === 0 && !showNew && (
              <p className="px-3 py-4 text-xs text-slate-600">No datasets yet - create one below.</p>
            )}
            {datasets.map((ds) => (
              <button
                key={ds.id}
                onClick={() => handleAdd(ds.id, ds.name)}
                disabled={!!saving || saved === ds.id}
                className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs transition-colors hover:bg-slate-800/60 disabled:opacity-60"
              >
                {saved === ds.id ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                ) : saving === ds.id ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-slate-500" />
                ) : (
                  <DatabaseZap className="h-3.5 w-3.5 shrink-0 text-slate-600" />
                )}
                <span className="flex-1 truncate text-slate-300">{ds.name}</span>
                <span className="text-[10px] text-slate-600">{ds.example_count} ex</span>
              </button>
            ))}
          </div>

          <div className="border-t border-slate-800 p-2">
            {showNew ? (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowNew(false); }}
                  placeholder="Dataset name…"
                  className="min-w-0 flex-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-violet-500/50 placeholder-slate-600"
                />
                <button
                  onClick={handleCreate}
                  disabled={creating || !newName.trim()}
                  className="rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Create'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowNew(true)}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
              >
                <Plus className="h-3.5 w-3.5" />
                New dataset
              </button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ── Trace row ────────────────────────────────────────────────────────────────

function TraceRow({
  trace,
  onExpand,
  apiKey,
}: {
  trace: Trace;
  onExpand?: (trace: Trace) => Promise<Trace>;
  apiKey?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [resolved, setResolved] = useState<Trace>(trace);
  const [loadingChildren, setLoadingChildren] = useState(false);

  async function handleToggle() {
    if (!expanded && onExpand && !resolved.rootSpan.children) {
      setLoadingChildren(true);
      try {
        const enriched = await onExpand(trace);
        setResolved(enriched);
      } finally {
        setLoadingChildren(false);
      }
    }
    setExpanded((v) => !v);
  }

  return (
    <div className="overflow-hidden bg-slate-900/60">
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-slate-800/30"
      >
        {loadingChildren ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-slate-500" />
        ) : expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="truncate text-sm font-medium text-slate-200">{resolved.name}</span>
            <StatusBadge status={resolved.status} />
            {resolved.tags?.map((tag) => (
              <span
                key={tag}
                className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-500"
              >
                {tag}
              </span>
            ))}
          </div>
          {resolved.rootSpan.input && (
            <p className="mt-0.5 max-w-xl truncate text-xs text-slate-400 italic">
              {resolved.rootSpan.input}
            </p>
          )}
          <div className="mt-1 flex items-center gap-4 text-xs text-slate-500">
            <span>{formatDate(resolved.startTime)}</span>
            <span className="font-mono text-slate-700">{resolved.id}</span>
          </div>
        </div>
        <div className="hidden shrink-0 items-center gap-6 text-right sm:flex">
          <div>
            <p className="text-xs text-slate-500">Latency</p>
            <p className="font-mono text-sm text-slate-300">{formatDuration(resolved.latencyMs)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Tokens</p>
            <p className="font-mono text-sm text-slate-300">{formatNumber(resolved.totalTokens)}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Cost</p>
            <p className="font-mono text-sm text-slate-300">{formatCost(resolved.totalCost)}</p>
          </div>
        </div>
        {/* Mobile: inline stats */}
        <div className="flex shrink-0 items-center gap-3 text-right sm:hidden">
          <span className="font-mono text-xs text-slate-400">{formatDuration(resolved.latencyMs)}</span>
          <span className="font-mono text-xs text-slate-600">{formatNumber(resolved.totalTokens)} tok</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-slate-800">
          {/* Eval scores */}
          {resolved.feedbackScores && (
            <div className="flex gap-3 border-b border-slate-800/50 px-5 py-3">
              {Object.entries(resolved.feedbackScores).map(([key, val]) => (
                <div key={key} className="rounded-lg bg-slate-800/50 px-3 py-1.5">
                  <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                    {key}
                  </span>
                  <span
                    className={`ml-2 font-mono text-xs font-semibold ${
                      val >= 0.8
                        ? 'text-emerald-400'
                        : val >= 0.5
                          ? 'text-amber-400'
                          : 'text-rose-400'
                    }`}
                  >
                    {(val * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* I/O panel - always show when there's content */}
          {(resolved.rootSpan.input || resolved.rootSpan.output) && (
            <div className="grid grid-cols-1 gap-0 border-b border-slate-800/50 sm:grid-cols-2">
              {resolved.rootSpan.input && (
                <div className="border-b border-slate-800/50 px-5 py-4 sm:border-b-0 sm:border-r">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    Input
                  </p>
                  <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-400">
                    {resolved.rootSpan.input}
                  </p>
                </div>
              )}
              {resolved.rootSpan.output ? (
                <div className="px-5 py-4">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                    Output
                  </p>
                  <p className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-emerald-400/80">
                    {resolved.rootSpan.output}
                  </p>
                </div>
              ) : (
                <div className="flex items-center px-5 py-4">
                  <p className="text-xs italic text-slate-700">
                    {loadingChildren ? 'Loading…' : 'No output captured'}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Add to Dataset */}
          {apiKey && (resolved.rootSpan.input || resolved.rootSpan.output) && (
            <div className="flex items-center justify-between border-b border-slate-800/50 bg-slate-900/40 px-5 py-2.5">
              <p className="text-[11px] text-slate-600">
                Save this input/output pair as a labeled example for regression testing.
              </p>
              <AddToDataset
                apiKey={apiKey}
                traceInput={resolved.rootSpan.input ?? ''}
                traceOutput={resolved.rootSpan.output ?? ''}
              />
            </div>
          )}

          {/* Span tree */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-medium uppercase tracking-wider text-slate-600">
                  <th className="py-2 pl-5 pr-3">Span</th>
                  <th className="px-3 py-2">Type</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2 text-right">Duration</th>
                  <th className="px-3 py-2 text-right">Tokens</th>
                  <th className="px-3 py-2 text-right">Model</th>
                </tr>
              </thead>
              <tbody>
                <SpanRow span={resolved.rootSpan} suppressDetail />
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TraceSkeleton() {
  return (
    <div className="animate-pulse bg-slate-900/60 px-5 py-4">
      <div className="flex items-center gap-4">
        <div className="h-4 w-4 rounded bg-slate-800" />
        <div className="flex-1 space-y-2">
          <div className="h-4 w-64 rounded bg-slate-800" />
          <div className="h-3 w-40 rounded bg-slate-800" />
        </div>
        <div className="flex gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-1 text-right">
              <div className="ml-auto h-3 w-12 rounded bg-slate-800" />
              <div className="ml-auto h-4 w-16 rounded bg-slate-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TracesPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(15);
  const { data: traces, loading, error, isLive } = useTraces();

  // If a trace ID is passed in the URL, clear it once the page loads
  useEffect(() => {
    if (searchParams.get('q')) {
      window.history.replaceState({}, '', '/traces');
    }
  }, [searchParams]);
  const { config } = useLangSmith();

  // Lazily load child spans from LangSmith when a trace is expanded
  async function loadChildren(trace: Trace): Promise<Trace> {
    if (!config?.apiKey) return trace;
    try {
      const allRuns = await fetchRunChildren(config.apiKey, trace.id);
      if (allRuns.length === 0) return trace;
      return { ...trace, rootSpan: buildSpanTree(allRuns) };
    } catch {
      return trace;
    }
  }

  const q = query.toLowerCase();
  const filtered = traces.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.id.toLowerCase().includes(q) ||
      t.rootSpan.input?.toLowerCase().includes(q) ||
      t.tags?.some((tag) => tag.toLowerCase().includes(q)),
  );

  // Reset to page 1 when search query or page size changes
  useEffect(() => { setPage(1); }, [query, pageSize]);

  const pageStart = (page - 1) * pageSize;
  const paginated = filtered.slice(pageStart, pageStart + pageSize);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-slate-100">Traces</h1>
          <p className="text-sm text-slate-500">
            {loading ? 'Loading…' : `${filtered.length} trace${filtered.length !== 1 ? 's' : ''}${q ? ' matching' : ''} · Expandable span tree view`}
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
            Viewing demo data - connect LangSmith in Settings to see your real traces.
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

      {error && !error.includes('404') && !error.includes('sessions not found') && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-4 py-3 text-sm text-rose-300">
          Failed to load traces: {error}
        </div>
      )}

      {/* Empty state: connected but no traces yet */}
      {isLive && !loading && traces.length === 0 && (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-800 bg-slate-900/60 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10">
            <MessageSquare className="h-6 w-6 text-emerald-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-200">No traces yet</p>
            <p className="mt-1 max-w-xs text-xs text-slate-500">
              Send a message in Chat to create your first trace - each agent run is automatically logged to LangSmith.
            </p>
          </div>
          <Link
            to="/chat"
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
          >
            <MessageSquare className="h-4 w-4" />
            Go to Chat
          </Link>
        </div>
      )}

      {/* Only show search + list when we have real data */}
      {(!isLive || (!loading && traces.length > 0)) && (
        <>
          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search traces by name, ID, or tag…"
              className="w-full rounded-lg border border-slate-700 bg-slate-800/50 py-2 pl-10 pr-3 text-sm text-slate-200 placeholder-slate-600 outline-none transition-colors focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/25"
            />
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-800">
            <div className="space-y-0 divide-y divide-slate-800/60">
              {loading
                ? Array.from({ length: pageSize > 15 ? 5 : 5 }).map((_, i) => <TraceSkeleton key={i} />)
                : paginated.map((trace) => (
                    <TraceRow
                      key={trace.id}
                      trace={trace}
                      onExpand={isLive ? loadChildren : undefined}
                      apiKey={config?.apiKey}
                    />
                  ))}
              {!loading && filtered.length === 0 && (
                <p className="py-12 text-center text-sm text-slate-600">No traces match your search.</p>
              )}
            </div>

            {!loading && filtered.length > 0 && (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={filtered.length}
                onPage={setPage}
                onPageSize={setPageSize}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
