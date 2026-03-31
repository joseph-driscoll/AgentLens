import { Card } from './Card';

interface MetricCardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon: React.ReactNode;
}

export function MetricCard({ label, value, subValue, trend, icon }: MetricCardProps) {
  const trendColor =
    trend === 'up' ? 'text-emerald-400' :
    trend === 'down' ? 'text-rose-400' :
    'text-slate-500';

  return (
    <Card>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium tracking-wide text-slate-500 uppercase">{label}</p>
          <p className="text-xl font-semibold tracking-tight text-slate-100 sm:text-2xl">{value}</p>
          {subValue && (
            <p className={`text-xs font-medium ${trendColor}`}>{subValue}</p>
          )}
        </div>
        <div className="rounded-lg bg-slate-800 p-2.5 text-slate-400">
          {icon}
        </div>
      </div>
    </Card>
  );
}
