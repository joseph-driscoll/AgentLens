import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TypeBadge, StatusBadge } from '../ui/Badge';

describe('TypeBadge', () => {
  it.each(['chain', 'llm', 'tool', 'retriever', 'agent'] as const)('renders %s type', (type) => {
    render(<TypeBadge type={type} />);
    expect(screen.getByText(type)).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('renders success with green dot', () => {
    render(<StatusBadge status="success" />);
    expect(screen.getByText('success')).toBeInTheDocument();
  });

  it('renders error with red dot', () => {
    render(<StatusBadge status="error" />);
    expect(screen.getByText('error')).toBeInTheDocument();
  });
});
