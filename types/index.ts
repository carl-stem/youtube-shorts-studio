export interface Segment {
  index: number;
  start: number;
  duration: number;
}

export interface VizConfig {
  showTitle: boolean;
  showArtist: boolean;
  showSpectrum: boolean;
  showProgress: boolean;
  showTimecode: boolean;
  showCC: boolean;
  spectrumStyle: 'bars' | 'mirror' | 'wave';
  colorTheme: 'indigo-pink' | 'fire' | 'ocean' | 'neon' | 'gold';
  bgStyle: 'blur' | 'gradient' | 'dark';
  exportQuality: number;
  ctaText: string;
  ctaPosition: 'top' | 'above-spectrum';
  overlayEmoji?: string;
  overlayLink?: string;
  overlayPosition?: 'top' | 'middle' | 'bottom';
  overlayStyle?: 'pill' | 'banner' | 'outline';
}

export interface SRTCue {
  start: number;
  end: number;
  text: string;
}

export interface DownloadItem {
  filename: string;
  url: string;
  sizeBytes: number;
  durationSeconds?: number;
}

export interface AlbumTrackFile {
  file: File;
  cover?: File;
  artist: string;
  title: string;
}

export interface TrackMeta {
  title: string;
  artist: string;
  clipDuration: number;
  maxShorts: number | null;
}

export type VideoFilter = 'original' | 'warm' | 'cool' | 'monochrome' | 'vivid';

export interface RenderFrameOptions {
  blurredBgCanvas: HTMLCanvasElement | null;
  coverImage: HTMLImageElement | null;
  vizConfig: VizConfig;
  srtCues: SRTCue[];
  segmentOffset: number;
  titleText: string;
  artistText: string;
}

export interface AnalyticsVideo {
  id: string;
  title: string;
  thumbnail: string;
  publishedAt: string;
  views: number;
  likes: number;
  comments: number;
  shortsUrl: string;
}

/** Response of GET /api/auth/status; fetched once by app/page.tsx and passed down. */
export interface AccountStatus {
  kvConfigured: boolean;
  authenticated: boolean;
  google: { channelName: string; connected: boolean } | null;
  tiktok: { channelName: string; connected: boolean } | null;
}

/** Audio-mode project actions shown in the shared header. */
export interface ProjectActions {
  onSave: () => void;
  onLoad: () => void;
  codecLabel: string;
}
