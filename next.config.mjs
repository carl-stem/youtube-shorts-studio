const isDev = process.env.NODE_ENV !== 'production';

// CSP built from what the app actually loads (see app/layout.tsx and components/):
// - script-src 'unsafe-inline': app/layout.tsx has two inline scripts (pre-hydration
//   theme class, service-worker registration) and Next.js emits inline bootstrap/RSC
//   payload scripts. Nonces would need middleware and force every page to render
//   dynamically; the app has no user-generated HTML, so this is the minimal working option.
// - 'unsafe-eval' only in development (React Refresh / webpack eval source maps).
// - style-src 'unsafe-inline': React style props (progress bars) and Next.js inline styles.
// - img-src: Spotify album art (i.scdn.co, SpotifySearch) and YouTube thumbnails
//   (i.ytimg.com, AnalyticsDashboard); data:/blob: for local covers and exports.
// - connect-src: blob: because exports are re-read with fetch(blobUrl) for upload/share;
//   i.scdn.co because Studio fetches album art to draw it on the canvas;
//   www.googleapis.com for direct browser→YouTube resumable chunk PUTs (lib/publish/youtubeUpload.ts);
//   *.tiktokapis.com for direct browser→TikTok FILE_UPLOAD chunk PUTs (lib/publish/tiktokUpload.ts;
//   TikTok returns upload_url on open-upload.tiktokapis.com, and the init route rejects other hosts).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://i.scdn.co https://i.ytimg.com",
  "media-src 'self' blob:",
  `connect-src 'self' blob: https://i.scdn.co https://www.googleapis.com https://*.tiktokapis.com${isDev ? ' ws:' : ''}`,
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // microphone=(self) is reserved for planned voiceover recording.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(self), geolocation=()' },
  { key: 'X-Frame-Options', value: 'DENY' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
