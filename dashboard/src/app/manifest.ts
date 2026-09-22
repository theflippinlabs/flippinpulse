import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Novarys',
    short_name: 'Novarys',
    description: 'Novarys — Discord community hub, games, shop and battle pass.',
    start_url: '/app',
    // Widened to '/' so Lords can jump from /app to /dashboard inside the
    // installed PWA without being kicked out to Safari.
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/icon.png',       sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.png',       sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png', purpose: 'any' },
    ],
    categories: ['games', 'social', 'entertainment'],
  };
}
