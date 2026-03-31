/**
 * LangGraph JS dev-server client (localhost:2024, proxied at /langgraph).
 *
 * Uses POST /runs/wait - simple synchronous JSON, no SSE parsing.
 * The chat UI animates the response client-side for the typewriter effect.
 */

const BASE = '/langgraph';

// ── Types ─────────────────────────────────────────────────────────────────

export interface LGAssistant {
  assistant_id: string;
  graph_id: string;
  name?: string;
}

export interface LGThread {
  thread_id: string;
}

export interface RunResult {
  content: string;
  toolCalls: string[];
  runId?: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function toKwargs(msg: unknown): Record<string, unknown> | null {
  if (!msg || typeof msg !== 'object') return null;
  const obj = msg as Record<string, unknown>;
  if (obj.lc === 1 && obj.kwargs) return obj.kwargs as Record<string, unknown>;
  return obj;
}

function msgType(msg: unknown): string {
  const kw = toKwargs(msg);
  return ((kw?.type as string | undefined) ?? '').toLowerCase();
}

// ── API helpers ───────────────────────────────────────────────────────────

export async function fetchFirstAssistant(): Promise<LGAssistant | null> {
  try {
    const res = await fetch(`${BASE}/assistants/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 10 }),
    });
    if (!res.ok) return null;
    const list = (await res.json()) as LGAssistant[];
    return list[0] ?? null;
  } catch {
    return null;
  }
}

export async function createThread(): Promise<LGThread | null> {
  try {
    const res = await fetch(`${BASE}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    if (!res.ok) return null;
    return (await res.json()) as LGThread;
  } catch {
    return null;
  }
}

// ── Run and wait ──────────────────────────────────────────────────────────

export async function runAndWait(
  threadId: string,
  assistantId: string,
  message: string,
): Promise<RunResult> {
  // Fire the run and wait for it to finish
  const res = await fetch(`${BASE}/threads/${threadId}/runs/wait`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistant_id: assistantId,
      input: { messages: [{ role: 'human', content: message }] },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`LangGraph ${res.status}: ${text}`);
  }

  // Response is the final graph state.
  // LangGraph may return { messages: [...] } directly or wrap it as
  // { values: { messages: [...] }, run_id: "..." }
  const state = (await res.json()) as Record<string, unknown>;
  const values = (state.values ?? state) as Record<string, unknown>;
  const messages = (values.messages ?? []) as unknown[];

  // Resolve the LangSmith trace run_id for feedback logging.
  // 1. The /runs/wait body sometimes includes it directly.
  // 2. Otherwise fall back to GET /threads/{id}/runs?limit=1.
  let runId = (state.run_id ?? values.run_id) as string | undefined;
  if (!runId) {
    try {
      const runsRes = await fetch(`${BASE}/threads/${threadId}/runs?limit=1`);
      if (runsRes.ok) {
        const runs = (await runsRes.json()) as Array<Record<string, unknown>>;
        if (runs[0]) {
          runId = (runs[0].run_id ?? runs[0].id) as string | undefined;
        }
      }
    } catch { /* run_id is optional; feedback just won't be logged */ }
  }

  // Collect tool call names from AI messages that have tool_calls
  const toolCalls: string[] = [];
  for (const msg of messages) {
    const kw = toKwargs(msg);
    if (!kw) continue;
    const tcs = kw.tool_calls as Array<Record<string, unknown>> | undefined;
    if (Array.isArray(tcs)) {
      for (const tc of tcs) {
        const name = tc.name as string | undefined;
        if (name && !toolCalls.includes(name)) toolCalls.push(name);
      }
    }
  }

  // Find the last AI message with actual text content
  let content = '';
  let promptTokens = 0;
  let completionTokens = 0;
  let totalTokens = 0;

  for (let i = messages.length - 1; i >= 0; i--) {
    const t = msgType(messages[i]);
    if (t !== 'ai' && t !== 'assistant') continue;
    const kw = toKwargs(messages[i])!;
    const c = kw.content;
    if (typeof c === 'string' && c.trim()) {
      content = c;

      // Extract token usage
      const rm = kw.response_metadata as Record<string, unknown> | undefined;
      const um = kw.usage_metadata as Record<string, number> | undefined;
      const usage = (rm?.usage as Record<string, number> | undefined) ?? um;
      if (usage) {
        promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
        completionTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
        totalTokens = usage.total_tokens ?? promptTokens + completionTokens;
      }
      break;
    }
  }

  return { content, toolCalls, runId, promptTokens, completionTokens, totalTokens };
}
