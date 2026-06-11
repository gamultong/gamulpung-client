import type { Metadata } from 'next';
import StatsDashboard from '@/features/stats/StatsDashboard';

export const metadata: Metadata = {
  title: 'Stats Dashboard',
  description: 'Realtime Gamulpung gameplay and server statistics dashboard.',
  alternates: {
    canonical: '/stats',
  },
};

export default function StatsPage() {
  return <StatsDashboard />;
}
