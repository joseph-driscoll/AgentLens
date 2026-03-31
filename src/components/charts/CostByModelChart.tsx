import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ModelCost } from '../../types';
import { Card } from '../ui/Card';
import { formatCost } from '../../utils/format';

interface Props {
  data: ModelCost[];
}

const COLORS = ['#818cf8', '#a78bfa', '#c084fc', '#e879f9'];

export function CostByModelChart({ data }: Props) {
  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-slate-300">Cost by Model</h3>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, left: 40, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
          <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v: number) => formatCost(v)} />
          <YAxis type="category" dataKey="model" tick={{ fill: '#94a3b8', fontSize: 11 }} tickLine={false} axisLine={false} width={110} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
            labelStyle={{ color: '#cbd5e1', fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: '#94a3b8' }}
            cursor={{ fill: 'rgba(148, 163, 184, 0.05)' }}
            formatter={(value) => [formatCost(Number(value)), 'Cost']}
          />
          <Bar dataKey="cost" radius={[0, 4, 4, 0]} maxBarSize={28}>
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
