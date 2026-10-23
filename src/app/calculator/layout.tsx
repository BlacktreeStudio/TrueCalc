import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TrueCalc – Calculator',
  description: 'Compare paying extra on your mortgage with investing the difference, month by month.',
};

export default function CalculatorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
