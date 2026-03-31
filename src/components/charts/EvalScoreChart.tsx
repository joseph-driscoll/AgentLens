import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import type { EvalSummary } from '../../types';
import { Card } from '../ui/Card';

interface Props {
  data: EvalSummary[];
}

export function EvalScoreChart({ data }: Props) {
  const chartData = data.map((d) => ({
    evaluator: d.evaluator,
    score: Math.round(d.avgScore * 100),
    fullMark: 100,
  }));

  return (
    <Card>
      <h3 className="mb-4 text-sm font-semibold text-slate-300">Evaluation Scores</h3>
      <ResponsiveContainer width="100%" height={260}>
        <RadarChart data={chartData} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="#1e293b" />
          <PolarAngleAxis dataKey="evaluator" tick={{ fill: '#94a3b8', fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: '8px', fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}
            labelStyle={{ color: '#cbd5e1', fontWeight: 600, marginBottom: 4 }}
            itemStyle={{ color: '#94a3b8' }}
            formatter={(value) => [`${value}%`, 'Avg Score']}
          />
          <Radar name="Score" dataKey="score" stroke="#34d399" fill="#34d399" fillOpacity={0.2} strokeWidth={2} />
        </RadarChart>
      </ResponsiveContainer>
    </Card>
  );
}
