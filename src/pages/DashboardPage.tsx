import { Activity, Clock, DollarSign, Star, AlertTriangle, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { MetricCard } from '../components/ui/MetricCard';
import { TraceVolumeChart } from '../components/charts/TraceVolumeChart';
import { LatencyChart } from '../components/charts/LatencyChart';
import { CostByModelChart } from '../components/charts/CostByModelChart';
import { EvalScoreChart } from '../components/charts/EvalScoreChart';
import { useDashboard } from '../hooks/useLangSmithData';
import { useLangSmith } from '../contexts/LangSmithContext';
import { formatNumber, formatDuration, formatCost, formatPercent } from '../utils/format';

function DemoBanner() {
  return (
    <div className="flex items-center justify-between rounded-lg border border-amber-500/20 bg-amber-500/8 px-4 py-2.5">
      <p className="text-xs text-amber-300">
        Viewing demo data - connect LangSmith in Settings to see live metrics from your agent.
      </p>
      <Link
        to="/settings"
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/15"
      >
        <Settings className="h-3.5 w-3.5" />
        Connect
      </Link>
    </div>
  );
}

function MetricSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 h-3 w-24 rounded bg-slate-800" />
      <div className="mb-2 h-7 w-20 rounded bg-slate-800" />
      <div className="h-3 w-28 rounded bg-slate-800" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="animate-pulse rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="mb-4 h-4 w-32 rounded bg-slate-800" />
      <div className="h-40 rounded-lg bg-slate-800/60" />
    </div>
  );
}

export function DashboardPage() {
  const { data: m, loading, error, isLive } = useDashboard();
  const { config } = useLangSmith();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight text-slate-100">Dashboard</h1>
        <p className="text-sm text-slate-500">
          {isLive
            ? `${config?.projectName ?? 'All projects'} · Last 7 days`
            : 'Last 7 days · All projects'}
        </p>
      </div>

      {!isLive && <DemoBanner />}

      {error && (
        <div className="rounded-lg border border-rose-500/20 bg-rose-500/8 px-4 py-3 text-sm text-rose-300">
          Failed to load data: {error}
        </div>
      )}

      {loading ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => <MetricSkeleton key={i} />)}
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartSkeleton />
            <ChartSkeleton />
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-5">
            <MetricCard
              label="Total Traces"
              value={formatNumber(m.totalTraces)}
              subValue="+12.3% vs prev period"
              trend="up"
              icon={<Activity className="h-5 w-5" />}
            />
            <MetricCard
              label="Avg Latency"
              value={formatDuration(m.avgLatencyMs)}
              subValue="-8.1% vs prev period"
              trend="up"
              icon={<Clock className="h-5 w-5" />}
            />
            <MetricCard
              label="Total Cost"
              value={formatCost(m.totalCost)}
              subValue="+5.4% vs prev period"
              trend="down"
              icon={<DollarSign className="h-5 w-5" />}
            />
            <MetricCard
              label="Avg Eval Score"
              value={formatPercent(m.avgEvalScore)}
              subValue="+2.1% vs prev period"
              trend="up"
              icon={<Star className="h-5 w-5" />}
            />
            <MetricCard
              label="Error Rate"
              value={formatPercent(m.errorRate)}
              subValue="-1.2% vs prev period"
              trend="up"
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <TraceVolumeChart data={m.tracesByDay} />
            <LatencyChart data={m.latencyDistribution} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <CostByModelChart data={m.costByModel} />
            <EvalScoreChart data={m.evalScoresByType} />
          </div>
        </>
      )}
    </div>
  );
}
