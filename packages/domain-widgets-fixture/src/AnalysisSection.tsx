import type { ReactNode } from 'react';

export interface AnalysisSectionProps {
  title: string;
  dense?: boolean;
  children?: ReactNode;
}

export function AnalysisSection({ title, dense = false, children }: AnalysisSectionProps) {
  return (
    <section style={{ border: '1px solid currentColor', borderRadius: 8, padding: dense ? 8 : 16 }}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}
