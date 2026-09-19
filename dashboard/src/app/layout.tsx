import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Novarys // Command Deck',
  description: 'Live stats and admin for the Novarys community.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Novarys',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0B0F1A',
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
