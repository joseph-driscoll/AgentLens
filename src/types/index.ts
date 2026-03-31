export interface User {
  id: string;
  email: string;
  name: string;
}

export type SpanType = 'chain' | 'llm' | 'tool' | 'retriever' | 'agent';
export type RunStatus = 'success' | 'error';

export interface Span {
  id: string;
  name: string;
  type: SpanType;
  startTime: number;
  endTime: number;
  status: RunStatus;
  tokens?: { input: number; output: number; total: number };
  cost?: number;
  input?: string;
  output?: string;
  model?: string;
  error?: string;
  children?: Span[];
}

export interface Trace {
  id: string;
  name: string;
  rootSpan: Span;
  startTime: number;
  endTime: number;
  latencyMs: number;
  status: RunStatus;
  totalTokens: number;
  totalCost: number;
  feedbackScores?: Record<string, number>;
  tags?: string[];
}

export type EvalSource = 'llm-judge' | 'experiment' | 'human' | 'heuristic' | 'unknown';

export interface EvalResult {
  id: string;
  traceId: string;
  traceName: string;
  evaluator: string;
  score: number;
  comment?: string;
  source: EvalSource;
  createdAt: number;
}

export interface TimeSeriesPoint {
  date: string;
  count: number;
  errors: number;
}

export interface LatencyBucket {
  bucket: string;
  count: number;
}

export interface ModelCost {
  model: string;
  cost: number;
  tokens: number;
}

export interface EvalSummary {
  evaluator: string;
  avgScore: number;
  count: number;
}

export interface DashboardMetrics {
  totalTraces: number;
  avgLatencyMs: number;
  totalCost: number;
  avgEvalScore: number;
  errorRate: number;
  tracesByDay: TimeSeriesPoint[];
  latencyDistribution: LatencyBucket[];
  costByModel: ModelCost[];
  evalScoresByType: EvalSummary[];
}
