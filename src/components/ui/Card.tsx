import type { ReactNode } from 'react';

export interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = '', padding = true, onClick }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/60 backdrop-blur-sm ${padding ? 'p-5' : ''} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}
