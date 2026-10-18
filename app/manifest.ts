import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'YouTube Shorts Studio',
    short_name: 'Shorts Studio',
    description: '1080×1920 Vertical Video Generator with Live Audio Spectrum',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0c10',
    theme_color: '#6366f1',
    categories: ['productivity', 'entertainment'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/icon.svg',     sizes: 'any',     type: 'image/svg+xml' },
    ],
    shortcuts: [
      {
        name: 'New Project',
        short_name: 'New',
        description: 'Start a fresh Shorts project',
        url: '/?step=1',
        icons: [{ src: '/icons/shortcut-new.svg', sizes: 'any' }],
      },
      {
        name: 'Visual Style',
        short_name: 'Style',
        description: 'Jump to visual style settings',
        url: '/?step=2',
        icons: [{ src: '/icons/shortcut-style.svg', sizes: 'any' }],
      },
      {
        name: 'Export Clips',
        short_name: 'Export',
        description: 'Go directly to segment export',
        url: '/?step=4',
        icons: [{ src: '/icons/shortcut-export.svg', sizes: 'any' }],
      },
    ],
  };
}
