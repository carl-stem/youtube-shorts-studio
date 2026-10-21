import { NextResponse } from 'next/server';

// Retired: this route proxied the whole video through the function, which fails above
// Vercel's ~4.5 MB request body limit. Uploads now use /api/upload/youtube/session
// (metadata only) plus direct browser→Google chunks or /api/upload/youtube/chunk.
export async function POST() {
  return NextResponse.json(
    { error: 'This upload method was replaced. Reload the page and publish again.', code: 'endpoint_retired' },
    { status: 410 },
  );
}
