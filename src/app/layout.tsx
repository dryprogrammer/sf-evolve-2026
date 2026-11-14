import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'The Factory · Walkable sprite workshop',
  description: 'A walkable pixel-art workshop for human and agent collaboration. Fixture-backed review, clearly simulated presence.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
