import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZES = [15, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];

interface PaginationProps {
  page: number;
  pageSize: PageSize;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (s: PageSize) => void;
}

export function Pagination({ page, pageSize, total, onPage, onPageSize }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 px-4 py-3">
      {/* Count + page-size picker */}
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>{total === 0 ? '0' : `${from}–${to} of ${total}`}</span>
        <span className="text-slate-700">·</span>
        <span>Rows:</span>
        {PAGE_SIZES.map((s) => (
          <button
            key={s}
            onClick={() => { onPageSize(s); onPage(1); }}
            className={`rounded px-1.5 py-0.5 font-medium transition-colors ${
              pageSize === s
                ? 'bg-slate-700 text-slate-200'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Prev / page numbers / Next */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`ellipsis-${i}`} className="px-1 text-xs text-slate-600">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p as number)}
              className={`min-w-[28px] rounded-md px-1.5 py-1 text-xs font-medium transition-colors ${
                p === page
                  ? 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/25'
                  : 'text-slate-500 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {p}
            </button>
          ),
        )}

        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200 disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

/** Build a compact page-number list: 1 … 4 5 6 … 12 */
function pages(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const result: (number | '…')[] = [1];
  if (current > 3) result.push('…');
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    result.push(p);
  }
  if (current < total - 2) result.push('…');
  result.push(total);
  return result;
}
