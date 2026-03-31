import type { SpanType, RunStatus } from '../../types';

const TYPE_STYLES: Record<SpanType, string> = {
  chain: 'bg-blue-500/15 text-blue-400 border-blue-500/25',
  llm: 'bg-violet-500/15 text-violet-400 border-violet-500/25',
  tool: 'bg-amber-500/15 text-amber-400 border-amber-500/25',
  retriever: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/25',
  agent: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
};

const STATUS_STYLES: Record<RunStatus, string> = {
  success: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25',
  error: 'bg-rose-500/15 text-rose-400 border-rose-500/25',
};

interface TypeBadgeProps { type: SpanType }
interface StatusBadgeProps { status: RunStatus }

export function TypeBadge({ type }: TypeBadgeProps) {
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${TYPE_STYLES[type]}`}>
      {type}
    </span>
  );
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}>
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${status === 'success' ? 'bg-emerald-400' : 'bg-rose-400'}`} />
      {status}
    </span>
  );
}
