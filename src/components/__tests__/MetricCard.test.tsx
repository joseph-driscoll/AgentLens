import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCard } from '../ui/MetricCard';
import { Activity } from 'lucide-react';

describe('MetricCard', () => {
  it('renders label and value', () => {
    render(
      <MetricCard
        label="Total Traces"
        value="1,247"
        icon={<Activity data-testid="icon" />}
      />
    );

    expect(screen.getByText('Total Traces')).toBeInTheDocument();
    expect(screen.getByText('1,247')).toBeInTheDocument();
  });

  it('renders subValue with trend color', () => {
    render(
      <MetricCard
        label="Avg Latency"
        value="4.8s"
        subValue="-8.1% vs prev"
        trend="up"
        icon={<Activity />}
      />
    );

    expect(screen.getByText('-8.1% vs prev')).toBeInTheDocument();
    expect(screen.getByText('-8.1% vs prev')).toHaveClass('text-emerald-400');
  });

  it('applies down trend color for cost increases', () => {
    render(
      <MetricCard
        label="Cost"
        value="$14.72"
        subValue="+5.4% vs prev"
        trend="down"
        icon={<Activity />}
      />
    );

    expect(screen.getByText('+5.4% vs prev')).toHaveClass('text-rose-400');
  });
});
