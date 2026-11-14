import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Factory floor / Human-led review pilot',
  description: 'A fixture-backed demonstration of asynchronous human review.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
