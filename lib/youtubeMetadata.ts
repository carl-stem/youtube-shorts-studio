// Validation and request metadata for YouTube uploads (videos.insert snippet/status).
// Pure; shared by the upload route and tests.

export const YOUTUBE_ALLOWED_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'] as const;

// Standard assignable YouTube video categories (videoCategories.list, regionCode=US).
export const YOUTUBE_CATEGORY_IDS: Readonly<Record<string, string>> = {
  '1': 'Film & Animation',
  '2': 'Autos & Vehicles',
  '10': 'Music',
  '15': 'Pets & Animals',
  '17': 'Sports',
  '19': 'Travel & Events',
  '20': 'Gaming',
  '22': 'People & Blogs',
  '23': 'Comedy',
  '24': 'Entertainment',
  '25': 'News & Politics',
  '26': 'Howto & Style',
  '27': 'Education',
  '28': 'Science & Technology',
  '29': 'Nonprofits & Activism',
};

export const DEFAULT_CATEGORY_ID = '22';

const PRIVACY_VALUES = ['public', 'unlisted', 'private'] as const;
type Privacy = typeof PRIVACY_VALUES[number];

// Requires a date, time and explicit offset so "2026-10-22" or locale strings
// cannot be silently interpreted in the server's time zone.
const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

export interface YouTubeUploadFields {
  videoType: string;
  title: string | null;
  description: string | null;
  tags: string | null;
  privacy: string | null;
  publishAt: string | null;
  categoryId: string | null;
  madeForKids: string | null;
}

export interface YouTubeVideoMetadata {
  snippet: { title: string; description: string; tags: string[]; categoryId: string; defaultLanguage: string };
  status: { privacyStatus: Privacy; selfDeclaredMadeForKids: boolean; publishAt?: string };
}

export type YouTubeValidation =
  | { ok: true; contentType: string; metadata: YouTubeVideoMetadata }
  | { ok: false; status: 400 | 415; code: string; error: string };

function isPrivacy(value: string): value is Privacy {
  return (PRIVACY_VALUES as readonly string[]).includes(value);
}

export function validateYouTubeUpload(fields: YouTubeUploadFields, nowMs: number = Date.now()): YouTubeValidation {
  // MediaRecorder blobs carry codec parameters (e.g. video/webm;codecs=vp9,opus).
  const contentType = (fields.videoType.split(';')[0] ?? '').trim().toLowerCase() || 'video/mp4';
  if (!(YOUTUBE_ALLOWED_MIME_TYPES as readonly string[]).includes(contentType)) {
    return { ok: false, status: 415, code: 'unsupported_media_type', error: 'Use an MP4, WebM, or MOV video for YouTube upload.' };
  }

  const privacy = fields.privacy || 'public';
  if (!isPrivacy(privacy)) return { ok: false, status: 400, code: 'invalid_privacy', error: 'Invalid privacy setting' };

  const categoryId = fields.categoryId || DEFAULT_CATEGORY_ID;
  if (!Object.hasOwn(YOUTUBE_CATEGORY_IDS, categoryId)) {
    return { ok: false, status: 400, code: 'invalid_category', error: 'Invalid YouTube category' };
  }

  // The uploader must answer the audience question (COPPA); there is no default.
  if (fields.madeForKids === null || fields.madeForKids === '') {
    return { ok: false, status: 400, code: 'made_for_kids_required', error: 'Answer whether the video is made for kids' };
  }
  if (fields.madeForKids !== 'true' && fields.madeForKids !== 'false') {
    return { ok: false, status: 400, code: 'invalid_made_for_kids', error: 'Made-for-kids must be true or false' };
  }
  const selfDeclaredMadeForKids = fields.madeForKids === 'true';

  let publishAt: string | undefined;
  if (fields.publishAt) {
    const at = Date.parse(fields.publishAt);
    if (!ISO_8601.test(fields.publishAt) || !Number.isFinite(at) || at <= nowMs) {
      return { ok: false, status: 400, code: 'invalid_publish_at', error: 'Scheduled publish time must be a future date and time' };
    }
    // YouTube only honours publishAt for private videos; it makes them public at that time.
    if (privacy !== 'private') {
      return { ok: false, status: 400, code: 'publish_at_requires_private', error: 'Scheduled publishing requires the video to be private until it goes live' };
    }
    publishAt = new Date(at).toISOString();
  }

  return {
    ok: true,
    contentType,
    metadata: {
      snippet: {
        title: (fields.title || 'My Short').slice(0, 100),
        description: (fields.description || '').slice(0, 5000),
        tags: (fields.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 500),
        categoryId,
        defaultLanguage: 'en',
      },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids, ...(publishAt ? { publishAt } : {}) },
    },
  };
}

export function isValidYouTubeVideoId(videoId: string | null): videoId is string {
  return !!videoId && /^[a-zA-Z0-9_-]{6,64}$/.test(videoId);
}
