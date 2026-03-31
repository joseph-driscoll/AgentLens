// In dev the Vite proxy rewrites /langsmith/* → https://api.smith.langchain.com/*
// avoiding the CORS preflight 405 that LangSmith returns for browser requests.
// In production you would swap this for a serverless proxy or backend route.
export const LANGSMITH_BASE =
  import.meta.env.DEV ? '/langsmith' : 'https://api.smith.langchain.com';

// ── Raw API shapes ──────────────────────────────────────────────────────────

export interface LangSmithRun {
  id: string;
  name: string;
  run_type: 'chain' | 'llm' | 'tool' | 'retriever' | 'agent' | string;
  start_time: string;
  end_time: string | null;
  error: string | null;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown> | null;
  feedback_stats: Record<string, { n: number; avg: number; mode: unknown }> | null;
  total_tokens: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_cost: number | null;
  tags: string[] | null;
  parent_run_id: string | null;
  session_id: string | null;
  extra: {
    invocation_params?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  } | null;
  serialized: Record<string, unknown> | null;
  child_run_ids: string[] | null;
}

export interface LangSmithFeedback {
  id: string;
  run_id: string;
  key: string;
  score: number | null;
  value: unknown;
  comment: string | null;
  created_at: string;
  modified_at: string;
}

export interface LangSmithSession {
  id: string;
  name: string;
  start_time: string;
  last_run_start_time: string | null;
  run_count: number;
}

/** Richer session object returned by GET /api/v1/sessions/{id} */
export interface LangSmithSessionStats {
  id: string;
  name: string;
  run_count: number | null;
  latency_p50: number | null;
  latency_p99: number | null;
  total_cost: string | null;   // string in the API!
  error_rate: number | null;
  streaming_rate: number | null;
  feedback_stats: Record<string, { n: number; avg: number; mode: unknown }> | null;
  run_facets: Array<Record<string, unknown>> | null;
  last_run_start_time: string | null;
}

// ── Fetch options ───────────────────────────────────────────────────────────

export interface FetchRunsOptions {
  sessionId?: string;
  isRoot?: boolean;
  traceId?: string;
  parentRunId?: string;
  limit?: number;
  offset?: number;
  startTime?: Date;
  endTime?: Date;
}

// ── Core fetch helpers ───────────────────────────────────────────────────────

// Use string concatenation instead of new URL() so relative paths like
// '/langsmith' (Vite dev proxy) work alongside absolute prod URLs.

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function langsmithRequest<T>(
  request: () => Promise<Response>,
  retries = 2,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await request();
    if (res.ok) return res.json() as Promise<T>;
    if (res.status === 429 && attempt < retries) {
      // Respect Retry-After header if present, otherwise exponential backoff
      const retryAfter = res.headers.get('Retry-After');
      const delay = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000 * (attempt + 1);
      await sleep(delay);
      continue;
    }
    const text = await res.text().catch(() => res.statusText);
    lastError = new Error(`LangSmith ${res.status}: ${text}`);
    break;
  }
  throw lastError ?? new Error('LangSmith request failed');
}

async function langsmithGet<T>(
  apiKey: string,
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const qs = params && Object.keys(params).length
    ? '?' + new URLSearchParams(
        Object.entries(params).map(([k, v]) => [k, String(v)])
      ).toString()
    : '';
  return langsmithRequest<T>(
    () => fetch(`${LANGSMITH_BASE}${path}${qs}`, { headers: { 'x-api-key': apiKey } }),
  );
}

async function langsmithPost<T>(
  apiKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  return langsmithRequest<T>(
    () => fetch(`${LANGSMITH_BASE}${path}`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

// ── Public API functions ────────────────────────────────────────────────────

/** Validate an API key and return a list of accessible projects. */
export async function fetchSessions(apiKey: string): Promise<LangSmithSession[]> {
  return langsmithGet<LangSmithSession[]>(apiKey, '/api/v1/sessions', { limit: 100 });
}

/**
 * Fetch a page of runs via POST /api/v1/runs/query.
 * The body accepts session (array), is_root, limit, start_time, end_time.
 */
export async function fetchRuns(
  apiKey: string,
  options: FetchRunsOptions = {},
): Promise<LangSmithRun[]> {
  const body: Record<string, unknown> = { limit: Math.min(options.limit ?? 50, 100) };
  if (options.sessionId) body.session = [options.sessionId];
  if (options.isRoot !== undefined) body.is_root = options.isRoot;
  if (options.traceId) body.trace = [options.traceId];
  if (options.parentRunId) body.parent_run = [options.parentRunId];
  if (options.startTime) body.start_time = options.startTime.toISOString();
  if (options.endTime) body.end_time = options.endTime.toISOString();

  const data = await langsmithPost<{ runs: LangSmithRun[] }>(
    apiKey,
    '/api/v1/runs/query',
    body,
  );
  return data.runs ?? [];
}

/**
 * Fetch all runs belonging to a single trace (root + all descendants).
 * Use the returned flat list with buildSpanTree() to reconstruct the hierarchy.
 */
export async function fetchRunChildren(
  apiKey: string,
  traceId: string,
): Promise<LangSmithRun[]> {
  const data = await langsmithPost<{ runs: LangSmithRun[] }>(
    apiKey,
    '/api/v1/runs/query',
    { trace: [traceId], limit: 100 },
  );
  return data.runs ?? [];
}

/**
 * Fetch feedback (evaluations) for a set of run IDs.
 * GET /api/v1/feedback with repeated `run` query params.
 */
export async function fetchFeedback(
  apiKey: string,
  runIds: string[],
): Promise<LangSmithFeedback[]> {
  if (runIds.length === 0) return [];

  // Repeated `run` params - build manually since URLSearchParams.set() dedupes
  const qs = runIds
    .slice(0, 100)
    .map((id) => `run=${encodeURIComponent(id)}`)
    .join('&');
  const url = `${LANGSMITH_BASE}/api/v1/feedback?limit=100&${qs}`;

  const res = await fetch(url, { headers: { 'x-api-key': apiKey } });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`LangSmith ${res.status}: ${text}`);
  }
  return res.json() as Promise<LangSmithFeedback[]>;
}

/**
 * Log a single evaluation score for a run.
 * key   - evaluator name, e.g. "helpfulness"
 * score - 0.0–1.0
 */
export async function createFeedback(
  apiKey: string,
  runId: string,
  key: string,
  score: number,
  comment?: string,
): Promise<void> {
  await langsmithRequest<unknown>(
    () => fetch(`${LANGSMITH_BASE}/api/v1/feedback`, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ run_id: runId, key, score, ...(comment ? { comment } : {}) }),
    }),
  );
}

/**
 * Fetch pre-aggregated stats for a single session/project.
 * Returns run_count, latency percentiles, total_cost, error_rate, feedback_stats.
 * Much cheaper than fetching 100 runs and computing ourselves.
 */
export async function fetchSessionStats(
  apiKey: string,
  sessionId: string,
): Promise<LangSmithSessionStats> {
  return langsmithGet<LangSmithSessionStats>(apiKey, `/api/v1/sessions/${sessionId}`);
}

// ── Dataset types ─────────────────────────────────────────────────────────

export interface LangSmithDataset {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
  modified_at: string;
  example_count: number;
  session_count: number;
  data_type: 'kv' | 'llm' | 'chat' | string;
}

export interface LangSmithExample {
  id: string;
  dataset_id: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown> | null;
  created_at: string;
}

export interface LangSmithDatasetSession {
  id: string;
  name: string;
  start_time: string;
  run_count: number;
  feedback_stats: Record<string, { n: number; avg: number }> | null;
}

export async function fetchDatasets(apiKey: string): Promise<LangSmithDataset[]> {
  return langsmithGet<LangSmithDataset[]>(apiKey, '/api/v1/datasets', { limit: 100 });
}

/**
 * Create a new dataset in LangSmith.
 */
export async function createDataset(
  apiKey: string,
  name: string,
  description?: string,
): Promise<LangSmithDataset> {
  return langsmithPost<LangSmithDataset>(apiKey, '/api/v1/datasets', {
    name,
    ...(description ? { description } : {}),
    data_type: 'kv',
  });
}

/**
 * Add a trace's input/output as a labeled example to a dataset.
 * This is the "Add to Dataset" action that lets you build regression suites
 * from production traces.
 */
/**
 * Create a new experiment session linked to a dataset.
 * This is the programmatic equivalent of clicking "Run Experiment" in LangSmith Studio.
 * Experiments appear in the Datasets page under their parent dataset.
 */
export async function createExperimentSession(
  apiKey: string,
  name: string,
  datasetId: string,
): Promise<LangSmithSession> {
  return langsmithPost<LangSmithSession>(apiKey, '/api/v1/sessions', {
    name,
    reference_dataset_id: datasetId,
  });
}

export async function createExample(
  apiKey: string,
  datasetId: string,
  inputs: Record<string, unknown>,
  outputs: Record<string, unknown>,
): Promise<{ id: string }> {
  return langsmithPost<{ id: string }>(apiKey, '/api/v1/examples', {
    dataset_id: datasetId,
    inputs,
    outputs,
  });
}

export async function fetchDatasetExamples(
  apiKey: string,
  datasetId: string,
): Promise<LangSmithExample[]> {
  return langsmithGet<LangSmithExample[]>(apiKey, `/api/v1/examples`, {
    dataset: datasetId,
    limit: 100,
  });
}

/**
 * Fetch experiment sessions linked to a dataset.
 * LangSmith calls them "sessions" - each experiment run creates one.
 */
export async function fetchDatasetSessions(
  apiKey: string,
  datasetId: string,
): Promise<LangSmithDatasetSession[]> {
  return langsmithGet<LangSmithDatasetSession[]>(
    apiKey,
    `/api/v1/sessions`,
    { reference_dataset: datasetId, limit: 50 },
  );
}

/**
 * Clear all traces by deleting the session and immediately recreating it
 * with the same name. LangSmith's REST API does not expose DELETE on
 * individual runs, so session-level deletion is the only supported path.
 *
 * Datasets are stored independently and are NOT affected.
 *
 * Returns the new session so the caller can update stored config.
 */
export async function clearAndRecreateSession(
  apiKey: string,
  sessionId: string,
  sessionName: string,
): Promise<LangSmithSession> {
  await deleteSession(apiKey, sessionId);
  return langsmithPost<LangSmithSession>(apiKey, '/api/v1/sessions', { name: sessionName });
}

/**
 * Delete a single feedback entry by ID.
 */
export async function deleteFeedback(apiKey: string, feedbackId: string): Promise<void> {
  await langsmithRequest<unknown>(
    () => fetch(`${LANGSMITH_BASE}/api/v1/feedback/${feedbackId}`, {
      method: 'DELETE',
      headers: { 'x-api-key': apiKey },
    }),
  );
}

/**
 * Fetch ALL feedback for a session, then delete each one.
 * Returns the count deleted.
 */
export async function deleteAllFeedbackForSession(
  apiKey: string,
  sessionId: string,
): Promise<number> {
  // Get all runs in the session first to collect run IDs
  const runsData = await langsmithPost<{ runs: LangSmithRun[] }>(
    apiKey,
    '/api/v1/runs/query',
    { session: [sessionId], is_root: true, limit: 100 },
  );
  const runs = runsData.runs ?? [];
  if (runs.length === 0) return 0;

  const runIds = runs.map((r) => r.id);
  const qs = runIds.map((id) => `run=${encodeURIComponent(id)}`).join('&');
  const feedbackRes = await fetch(`${LANGSMITH_BASE}/api/v1/feedback?limit=100&${qs}`, {
    headers: { 'x-api-key': apiKey },
  });
  if (!feedbackRes.ok) return 0;

  const feedback = (await feedbackRes.json()) as LangSmithFeedback[];
  await Promise.allSettled(
    feedback.map((f) => deleteFeedback(apiKey, f.id)),
  );
  return feedback.length;
}

/**
 * Delete the entire session (project) and all its runs from LangSmith.
 * This is irreversible.
 */
export async function deleteSession(apiKey: string, sessionId: string): Promise<void> {
  await langsmithRequest<unknown>(
    () => fetch(`${LANGSMITH_BASE}/api/v1/sessions/${sessionId}`, {
      method: 'DELETE',
      headers: { 'x-api-key': apiKey },
    }),
  );
}

/**
 * Fetch LLM-type child runs for a session to build the Cost by Model chart.
 * Uses select to only pull the fields we need (model name + cost).
 */
export async function fetchLLMRuns(
  apiKey: string,
  sessionId: string,
  startTime?: Date,
): Promise<LangSmithRun[]> {
  const body: Record<string, unknown> = {
    session: [sessionId],
    run_type: 'llm',
    limit: 100,
    select: ['id', 'name', 'extra', 'total_cost', 'total_tokens', 'prompt_tokens', 'completion_tokens'],
  };
  if (startTime) body.start_time = startTime.toISOString();
  const data = await langsmithPost<{ runs: LangSmithRun[] }>(
    apiKey,
    '/api/v1/runs/query',
    body,
  );
  return data.runs ?? [];
}
