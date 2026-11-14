import type { Metadata } from 'next';
import DriftRoom from '@/components/drift/DriftRoom';

export const metadata: Metadata = {
 title: 'Drift Room · Software Factory',
 description: 'Inspect recorded intent, delivery, and skeptic reviews against a preserved evidence snapshot.',
};

export default function DriftRoomPage() { return <DriftRoom />; }
