import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { TimeSeriesPoint } from '../../types';
import { Card } from '../ui/Card';

interface Props {
  data: TimeSeriesPoint[];
}

export function TraceVolumeChart({ data }: Props) {
  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-slate-300">Trace Volume</h3>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="traceGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="errorGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f87171" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#f87171" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
          <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
            labelStyle={{ color: '#cbd5e1', fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: '#94a3b8' }}
          />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: '#94a3b8' }} />
          <Area type="monotone" dataKey="count" name="Traces" stroke="#34d399" fill="url(#traceGrad)" strokeWidth={2} />
          <Area type="monotone" dataKey="errors" name="Errors" stroke="#f87171" fill="url(#errorGrad)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  );
}
