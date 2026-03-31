import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Pagination } from '../components/ui/Pagination';

function renderPagination(overrides = {}) {
  const defaults = {
    page: 1,
    pageSize: 15 as const,
    total: 45,
    onPage: vi.fn(),
    onPageSize: vi.fn(),
  };
  return render(<Pagination {...defaults} {...overrides} />);
}

describe('Pagination', () => {
  it('shows the correct item range', () => {
    renderPagination({ page: 2, pageSize: 15, total: 45 });
    expect(screen.getByText(/16–30 of 45/)).toBeInTheDocument();
  });

  it('shows "0" range when there are no items', () => {
    renderPagination({ total: 0 });
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('disables the Previous button on page 1', () => {
    renderPagination({ page: 1 });
    // Prev/Next buttons have icon-only content (no accessible name).
    // getAllByRole returns them in DOM order; prev is the first unnamed button.
    const unnamedBtns = screen.getAllByRole('button').filter((b) => b.textContent?.trim() === '');
    expect(unnamedBtns[0]).toBeDisabled();
  });

  it('calls onPage with next page when Next is clicked', () => {
    const onPage = vi.fn();
    renderPagination({ page: 1, total: 30, onPage });
    const unnamedBtns = screen.getAllByRole('button').filter((b) => b.textContent?.trim() === '');
    // last unnamed button = next
    fireEvent.click(unnamedBtns[unnamedBtns.length - 1]);
    expect(onPage).toHaveBeenCalledWith(2);
  });

  it('calls onPage when a page number is clicked', () => {
    const onPage = vi.fn();
    renderPagination({ page: 1, total: 45, onPage });
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(onPage).toHaveBeenCalledWith(3);
  });

  it('highlights the current page', () => {
    renderPagination({ page: 2, total: 45 });
    const pageBtn = screen.getByRole('button', { name: '2' });
    expect(pageBtn.className).toMatch(/emerald/);
  });

  it('calls onPageSize when a size option is clicked', () => {
    const onPageSize = vi.fn();
    renderPagination({ onPageSize });
    fireEvent.click(screen.getByRole('button', { name: '50' }));
    expect(onPageSize).toHaveBeenCalledWith(50);
  });

  it('renders all three page-size options', () => {
    renderPagination();
    expect(screen.getByRole('button', { name: '15' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '50' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '100' })).toBeInTheDocument();
  });

  it('disables Next on the last page', () => {
    renderPagination({ page: 3, total: 45, pageSize: 15 }); // 3 pages total
    const unnamedBtns = screen.getAllByRole('button').filter((b) => b.textContent?.trim() === '');
    expect(unnamedBtns[unnamedBtns.length - 1]).toBeDisabled();
  });
});
