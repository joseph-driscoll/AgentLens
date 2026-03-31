import { useState, useEffect } from 'react';
import { useLangSmith } from '../contexts/LangSmithContext';
import { fetchRuns, fetchFeedback, fetchSessions, fetchSessionStats, fetchLLMRuns } from '../utils/langsmith';
import {
  adaptRunToTrace,
  adaptFeedbackToEvalResults,
  adaptSessionToDashboard,
  extractInputStr,
} from '../utils/adapters';
import {
  traces as mockTraces,
  evalResults as mockEvalResults,
  dashboardMetrics as mockDashboard,
} from '../data/mock';
import type { Trace, EvalResult, DashboardMetrics } from '../types';

// ── TTL cache ─────────────────────────────────────────────────────────────────
// Module-level so it persists across page navigations without refetching.

const CACHE_TTL = 5 * 60_000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  ts: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T): void {
  cache.set(key, { data, ts: Date.now() });
}

// ── Invalidation with reactive re-fetch ──────────────────────────────────────
// Hooks include `cacheVersion` in their dependency array. When invalidateCache()
// is called it bumps the version, which causes every mounted hook to re-run its
// effect and fetch fresh data - even if `config` hasn't changed.

let _cacheVersion = 0;
const _versionListeners = new Set<() => void>();

/** Force-clear all cached entries and immediately re-fetch in all mounted hooks. */
export function invalidateCache(): void {
  cache.clear();
  _cacheVersion++;
  _versionListeners.forEach((cb) => cb());
}

/** Internal hook - subscribes to cache invalidations. */
function useCacheVersion(): number {
  const [v, setV] = useState(_cacheVersion);
  useEffect(() => {
    const cb = () => setV((n) => n + 1);
    _versionListeners.add(cb);
    return () => { _versionListeners.delete(cb); };
  }, []);
  return v;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** If no projectId is saved, fall back to the first available session. */
async function resolveSessionId(apiKey: string, projectId: string): Promise<string> {
  if (projectId) return projectId;
  const cacheKey = `sessions:${apiKey}`;
  const cached = getCached<string>(cacheKey);
  if (cached) return cached;
  const sessions = await fetchSessions(apiKey);
  const id = sessions[0]?.id ?? '';
  if (id) setCached(cacheKey, id);
  return id;
}

/** Fetch root runs with a shared cache so Traces and Evals don't both hit /runs. */
async function fetchRootRuns(apiKey: string, sessionId: string, limit = 100) {
  const cacheKey = `runs:${apiKey}:${sessionId}`;
  const cached = getCached<Awaited<ReturnType<typeof fetchRuns>>>(cacheKey);
  if (cached) return cached;
  const runs = await fetchRuns(apiKey, { sessionId, isRoot: true, limit });
  setCached(cacheKey, runs);
  return runs;
}

// ── Shared state type ─────────────────────────────────────────────────────────

export interface AsyncState<T> {
  data: T;
  loading: boolean;
  error: string | null;
  /** true when data is sourced from the real LangSmith API */
  isLive: boolean;
}

// ── useTraces ────────────────────────────────────────────────────────────────

export function useTraces(): AsyncState<Trace[]> {
  const { config } = useLangSmith();
  const cacheVersion = useCacheVersion();
  const [data, setData] = useState<Trace[]>(mockTraces);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config?.apiKey) {
      setData(mockTraces);
      setError(null);
      return;
    }

    const cacheKey = `traces:${config.apiKey}:${config.projectId}`;
    const cached = getCached<Trace[]>(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    resolveSessionId(config.apiKey, config.projectId)
      .then((sessionId) => fetchRootRuns(config.apiKey, sessionId, 100))
      .then((runs) => {
        if (cancelled) return;
        const traces = runs.map((r) => adaptRunToTrace(r));
        setCached(cacheKey, traces);
        setData(traces);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, cacheVersion]);

  return { data, loading, error, isLive: !!config?.apiKey };
}

// ── useEvals ─────────────────────────────────────────────────────────────────

export function useEvals(): AsyncState<EvalResult[]> {
  const { config } = useLangSmith();
  const cacheVersion = useCacheVersion();
  const [data, setData] = useState<EvalResult[]>(mockEvalResults);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config?.apiKey) {
      setData(mockEvalResults);
      setError(null);
      return;
    }

    const cacheKey = `evals:${config.apiKey}:${config.projectId}`;
    const cached = getCached<EvalResult[]>(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    resolveSessionId(config.apiKey, config.projectId)
      .then((sessionId) => fetchRootRuns(config.apiKey, sessionId, 100))
      .then(async (runs) => {
        const runIds = runs.map((r) => r.id);
        // Prefer the user's input query as the label; fall back to run name
        const runLabelMap = new Map(
          runs.map((r) => [r.id, extractInputStr(r) ?? r.name]),
        );
        const feedback = await fetchFeedback(config.apiKey, runIds);
        if (cancelled) return;
        const evals = adaptFeedbackToEvalResults(feedback, runLabelMap);
        setCached(cacheKey, evals);
        setData(evals);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, cacheVersion]);

  return { data, loading, error, isLive: !!config?.apiKey };
}

// ── useDashboard ─────────────────────────────────────────────────────────────

export function useDashboard(): AsyncState<DashboardMetrics> {
  const { config } = useLangSmith();
  const cacheVersion = useCacheVersion();
  const [data, setData] = useState<DashboardMetrics>(mockDashboard);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!config?.apiKey) {
      setData(mockDashboard);
      setError(null);
      return;
    }

    const cacheKey = `dashboard:${config.apiKey}:${config.projectId}`;
    const cached = getCached<DashboardMetrics>(cacheKey);
    if (cached) {
      setData(cached);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);

    resolveSessionId(config.apiKey, config.projectId)
      .then(async (sessionId) => {
        // Three parallel fetches:
        //  1. Session stats   - accurate totals over ALL runs (not capped at 100)
        //  2. LLM child runs  - carry model name + cost for the Cost by Model chart
        //  3. Recent traces   - for the time-series and latency distribution charts
        const [session, llmRuns, runs] = await Promise.all([
          fetchSessionStats(config.apiKey, sessionId),
          fetchLLMRuns(config.apiKey, sessionId, sevenDaysAgo),
          fetchRootRuns(config.apiKey, sessionId, 100),
        ]);
        const traces = runs.map((r) => adaptRunToTrace(r));
        // Fetch run-level feedback for the Eval Scores chart
        let evals: EvalResult[] = [];
        try {
          const feedback = await fetchFeedback(config.apiKey, runs.map((r) => r.id));
          evals = adaptFeedbackToEvalResults(feedback);
        } catch { /* eval chart optional */ }
        return { session, llmRuns, traces, evals };
      })
      .then(({ session, llmRuns, traces, evals }) => {
        if (cancelled) return;
        const metrics = adaptSessionToDashboard(session, llmRuns, traces, evals);
        setCached(cacheKey, metrics);
        setData(metrics);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError((err as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, cacheVersion]);

  return { data, loading, error, isLive: !!config?.apiKey };
}
