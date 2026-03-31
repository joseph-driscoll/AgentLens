import { describe, it, expect } from 'vitest';
import {
  extractInputStr,
  adaptRunToTrace,
  adaptFeedbackToEvalResults,
  buildSpanTree,
} from '../utils/adapters';
import type { LangSmithRun, LangSmithFeedback } from '../utils/langsmith';

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeRun(overrides: Partial<LangSmithRun> = {}): LangSmithRun {
  return {
    id: 'run-1',
    name: 'TestRun',
    run_type: 'chain',
    start_time: '2024-01-01T10:00:00Z',
    end_time: '2024-01-01T10:00:03Z',
    inputs: {},
    outputs: {},
    error: null,
    parent_run_id: null,
    tags: [],
    extra: {},
    feedback_stats: null,
    prompt_tokens: 100,
    completion_tokens: 50,
    total_tokens: 150,
    total_cost: 0.0001,
    session_id: null,
    serialized: null,
    child_run_ids: null,
    ...overrides,
  };
}

function makeFeedback(overrides: Partial<LangSmithFeedback> = {}): LangSmithFeedback {
  return {
    id: 'fb-1',
    run_id: 'run-1',
    key: 'helpfulness',
    score: 0.85,
    value: null,
    comment: '',
    created_at: '2024-01-01T10:00:05Z',
    modified_at: '2024-01-01T10:00:05Z',
    ...overrides,
  };
}

// ── extractInputStr ───────────────────────────────────────────────────────────

describe('extractInputStr', () => {
  it('returns a plain string input directly', () => {
    const run = makeRun({ inputs: { input: 'What is the weather in Tokyo?' } });
    expect(extractInputStr(run)).toBe('What is the weather in Tokyo?');
  });

  it('extracts human message from a standard messages array', () => {
    const run = makeRun({
      inputs: {
        messages: [
          { role: 'human', content: 'Tell me about RAG' },
          { role: 'ai', content: 'RAG stands for...' },
        ],
      },
    });
    expect(extractInputStr(run)).toBe('Tell me about RAG');
  });

  it('extracts content from LangChain JS SDK constructor format', () => {
    const run = makeRun({
      inputs: {
        messages: [
          {
            lc: 1,
            type: 'constructor',
            kwargs: { content: 'LangChain JS question', type: 'human' },
          },
        ],
      },
    });
    expect(extractInputStr(run)).toBe('LangChain JS question');
  });

  it('returns undefined for empty inputs', () => {
    expect(extractInputStr(makeRun({ inputs: {} }))).toBeUndefined();
  });

  it('truncates long inputs to 300 characters', () => {
    const long = 'x'.repeat(500);
    const run = makeRun({ inputs: { input: long } });
    expect(extractInputStr(run)?.length).toBe(300);
  });

  it('ignores AI-only messages when looking for human input', () => {
    const run = makeRun({
      inputs: {
        messages: [
          { role: 'ai', content: 'This is the AI speaking' },
        ],
      },
    });
    // Falls back to accepting any message when no human one is found
    expect(extractInputStr(run)).toBe('This is the AI speaking');
  });
});

// ── adaptRunToTrace ───────────────────────────────────────────────────────────

describe('adaptRunToTrace', () => {
  it('calculates latency correctly from start/end times', () => {
    const run = makeRun({
      start_time: '2024-01-01T10:00:00.000Z',
      end_time: '2024-01-01T10:00:04.500Z',
    });
    const trace = adaptRunToTrace(run);
    expect(trace.latencyMs).toBe(4500);
  });

  it('clamps negative latency to 0 (clock skew protection)', () => {
    const run = makeRun({
      start_time: '2024-01-01T10:00:05Z',
      end_time: '2024-01-01T10:00:00Z', // end before start
    });
    const trace = adaptRunToTrace(run);
    expect(trace.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('maps error field to status = "error"', () => {
    const run = makeRun({ error: 'Tool timed out' });
    expect(adaptRunToTrace(run).status).toBe('error');
  });

  it('maps successful run to status = "success"', () => {
    expect(adaptRunToTrace(makeRun()).status).toBe('success');
  });

  it('carries through tags', () => {
    const run = makeRun({ tags: ['production', 'weather'] });
    expect(adaptRunToTrace(run).tags).toEqual(['production', 'weather']);
  });

  it('extracts feedback scores from feedback_stats', () => {
    const run = makeRun({
      feedback_stats: {
        helpfulness: { avg: 0.9, n: 1, mode: null },
        correctness: { avg: 0.75, n: 1, mode: null },
      },
    });
    const trace = adaptRunToTrace(run);
    expect(trace.feedbackScores?.helpfulness).toBe(0.9);
    expect(trace.feedbackScores?.correctness).toBe(0.75);
  });

  it('sums prompt + completion tokens', () => {
    const run = makeRun({ prompt_tokens: 200, completion_tokens: 80, total_tokens: 280 });
    expect(adaptRunToTrace(run).totalTokens).toBe(280);
  });
});

// ── buildSpanTree ─────────────────────────────────────────────────────────────

describe('buildSpanTree', () => {
  it('builds a 3-level tree from a flat run list', () => {
    const root = makeRun({ id: 'root', name: 'chain', parent_run_id: null, run_type: 'chain' });
    const llm  = makeRun({ id: 'llm',  name: 'gpt',   parent_run_id: 'root', run_type: 'llm' });
    const tool = makeRun({ id: 'tool', name: 'weather', parent_run_id: 'root', run_type: 'tool' });

    const tree = buildSpanTree([root, llm, tool]);
    expect(tree.id).toBe('root');
    expect(tree.children).toHaveLength(2);
    expect(tree.children?.map((c) => c.id)).toContain('llm');
    expect(tree.children?.map((c) => c.id)).toContain('tool');
  });

  it('maps unknown run_type to "chain"', () => {
    const run = makeRun({ run_type: 'some_new_type' });
    const tree = buildSpanTree([run]);
    expect(tree.type).toBe('chain');
  });
});

// ── adaptFeedbackToEvalResults ────────────────────────────────────────────────

describe('adaptFeedbackToEvalResults', () => {
  it('converts feedback to eval results with correct fields', () => {
    const fb = makeFeedback({ score: 0.9, key: 'relevance' });
    const [result] = adaptFeedbackToEvalResults([fb]);
    expect(result.score).toBe(0.9);
    expect(result.evaluator).toBe('relevance');
    expect(result.traceId).toBe('run-1');
  });

  it('filters out feedback with null scores', () => {
    const fb = makeFeedback({ score: null as unknown as number });
    expect(adaptFeedbackToEvalResults([fb])).toHaveLength(0);
  });

  it('detects llm-judge source from comment', () => {
    const fb = makeFeedback({ comment: 'LLM-as-judge (GPT-4o-mini)' });
    const [result] = adaptFeedbackToEvalResults([fb]);
    expect(result.source).toBe('llm-judge');
  });

  it('detects experiment source from comment', () => {
    const fb = makeFeedback({ comment: 'LLM-as-judge (GPT-4o-mini) · experiment:agentlens::2024' });
    const [result] = adaptFeedbackToEvalResults([fb]);
    expect(result.source).toBe('experiment');
  });

  it('falls back to "unknown" source for unrecognized comments', () => {
    const fb = makeFeedback({ comment: 'some random comment' });
    const [result] = adaptFeedbackToEvalResults([fb]);
    expect(result.source).toBe('unknown');
  });

  it('uses runLabelMap to resolve trace name', () => {
    const fb = makeFeedback({ run_id: 'run-abc' });
    const labelMap = new Map([['run-abc', 'What is RAG?']]);
    const [result] = adaptFeedbackToEvalResults([fb], labelMap);
    expect(result.traceName).toBe('What is RAG?');
  });
});
