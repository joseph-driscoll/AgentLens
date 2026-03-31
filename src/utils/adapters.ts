import type {
  Trace,
  Span,
  EvalResult,
  EvalSource,
  DashboardMetrics,
  SpanType,
  LatencyBucket,
  ModelCost,
  EvalSummary,
  TimeSeriesPoint,
} from '../types';
import type { LangSmithRun, LangSmithFeedback, LangSmithSessionStats } from './langsmith';

// ── Helpers ─────────────────────────────────────────────────────────────────

function toMs(isoString: string | null | undefined): number {
  if (!isoString) return Date.now();
  return new Date(isoString).getTime();
}

const VALID_SPAN_TYPES: SpanType[] = ['chain', 'llm', 'tool', 'retriever', 'agent'];

function toSpanType(runType: string): SpanType {
  return VALID_SPAN_TYPES.includes(runType as SpanType)
    ? (runType as SpanType)
    : 'chain';
}

function extractModel(run: LangSmithRun): string | undefined {
  const params = run.extra?.invocation_params;
  if (!params) return undefined;
  return (
    (params.model_name as string | undefined) ??
    (params.model as string | undefined) ??
    undefined
  );
}

/**
 * Normalize a raw message object to plain text content.
 *
 * Handles three serialization formats:
 *  1. Python/standard  - { role|type: "human"|"ai", content: "..." }
 *  2. LangChain JS SDK - { lc: 1, type: "constructor", kwargs: { content: "...", type: "human" } }
 *  3. OpenAI role/content - { role: "user"|"assistant", content: "..." }
 *
 * Pass `humanOnly: true` to accept only human/user roles.
 * Pass `aiOnly: true` to accept only ai/assistant roles.
 */
function extractMsgText(
  raw: unknown,
  opts: { humanOnly?: boolean; aiOnly?: boolean } = {},
): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const msg = raw as Record<string, unknown>;

  // LangChain JS SDK serialized format: { lc: 1, type: "constructor", kwargs: {...} }
  if (msg.lc === 1 && msg.type === 'constructor' && msg.kwargs) {
    const kwargs = msg.kwargs as Record<string, unknown>;
    const role = ((kwargs.role ?? kwargs.type) as string | undefined)?.toLowerCase();
    if (opts.humanOnly && role && !['human', 'user'].includes(role)) return undefined;
    if (opts.aiOnly && role && !['ai', 'assistant'].includes(role)) return undefined;
    if (typeof kwargs.content === 'string' && kwargs.content.trim()) return kwargs.content;
    return undefined;
  }

  // Standard format
  const role = ((msg.role ?? msg.type) as string | undefined)?.toLowerCase();
  if (opts.humanOnly && role && !['human', 'user'].includes(role)) return undefined;
  if (opts.aiOnly && role && !['ai', 'assistant'].includes(role)) return undefined;
  if (typeof msg.content === 'string' && msg.content.trim()) return msg.content;
  return undefined;
}

export function extractInputStr(run: LangSmithRun): string | undefined {
  if (!run.inputs || Object.keys(run.inputs).length === 0) return undefined;

  for (const val of Object.values(run.inputs)) {
    if (typeof val === 'string' && val.trim()) return val.slice(0, 300);
    if (!Array.isArray(val)) continue;
    // Find the first human/user message in the messages array
    for (const raw of val) {
      const text = extractMsgText(raw, { humanOnly: true });
      if (text) return text.slice(0, 300);
    }
    // No role specified - accept any first message with content
    for (const raw of val) {
      const text = extractMsgText(raw);
      if (text) return text.slice(0, 300);
    }
  }
  return undefined; // avoid leaking raw JSON into the UI
}

function extractOutputStr(run: LangSmithRun): string | undefined {
  if (!run.outputs || Object.keys(run.outputs).length === 0) return undefined;

  for (const val of Object.values(run.outputs)) {
    if (typeof val === 'string' && val.trim()) return val.slice(0, 500);
    if (!Array.isArray(val)) continue;

    // LangGraph: last AI/assistant message is the final answer - scan backwards
    for (let i = val.length - 1; i >= 0; i--) {
      const text = extractMsgText(val[i], { aiOnly: true });
      if (text) return text.slice(0, 500);
    }

    // No role specified - accept last message with any content
    for (let i = val.length - 1; i >= 0; i--) {
      const text = extractMsgText(val[i]);
      if (text) return text.slice(0, 500);
    }

    // Older generations format: [[{ text: "..." }]]
    if (Array.isArray(val[0])) {
      const gen = (val[0] as Array<Record<string, unknown>>)[0];
      if (gen?.text && typeof gen.text === 'string') return gen.text.slice(0, 500);
    }
  }
  return undefined;
}

// ── Single run → Span ────────────────────────────────────────────────────────

export function adaptRunToSpan(run: LangSmithRun): Span {
  const startTime = toMs(run.start_time);
  const endTime = toMs(run.end_time) || startTime;
  const promptTokens = run.prompt_tokens ?? 0;
  const completionTokens = run.completion_tokens ?? 0;
  const totalTokens =
    promptTokens + completionTokens > 0
      ? promptTokens + completionTokens
      : (run.total_tokens ?? 0);

  const span: Span = {
    id: run.id,
    name: run.name,
    type: toSpanType(run.run_type),
    status: run.error ? 'error' : 'success',
    startTime,
    endTime,
  };

  if (totalTokens > 0) {
    span.tokens = { input: promptTokens, output: completionTokens, total: totalTokens };
  }
  if (run.total_cost != null && run.total_cost > 0) span.cost = run.total_cost;

  const inputStr = extractInputStr(run);
  const outputStr = extractOutputStr(run);
  if (inputStr) span.input = inputStr;
  if (outputStr) span.output = outputStr;

  const model = extractModel(run);
  if (model) span.model = model;
  if (run.error) span.error = run.error;

  return span;
}

// ── Build span tree from a flat list of runs ─────────────────────────────────

export function buildSpanTree(runs: LangSmithRun[]): Span {
  const root = runs.find((r) => r.parent_run_id === null) ?? runs[0];
  const spanMap = new Map<string, Span>(runs.map((r) => [r.id, adaptRunToSpan(r)]));

  // Group children by parent
  const childIndex = new Map<string, string[]>();
  runs.forEach((r) => {
    if (r.parent_run_id) {
      const arr = childIndex.get(r.parent_run_id) ?? [];
      arr.push(r.id);
      childIndex.set(r.parent_run_id, arr);
    }
  });

  // Attach children recursively
  function attach(spanId: string): Span {
    const span = spanMap.get(spanId)!;
    const children = (childIndex.get(spanId) ?? [])
      .map((id) => attach(id))
      .sort((a, b) => a.startTime - b.startTime);
    if (children.length > 0) span.children = children;
    return span;
  }

  return attach(root.id);
}

// ── Root run → Trace ─────────────────────────────────────────────────────────

/** Adapt a root run to a Trace. Optionally include all sibling runs to build a full span tree. */
export function adaptRunToTrace(run: LangSmithRun, allRunsInTrace?: LangSmithRun[]): Trace {
  const startTime = toMs(run.start_time);
  const endTime = toMs(run.end_time) || startTime;
  const latencyMs = Math.max(0, endTime - startTime);
  const promptTokens = run.prompt_tokens ?? 0;
  const completionTokens = run.completion_tokens ?? 0;
  const totalTokens =
    promptTokens + completionTokens > 0
      ? promptTokens + completionTokens
      : (run.total_tokens ?? 0);

  const feedbackScores: Record<string, number> | undefined = run.feedback_stats
    ? Object.fromEntries(
        Object.entries(run.feedback_stats)
          .filter(([, v]) => v.avg != null)
          .map(([k, v]) => [k, v.avg]),
      )
    : undefined;

  const rootSpan = allRunsInTrace
    ? buildSpanTree(allRunsInTrace)
    : adaptRunToSpan(run);

  const trace: Trace = {
    id: run.id,
    name: run.name,
    rootSpan,
    startTime,
    endTime,
    latencyMs,
    status: run.error ? 'error' : 'success',
    totalTokens,
    totalCost: run.total_cost ?? 0,
  };

  if (feedbackScores && Object.keys(feedbackScores).length > 0) {
    trace.feedbackScores = feedbackScores;
  }
  if (run.tags && run.tags.length > 0) trace.tags = run.tags;

  return trace;
}

// ── Feedback → EvalResult[] ──────────────────────────────────────────────────

function detectSource(f: LangSmithFeedback): EvalSource {
  const c = (f.comment ?? '').toLowerCase();
  // Experiment runner comment contains "experiment:" - check this first because
  // it also contains "llm-as-judge", so order matters.
  if (c.includes('experiment:')) return 'experiment';
  // LLM-as-judge from chat page: "LLM-as-judge (GPT-4o-mini)"
  if (c.includes('llm-as-judge') || c.includes('llm-judge') || c.includes('gpt-4o')) return 'llm-judge';
  if (c.includes('human') || c.includes('manual') || c.includes('annotation')) return 'human';
  if (c.includes('heuristic') || c.includes('auto')) return 'heuristic';
  return 'unknown';
}

export function adaptFeedbackToEvalResults(
  feedback: LangSmithFeedback[],
  runLabelMap?: Map<string, string>,
): EvalResult[] {
  return feedback
    .filter((f) => f.score != null)
    .map((f) => ({
      id: f.id,
      traceId: f.run_id,
      traceName: runLabelMap?.get(f.run_id) ?? f.run_id,
      evaluator: f.key,
      score: f.score as number,
      source: detectSource(f),
      ...(f.comment ? { comment: f.comment } : {}),
      createdAt: toMs(f.created_at),
    }));
}

// ── Traces + Evals → DashboardMetrics ────────────────────────────────────────

export function computeDashboardMetrics(
  traces: Trace[],
  evalResults: EvalResult[],
): DashboardMetrics {
  const totalTraces = traces.length;
  const errorCount = traces.filter((r) => r.status === 'error').length;
  const errorRate = totalTraces > 0 ? errorCount / totalTraces : 0;
  const avgLatencyMs =
    totalTraces > 0
      ? traces.reduce((s, r) => s + r.latencyMs, 0) / totalTraces
      : 0;
  const totalCost = traces.reduce((s, r) => s + r.totalCost, 0);

  const evalScores = evalResults.map((e) => e.score);
  const avgEvalScore =
    evalScores.length > 0
      ? evalScores.reduce((s, n) => s + n, 0) / evalScores.length
      : 0;

  // Latency distribution
  const latencyDistribution: LatencyBucket[] = [
    { bucket: '<1s', count: 0 },
    { bucket: '1-2s', count: 0 },
    { bucket: '2-5s', count: 0 },
    { bucket: '5-10s', count: 0 },
    { bucket: '10-20s', count: 0 },
    { bucket: '>20s', count: 0 },
  ];
  traces.forEach(({ latencyMs }) => {
    const s = latencyMs / 1000;
    if (s < 1) latencyDistribution[0].count++;
    else if (s < 2) latencyDistribution[1].count++;
    else if (s < 5) latencyDistribution[2].count++;
    else if (s < 10) latencyDistribution[3].count++;
    else if (s < 20) latencyDistribution[4].count++;
    else latencyDistribution[5].count++;
  });

  // Cost + tokens by model - walk the span trees
  const modelMap = new Map<string, { cost: number; tokens: number }>();
  function accumulateSpan(span: Span): void {
    if (span.model) {
      const entry = modelMap.get(span.model) ?? { cost: 0, tokens: 0 };
      entry.cost += span.cost ?? 0;
      entry.tokens += span.tokens?.total ?? 0;
      modelMap.set(span.model, entry);
    }
    span.children?.forEach(accumulateSpan);
  }
  traces.forEach((t) => accumulateSpan(t.rootSpan));

  const costByModel: ModelCost[] = Array.from(modelMap.entries())
    .map(([model, { cost, tokens }]) => ({ model, cost, tokens }))
    .sort((a, b) => b.cost - a.cost);

  // Eval scores by evaluator type
  const evalMap = new Map<string, number[]>();
  evalResults.forEach(({ evaluator, score }) => {
    const arr = evalMap.get(evaluator) ?? [];
    arr.push(score);
    evalMap.set(evaluator, arr);
  });
  const evalScoresByType: EvalSummary[] = Array.from(evalMap.entries()).map(
    ([evaluator, scores]) => ({
      evaluator,
      avgScore: scores.reduce((s, n) => s + n, 0) / scores.length,
      count: scores.length,
    }),
  );

  // Traces by day - last 7 days
  const now = Date.now();
  const DAY = 86_400_000;
  const tracesByDay: TimeSeriesPoint[] = Array.from({ length: 7 }, (_, i) => {
    const dayStart = now - (6 - i) * DAY;
    const dayEnd = dayStart + DAY;
    const label = new Date(dayStart).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const dayRuns = traces.filter((r) => r.startTime >= dayStart && r.startTime < dayEnd);
    return {
      date: label,
      count: dayRuns.length,
      errors: dayRuns.filter((r) => r.status === 'error').length,
    };
  });

  return {
    totalTraces,
    avgLatencyMs,
    totalCost,
    avgEvalScore,
    errorRate,
    tracesByDay,
    latencyDistribution,
    costByModel,
    evalScoresByType,
  };
}

// ── Session stats + LLM runs → DashboardMetrics ───────────────────────────────
//
// Uses pre-aggregated session stats for the top cards (accurate over ALL runs,
// not just the 100 we sample), and LLM-type child runs for the Cost by Model
// chart (since root chain runs don't carry model name info).

export function adaptSessionToDashboard(
  session: LangSmithSessionStats,
  llmRuns: LangSmithRun[],
  recentTraces: Trace[],  // used for time-series and latency distribution
  evalResults: EvalResult[] = [],
): DashboardMetrics {
  // ── Top card metrics from session stats ─────────────────────────────────
  const totalTraces = session.run_count ?? recentTraces.length;
  const avgLatencyMs = session.latency_p50 != null ? session.latency_p50 * 1000 : 0;
  const totalCost = session.total_cost != null ? parseFloat(session.total_cost) : 0;
  const errorRate = session.error_rate ?? 0;

  const feedbackStats = session.feedback_stats ?? {};
  const avgEvalScore = evalResults.length > 0
    ? evalResults.reduce((s, e) => s + e.score, 0) / evalResults.length
    : (() => {
        const vals = Object.values(feedbackStats).map((v) => (v as { avg: number }).avg).filter(Boolean);
        return vals.length > 0 ? vals.reduce((s, n) => s + n, 0) / vals.length : 0;
      })();

  // ── Cost by Model from LLM child runs ────────────────────────────────────
  const modelMap = new Map<string, { cost: number; tokens: number }>();
  llmRuns.forEach((run) => {
    const model =
      (run.extra?.invocation_params?.model_name as string | undefined) ??
      (run.extra?.invocation_params?.model as string | undefined) ??
      (run.extra?.metadata?.ls_model_name as string | undefined);
    if (!model) return;
    const entry = modelMap.get(model) ?? { cost: 0, tokens: 0 };
    entry.cost += run.total_cost ?? 0;
    entry.tokens +=
      (run.prompt_tokens ?? 0) + (run.completion_tokens ?? 0) || (run.total_tokens ?? 0);
    modelMap.set(model, entry);
  });
  const costByModel: ModelCost[] = Array.from(modelMap.entries())
    .map(([model, { cost, tokens }]) => ({ model, cost, tokens }))
    .sort((a, b) => b.cost - a.cost);

  // ── Eval scores by type - prefer run-level feedback, fall back to session stats ──
  let evalScoresByType: EvalSummary[];
  if (evalResults.length > 0) {
    const evalMap = new Map<string, number[]>();
    evalResults.forEach(({ evaluator, score }) => {
      const arr = evalMap.get(evaluator) ?? [];
      arr.push(score);
      evalMap.set(evaluator, arr);
    });
    evalScoresByType = Array.from(evalMap.entries()).map(([evaluator, scores]) => ({
      evaluator,
      avgScore: scores.reduce((s, n) => s + n, 0) / scores.length,
      count: scores.length,
    }));
  } else {
    evalScoresByType = Object.entries(feedbackStats).map(([key, v]) => ({
      evaluator: key,
      avgScore: (v as { avg: number }).avg,
      count: (v as { n: number }).n,
    }));
  }

  // ── Time series + latency distribution from recent sampled traces ────────
  const now = Date.now();
  const DAY = 86_400_000;
  const tracesByDay: TimeSeriesPoint[] = Array.from({ length: 7 }, (_, i) => {
    const dayStart = now - (6 - i) * DAY;
    const dayEnd = dayStart + DAY;
    const label = new Date(dayStart).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const dayRuns = recentTraces.filter(
      (r) => r.startTime >= dayStart && r.startTime < dayEnd,
    );
    return {
      date: label,
      count: dayRuns.length,
      errors: dayRuns.filter((r) => r.status === 'error').length,
    };
  });

  const latencyDistribution: LatencyBucket[] = [
    { bucket: '<1s', count: 0 },
    { bucket: '1-2s', count: 0 },
    { bucket: '2-5s', count: 0 },
    { bucket: '5-10s', count: 0 },
    { bucket: '10-20s', count: 0 },
    { bucket: '>20s', count: 0 },
  ];
  recentTraces.forEach(({ latencyMs }) => {
    const s = latencyMs / 1000;
    if (s < 1) latencyDistribution[0].count++;
    else if (s < 2) latencyDistribution[1].count++;
    else if (s < 5) latencyDistribution[2].count++;
    else if (s < 10) latencyDistribution[3].count++;
    else if (s < 20) latencyDistribution[4].count++;
    else latencyDistribution[5].count++;
  });

  return {
    totalTraces,
    avgLatencyMs,
    totalCost,
    avgEvalScore,
    errorRate,
    tracesByDay,
    latencyDistribution,
    costByModel,
    evalScoresByType,
  };
}
