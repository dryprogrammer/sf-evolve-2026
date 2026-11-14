import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Project Driver · Evidence-bound review',
  description: 'Software Factory source evidence and accountable local demo reviews, with a preserved fixture fallback.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
