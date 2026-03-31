import type { Trace, EvalResult, DashboardMetrics } from '../types';

const NOW = Date.now();
const HOUR = 3_600_000;
const DAY = 86_400_000;

function id(): string {
  return Math.random().toString(36).slice(2, 10);
}

export const traces: Trace[] = [
  {
    id: 'tr_a1b2c3d4',
    name: 'RetrievalQA - product lookup',
    startTime: NOW - 2 * HOUR,
    endTime: NOW - 2 * HOUR + 3420,
    latencyMs: 3420,
    status: 'success',
    totalTokens: 2847,
    totalCost: 0.0091,
    tags: ['production', 'retrieval'],
    feedbackScores: { correctness: 0.92, helpfulness: 0.88, relevance: 0.95 },
    rootSpan: {
      id: id(), name: 'RetrievalQA', type: 'chain', status: 'success',
      startTime: NOW - 2 * HOUR, endTime: NOW - 2 * HOUR + 3420,
      children: [
        {
          id: id(), name: 'VectorStoreRetriever', type: 'retriever', status: 'success',
          startTime: NOW - 2 * HOUR + 10, endTime: NOW - 2 * HOUR + 820,
          input: 'What are the top-selling running shoes?',
          output: '[4 documents retrieved]',
        },
        {
          id: id(), name: 'ChatOpenAI', type: 'llm', status: 'success',
          startTime: NOW - 2 * HOUR + 830, endTime: NOW - 2 * HOUR + 3400,
          model: 'gpt-4o', input: 'Answer based on context…',
          output: 'Based on our catalog, the top-selling running shoes are…',
          tokens: { input: 1820, output: 1027, total: 2847 },
          cost: 0.0091,
        },
      ],
    },
  },
  {
    id: 'tr_e5f6g7h8',
    name: 'AgentExecutor - customer support',
    startTime: NOW - 4 * HOUR,
    endTime: NOW - 4 * HOUR + 8150,
    latencyMs: 8150,
    status: 'success',
    totalTokens: 5230,
    totalCost: 0.0183,
    tags: ['production', 'agent'],
    feedbackScores: { correctness: 0.85, helpfulness: 0.91, relevance: 0.87 },
    rootSpan: {
      id: id(), name: 'AgentExecutor', type: 'agent', status: 'success',
      startTime: NOW - 4 * HOUR, endTime: NOW - 4 * HOUR + 8150,
      children: [
        {
          id: id(), name: 'ChatAnthropic', type: 'llm', status: 'success',
          startTime: NOW - 4 * HOUR + 15, endTime: NOW - 4 * HOUR + 2100,
          model: 'claude-3.5-sonnet', tokens: { input: 890, output: 245, total: 1135 },
          cost: 0.0042, input: 'Plan: look up order #4821…', output: 'I should use the order_lookup tool',
        },
        {
          id: id(), name: 'order_lookup', type: 'tool', status: 'success',
          startTime: NOW - 4 * HOUR + 2110, endTime: NOW - 4 * HOUR + 2650,
          input: '{"order_id": "4821"}', output: '{"status": "shipped", "eta": "Mar 31"}',
        },
        {
          id: id(), name: 'ChatAnthropic', type: 'llm', status: 'success',
          startTime: NOW - 4 * HOUR + 2660, endTime: NOW - 4 * HOUR + 5100,
          model: 'claude-3.5-sonnet', tokens: { input: 1420, output: 380, total: 1800 },
          cost: 0.0065,
        },
        {
          id: id(), name: 'send_email', type: 'tool', status: 'success',
          startTime: NOW - 4 * HOUR + 5110, endTime: NOW - 4 * HOUR + 5800,
          input: '{"to": "customer@example.com", "subject": "Order Update"}',
          output: '{"sent": true}',
        },
        {
          id: id(), name: 'ChatAnthropic', type: 'llm', status: 'success',
          startTime: NOW - 4 * HOUR + 5810, endTime: NOW - 4 * HOUR + 8140,
          model: 'claude-3.5-sonnet', tokens: { input: 1580, output: 715, total: 2295 },
          cost: 0.0076, output: 'Your order #4821 has shipped and is expected to arrive March 31.',
        },
      ],
    },
  },
  {
    id: 'tr_i9j0k1l2',
    name: 'Summarization chain',
    startTime: NOW - 6 * HOUR,
    endTime: NOW - 6 * HOUR + 2100,
    latencyMs: 2100,
    status: 'success',
    totalTokens: 3620,
    totalCost: 0.0038,
    tags: ['production', 'summarization'],
    feedbackScores: { correctness: 0.78, helpfulness: 0.82 },
    rootSpan: {
      id: id(), name: 'SummarizationChain', type: 'chain', status: 'success',
      startTime: NOW - 6 * HOUR, endTime: NOW - 6 * HOUR + 2100,
      children: [
        {
          id: id(), name: 'ChatOpenAI', type: 'llm', status: 'success',
          startTime: NOW - 6 * HOUR + 20, endTime: NOW - 6 * HOUR + 2080,
          model: 'gpt-4o-mini', tokens: { input: 2800, output: 820, total: 3620 },
          cost: 0.0038,
        },
      ],
    },
  },
  {
    id: 'tr_m3n4o5p6',
    name: 'SQL Agent - analytics query',
    startTime: NOW - 8 * HOUR,
    endTime: NOW - 8 * HOUR + 12400,
    latencyMs: 12400,
    status: 'error',
    totalTokens: 4100,
    totalCost: 0.0145,
    tags: ['production', 'agent', 'sql'],
    feedbackScores: { correctness: 0.2, helpfulness: 0.3 },
    rootSpan: {
      id: id(), name: 'SQLAgent', type: 'agent', status: 'error',
      startTime: NOW - 8 * HOUR, endTime: NOW - 8 * HOUR + 12400,
      error: 'Tool execution failed: permission denied on analytics.revenue table',
      children: [
        {
          id: id(), name: 'ChatOpenAI', type: 'llm', status: 'success',
          startTime: NOW - 8 * HOUR + 10, endTime: NOW - 8 * HOUR + 3200,
          model: 'gpt-4o', tokens: { input: 1200, output: 350, total: 1550 }, cost: 0.005,
        },
        {
          id: id(), name: 'sql_query', type: 'tool', status: 'error',
          startTime: NOW - 8 * HOUR + 3210, endTime: NOW - 8 * HOUR + 4800,
          input: 'SELECT * FROM analytics.revenue LIMIT 100',
          error: 'permission denied on analytics.revenue',
        },
        {
          id: id(), name: 'ChatOpenAI', type: 'llm', status: 'success',
          startTime: NOW - 8 * HOUR + 4810, endTime: NOW - 8 * HOUR + 8200,
          model: 'gpt-4o', tokens: { input: 1400, output: 400, total: 1800 }, cost: 0.006,
        },
        {
          id: id(), name: 'sql_query', type: 'tool', status: 'error',
          startTime: NOW - 8 * HOUR + 8210, endTime: NOW - 8 * HOUR + 12400,
          input: 'SELECT revenue FROM analytics.revenue WHERE year=2024',
          error: 'permission denied on analytics.revenue',
        },
      ],
    },
  },
  {
    id: 'tr_q7r8s9t0',
    name: 'RetrievalQA - policy lookup',
    startTime: NOW - 12 * HOUR,
    endTime: NOW - 12 * HOUR + 4100,
    latencyMs: 4100,
    status: 'success',
    totalTokens: 3100,
    totalCost: 0.0062,
    tags: ['production', 'retrieval'],
    feedbackScores: { correctness: 0.96, helpfulness: 0.94, relevance: 0.98 },
    rootSpan: {
      id: id(), name: 'RetrievalQA', type: 'chain', status: 'success',
      startTime: NOW - 12 * HOUR, endTime: NOW - 12 * HOUR + 4100,
      children: [
        {
          id: id(), name: 'VectorStoreRetriever', type: 'retriever', status: 'success',
          startTime: NOW - 12 * HOUR + 10, endTime: NOW - 12 * HOUR + 900,
        },
        {
          id: id(), name: 'ChatOpenAI', type: 'llm', status: 'success',
          startTime: NOW - 12 * HOUR + 910, endTime: NOW - 12 * HOUR + 4080,
          model: 'gpt-4o', tokens: { input: 2100, output: 1000, total: 3100 }, cost: 0.0062,
        },
      ],
    },
  },
  {
    id: 'tr_u1v2w3x4',
    name: 'AgentExecutor - data extraction',
    startTime: NOW - 1 * DAY,
    endTime: NOW - 1 * DAY + 6300,
    latencyMs: 6300,
    status: 'success',
    totalTokens: 4500,
    totalCost: 0.0098,
    tags: ['staging', 'agent'],
    feedbackScores: { correctness: 0.88, helpfulness: 0.9 },
    rootSpan: {
      id: id(), name: 'AgentExecutor', type: 'agent', status: 'success',
      startTime: NOW - 1 * DAY, endTime: NOW - 1 * DAY + 6300,
      children: [
        {
          id: id(), name: 'ChatAnthropic', type: 'llm', status: 'success',
          startTime: NOW - 1 * DAY + 10, endTime: NOW - 1 * DAY + 2800,
          model: 'claude-3.5-sonnet', tokens: { input: 1500, output: 600, total: 2100 }, cost: 0.0048,
        },
        {
          id: id(), name: 'parse_document', type: 'tool', status: 'success',
          startTime: NOW - 1 * DAY + 2810, endTime: NOW - 1 * DAY + 3600,
        },
        {
          id: id(), name: 'ChatAnthropic', type: 'llm', status: 'success',
          startTime: NOW - 1 * DAY + 3610, endTime: NOW - 1 * DAY + 6280,
          model: 'claude-3.5-sonnet', tokens: { input: 1600, output: 800, total: 2400 }, cost: 0.005,
        },
      ],
    },
  },
  {
    id: 'tr_y5z6a7b8',
    name: 'Summarization chain',
    startTime: NOW - 1.5 * DAY,
    endTime: NOW - 1.5 * DAY + 1800,
    latencyMs: 1800,
    status: 'success',
    totalTokens: 2900,
    totalCost: 0.003,
    tags: ['staging'],
    feedbackScores: { correctness: 0.75, helpfulness: 0.8 },
    rootSpan: {
      id: id(), name: 'SummarizationChain', type: 'chain', status: 'success',
      startTime: NOW - 1.5 * DAY, endTime: NOW - 1.5 * DAY + 1800,
      children: [
        {
          id: id(), name: 'ChatOpenAI', type: 'llm', status: 'success',
          startTime: NOW - 1.5 * DAY + 10, endTime: NOW - 1.5 * DAY + 1780,
          model: 'gpt-4o-mini', tokens: { input: 2200, output: 700, total: 2900 }, cost: 0.003,
        },
      ],
    },
  },
  {
    id: 'tr_c9d0e1f2',
    name: 'AgentExecutor - code review',
    startTime: NOW - 2 * DAY,
    endTime: NOW - 2 * DAY + 15200,
    latencyMs: 15200,
    status: 'success',
    totalTokens: 8900,
    totalCost: 0.032,
    tags: ['production', 'agent'],
    feedbackScores: { correctness: 0.93, helpfulness: 0.95, relevance: 0.91 },
    rootSpan: {
      id: id(), name: 'AgentExecutor', type: 'agent', status: 'success',
      startTime: NOW - 2 * DAY, endTime: NOW - 2 * DAY + 15200,
      children: [
        {
          id: id(), name: 'ChatAnthropic', type: 'llm', status: 'success',
          startTime: NOW - 2 * DAY + 10, endTime: NOW - 2 * DAY + 4500,
          model: 'claude-3.5-sonnet', tokens: { input: 3200, output: 900, total: 4100 }, cost: 0.014,
        },
        {
          id: id(), name: 'read_file', type: 'tool', status: 'success',
          startTime: NOW - 2 * DAY + 4510, endTime: NOW - 2 * DAY + 5000,
        },
        {
          id: id(), name: 'ChatAnthropic', type: 'llm', status: 'success',
          startTime: NOW - 2 * DAY + 5010, endTime: NOW - 2 * DAY + 10200,
          model: 'claude-3.5-sonnet', tokens: { input: 2800, output: 1200, total: 4000 }, cost: 0.013,
        },
        {
          id: id(), name: 'write_review', type: 'tool', status: 'success',
          startTime: NOW - 2 * DAY + 10210, endTime: NOW - 2 * DAY + 15180,
        },
      ],
    },
  },
];

export const evalResults: EvalResult[] = traces.flatMap((trace) => {
  if (!trace.feedbackScores) return [];
  return Object.entries(trace.feedbackScores).map(([evaluator, score]) => ({
    id: `eval_${id()}`,
    traceId: trace.id,
    traceName: trace.name,
    evaluator,
    score,
    source: 'llm-judge' as const,
    createdAt: trace.startTime + 60_000,
    comment: score > 0.8 ? 'Meets quality threshold' : 'Below quality threshold - review recommended',
  }));
});

function buildTimeSeries(): DashboardMetrics['tracesByDay'] {
  const days = 7;
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(NOW - i * DAY);
    const label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const count = Math.floor(Math.random() * 80) + 40;
    const errors = Math.floor(count * (Math.random() * 0.12));
    points.push({ date: label, count, errors });
  }
  return points;
}

export const dashboardMetrics: DashboardMetrics = {
  totalTraces: 1_247,
  avgLatencyMs: 4_820,
  totalCost: 14.72,
  avgEvalScore: 0.84,
  errorRate: 0.067,
  tracesByDay: buildTimeSeries(),
  latencyDistribution: [
    { bucket: '<1s', count: 180 },
    { bucket: '1-2s', count: 310 },
    { bucket: '2-5s', count: 420 },
    { bucket: '5-10s', count: 215 },
    { bucket: '10-20s', count: 88 },
    { bucket: '>20s', count: 34 },
  ],
  costByModel: [
    { model: 'gpt-4o', cost: 6.82, tokens: 524_000 },
    { model: 'claude-3.5-sonnet', cost: 5.14, tokens: 389_000 },
    { model: 'gpt-4o-mini', cost: 1.93, tokens: 612_000 },
    { model: 'claude-3-haiku', cost: 0.83, tokens: 290_000 },
  ],
  evalScoresByType: [
    { evaluator: 'correctness', avgScore: 0.82, count: 890 },
    { evaluator: 'helpfulness', avgScore: 0.87, count: 890 },
    { evaluator: 'relevance', avgScore: 0.91, count: 620 },
    { evaluator: 'coherence', avgScore: 0.89, count: 540 },
    { evaluator: 'safety', avgScore: 0.96, count: 1_247 },
  ],
};
