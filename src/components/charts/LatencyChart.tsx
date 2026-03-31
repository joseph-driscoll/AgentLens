import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { LatencyBucket } from '../../types';
import { Card } from '../ui/Card';

interface Props {
  data: LatencyBucket[];
}

const COLORS = ['#34d399', '#34d399', '#fbbf24', '#fbbf24', '#f87171', '#f87171'];

export function LatencyChart({ data }: Props) {
  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-slate-300">Latency Distribution</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
          <XAxis dataKey="bucket" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
            labelStyle={{ color: '#cbd5e1', fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: '#94a3b8' }}
            cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }}
            formatter={(value) => [`${value} runs`, 'Count']}
          />
          <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.8} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
