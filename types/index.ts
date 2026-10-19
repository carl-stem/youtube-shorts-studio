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
}

export interface TrackMeta {
  title: string;
  artist: string;
  clipDuration: number;
  maxShorts: number | null;
}

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
