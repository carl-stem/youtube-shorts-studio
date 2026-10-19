import type { SRTCue } from '../types';

export const VIDEO_ZIP_LIMITS = {
  compressedBytes: 100 * 1024 * 1024,
  expandedBytes: 200 * 1024 * 1024,
  fileBytes: 150 * 1024 * 1024,
  entries: 100,
  videos: 20,
  audioTracks: 20,
  compressionRatio: 200,
} as const;

export interface ZipMediaCandidate {
  name: string;
  kind: 'video' | 'captions' | 'audio' | 'image';
  compressedSize: number;
  expandedSize: number;
  compressionMethod: number;
  flags: number;
  crc32: number;
  localHeaderOffset: number;
}

export interface ExtractedMedia {
  file: File;
  kind: ZipMediaCandidate['kind'];
}

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'm4v']);
const AUDIO_EXTENSIONS = new Set(['wav', 'mp3', 'm4a', 'aac', 'ogg', 'flac', 'aiff', 'aif']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp']);
const CAPTION_EXTENSIONS = new Set(['srt', 'vtt']);

function mediaKind(name: string): ZipMediaCandidate['kind'] | null {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (CAPTION_EXTENSIONS.has(ext)) return 'captions';
  return null;
}

function normalizedZipPath(name: string): string {
  const normalized = name.replace(/\\/g, '/');
  const parts = normalized.split('/');
  if (
    !normalized || normalized.includes('\0') || normalized.startsWith('/') ||
    /^[a-zA-Z]:/.test(normalized) || parts.includes('..') || parts.includes('.')
  ) {
    throw new Error('ZIP contains an unsafe path.');
  }
  return normalized;
}

export async function listZipMedia(file: File): Promise<ZipMediaCandidate[]> {
  if (file.size > VIDEO_ZIP_LIMITS.compressedBytes) {
    throw new Error(`ZIP is too large. Choose an archive smaller than ${VIDEO_ZIP_LIMITS.compressedBytes / 1024 / 1024} MB.`);
  }
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  const minEocd = Math.max(0, bytes.length - 65_557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= minEocd; i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('This ZIP file is incomplete or invalid.');

  const diskNumber = view.getUint16(eocd + 4, true);
  const centralDisk = view.getUint16(eocd + 6, true);
  const entriesOnDisk = view.getUint16(eocd + 8, true);
  const entryCount = view.getUint16(eocd + 10, true);
  const centralSize = view.getUint32(eocd + 12, true);
  const centralOffset = view.getUint32(eocd + 16, true);
  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new Error('Multi-part ZIP archives are not supported.');
  }
  if (entryCount > VIDEO_ZIP_LIMITS.entries) {
    throw new Error(`ZIP contains more than ${VIDEO_ZIP_LIMITS.entries} entries.`);
  }
  if (centralOffset + centralSize > eocd || centralOffset + centralSize > bytes.length) {
    throw new Error('This ZIP has an invalid file directory.');
  }

  const decoder = new TextDecoder('utf-8', { fatal: false });
  const candidates: ZipMediaCandidate[] = [];
  let expandedTotal = 0;
  let videoTotal = 0;
  let audioTotal = 0;
  let cursor = centralOffset;
  for (let i = 0; i < entryCount; i++) {
    if (cursor + 46 > centralOffset + centralSize || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error('This ZIP has an invalid file directory.');
    }
    const hostSystem = view.getUint8(cursor + 5);
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const crc32 = view.getUint32(cursor + 16, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const expandedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const diskStart = view.getUint16(cursor + 34, true);
    const externalAttributes = view.getUint32(cursor + 38, true);
    const localHeaderOffset = view.getUint32(cursor + 42, true);
    const recordEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (recordEnd > centralOffset + centralSize) throw new Error('This ZIP has an invalid file directory.');

    const rawName = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    if (diskStart !== 0 || compressedSize === 0xffffffff || expandedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new Error('Multi-part and ZIP64 archives are not supported.');
    }
    if (flags & 0x1) throw new Error(`Encrypted archive entry is not supported: ${rawName}`);
    if (method !== 0 && method !== 8) throw new Error(`Unsupported ZIP compression for: ${rawName}`);
    const unixMode = (externalAttributes >>> 16) & 0xf000;
    if (hostSystem === 3 && unixMode === 0xa000) throw new Error('Symbolic links are not supported in ZIP files.');

    const name = normalizedZipPath(rawName);
    const kind = mediaKind(name);
    if (kind && !rawName.endsWith('/')) {
      if (expandedSize > VIDEO_ZIP_LIMITS.fileBytes) {
        throw new Error(`ZIP entry is too large: ${name}`);
      }
      if (expandedSize > 0 && compressedSize === 0) throw new Error(`ZIP entry has invalid compression data: ${name}`);
      if (compressedSize > 0 && expandedSize / compressedSize > VIDEO_ZIP_LIMITS.compressionRatio) {
        throw new Error(`ZIP entry compression ratio is unsafe: ${name}`);
      }
      expandedTotal += expandedSize;
      if (expandedTotal > VIDEO_ZIP_LIMITS.expandedBytes) {
        throw new Error(`ZIP media expands beyond ${VIDEO_ZIP_LIMITS.expandedBytes / 1024 / 1024} MB.`);
      }
      if (kind === 'video' && ++videoTotal > VIDEO_ZIP_LIMITS.videos) {
        throw new Error(`ZIP contains more than ${VIDEO_ZIP_LIMITS.videos} videos.`);
      }
      if (kind === 'audio' && ++audioTotal > VIDEO_ZIP_LIMITS.audioTracks) {
        throw new Error(`ZIP contains more than ${VIDEO_ZIP_LIMITS.audioTracks} audio tracks.`);
      }
      candidates.push({ name, kind, compressedSize, expandedSize, compressionMethod: method, flags, crc32, localHeaderOffset });
    }
    cursor = recordEnd;
  }
  return candidates;
}

function calculateCrc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < bytes.length; index++) {
    crc ^= bytes[index];
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function readWithLimit(stream: ReadableStream<Uint8Array>, expectedBytes: number, filename: string): Promise<Uint8Array> {
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > expectedBytes || total > VIDEO_ZIP_LIMITS.fileBytes) {
        await reader.cancel();
        throw new Error(`Expanded ZIP entry exceeded its declared size: ${filename}`);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (total !== expectedBytes) throw new Error(`ZIP entry size did not match its directory: ${filename}`);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.byteLength; }
  return output;
}

export async function extractZipMedia(file: File, candidates: ZipMediaCandidate[]): Promise<ExtractedMedia[]> {
  const archive = await file.arrayBuffer();
  const view = new DataView(archive);
  const extracted: ExtractedMedia[] = [];
  for (const candidate of candidates) {
    const offset = candidate.localHeaderOffset;
    if (offset + 30 > archive.byteLength || view.getUint32(offset, true) !== 0x04034b50) {
      throw new Error(`ZIP entry has an invalid local header: ${candidate.name}`);
    }
    const flags = view.getUint16(offset + 6, true);
    const method = view.getUint16(offset + 8, true);
    const localCrc32 = view.getUint32(offset + 14, true);
    const localCompressedSize = view.getUint32(offset + 18, true);
    const localExpandedSize = view.getUint32(offset + 22, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const localName = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(archive, offset + 30, nameLength)).replace(/\\/g, '/');
    const dataStart = offset + 30 + nameLength + extraLength;
    const dataEnd = dataStart + candidate.compressedSize;
    if (
      (flags & 0x1) || flags !== candidate.flags || method !== candidate.compressionMethod ||
      localName !== candidate.name || dataEnd > archive.byteLength ||
      (!(flags & 0x8) && (localCrc32 !== candidate.crc32 || localCompressedSize !== candidate.compressedSize || localExpandedSize !== candidate.expandedSize))
    ) {
      throw new Error(`ZIP entry data is invalid: ${candidate.name}`);
    }
    const compressed = new Uint8Array(archive, dataStart, candidate.compressedSize);
    let content: Uint8Array;
    if (method === 0) {
      if (compressed.byteLength !== candidate.expandedSize) throw new Error(`ZIP entry size is invalid: ${candidate.name}`);
      content = compressed.slice();
    } else {
      if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot extract compressed ZIP files. Try an uncompressed ZIP or extract the files first.');
      try {
        const inflater = new DecompressionStream('deflate-raw');
        const compressedBuffer = compressed.slice().buffer as ArrayBuffer;
        const source = new Blob([compressedBuffer]).stream().pipeThrough(inflater);
        content = await readWithLimit(source, candidate.expandedSize, candidate.name);
      } catch (error) {
        if (error instanceof Error && /^(Expanded ZIP entry|ZIP entry size)/.test(error.message)) throw error;
        if (error instanceof Error && error.message.includes('Decompression failed')) {
          throw new Error(`Could not extract ${candidate.name}. The ZIP may be damaged or use unsupported compression.`);
        }
        throw error;
      }
    }
    if (calculateCrc32(content) !== candidate.crc32) throw new Error(`ZIP entry checksum did not match: ${candidate.name}`);
    const type = mediaMime(candidate.kind, candidate.name);
    const filename = candidate.name.split('/').pop() || 'media';
    const contentBuffer = content.slice().buffer as ArrayBuffer;
    extracted.push({ file: new File([contentBuffer], filename, { type }), kind: candidate.kind });
  }
  return extracted;
}

export function videoMime(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  if (ext === 'webm') return 'video/webm';
  if (ext === 'mov') return 'video/quicktime';
  if (ext === 'm4v') return 'video/x-m4v';
  return 'video/mp4';
}

function mediaMime(kind: ZipMediaCandidate['kind'], name: string): string {
  if (kind === 'video') return videoMime(name);
  if (kind === 'captions') return name.toLowerCase().endsWith('.vtt') ? 'text/vtt' : 'application/x-subrip';
  const ext = name.split('.').pop()?.toLowerCase();
  if (kind === 'audio') {
    if (ext === 'wav') return 'audio/wav';
    if (ext === 'mp3') return 'audio/mpeg';
    if (ext === 'm4a') return 'audio/mp4';
    if (ext === 'aac') return 'audio/aac';
    if (ext === 'ogg') return 'audio/ogg';
    if (ext === 'flac') return 'audio/flac';
    if (ext === 'aiff' || ext === 'aif') return 'audio/aiff';
  }
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

export function parseCaptionFile(text: string): SRTCue[] {
  const normalized = text.replace(/^\uFEFF/, '').replace(/\r/g, '').trim();
  const blocks = normalized.replace(/^WEBVTT[^\n]*\n/, '').split(/\n\s*\n/);
  const cues: SRTCue[] = [];
  for (const block of blocks) {
    const lines = block.split('\n');
    const timingLine = lines.find((line) => line.includes('-->'));
    if (!timingLine) continue;
    const match = timingLine.match(/(?:(\d{2,}):)?(\d{2}):(\d{2})[,.](\d{3})\s*-->\s*(?:(\d{2,}):)?(\d{2}):(\d{2})[,.](\d{3})/);
    if (!match) continue;
    const toSeconds = (h: string | undefined, m: string, s: string, ms: string) =>
      (Number(h || 0) * 3600) + Number(m) * 60 + Number(s) + Number(ms) / 1000;
    const start = toSeconds(match[1], match[2], match[3], match[4]);
    const end = toSeconds(match[5], match[6], match[7], match[8]);
    const index = lines.indexOf(timingLine);
    const cueText = lines.slice(index + 1).join('\n').replace(/<[^>]*>/g, '').trim();
    if (cueText && end > start) cues.push({ start, end, text: cueText });
  }
  return cues.sort((a, b) => a.start - b.start);
}
