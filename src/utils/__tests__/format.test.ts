import { describe, it, expect } from 'vitest';
import { formatDuration, formatCost, formatNumber, formatPercent } from '../format';

describe('formatDuration', () => {
  it('formats milliseconds under 1s', () => {
    expect(formatDuration(450)).toBe('450ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(3400)).toBe('3.4s');
  });

  it('formats minutes', () => {
    expect(formatDuration(125000)).toBe('2.1m');
  });
});

describe('formatCost', () => {
  it('formats tiny costs with 4 decimals', () => {
    expect(formatCost(0.0023)).toBe('$0.0023');
  });

  it('formats sub-dollar costs with 3 decimals', () => {
    expect(formatCost(0.142)).toBe('$0.142');
  });

  it('formats dollar+ costs with 2 decimals', () => {
    expect(formatCost(14.72)).toBe('$14.72');
  });
});

describe('formatNumber', () => {
  it('formats thousands with K', () => {
    expect(formatNumber(2847)).toBe('2.8K');
  });

  it('formats millions with M', () => {
    expect(formatNumber(1_500_000)).toBe('1.5M');
  });

  it('leaves small numbers as-is', () => {
    expect(formatNumber(42)).toBe('42');
  });
});

describe('formatPercent', () => {
  it('formats decimal to percentage', () => {
    expect(formatPercent(0.842)).toBe('84.2%');
  });
});
