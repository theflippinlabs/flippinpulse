import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Novarys // Command Deck',
  description: 'Live stats and admin for the Novarys community.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
