import type { AlbumTrackFile } from '../types';

function normalizedStem(filename: string): string {
  return filename
    .replace(/\.[^.]+$/, '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\b(cover|artwork|folder|front|album)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function folder(filename: string): string {
  return filename.includes('/') ? filename.slice(0, filename.lastIndexOf('/')).toLowerCase() : '';
}

export function albumTrackMetadata(filename: string): { artist: string; title: string } {
  const base = filename.split('/').pop()?.replace(/\.[^.]+$/, '') ?? filename;
  const clean = base.replace(/^\d{1,3}[ ._-]+/, '').replace(/[_]+/g, ' ').trim();
  const parts = clean.split(/\s+-\s+/);
  if (parts.length > 1) return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
  return { artist: '', title: clean };
}

export function buildAlbumQueue(audioFiles: File[], coverFiles: File[]): AlbumTrackFile[] {
  const sorted = [...audioFiles].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  const covers = [...coverFiles].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return sorted.map((file) => {
    const audioFolder = folder(file.name);
    const stem = normalizedStem(file.name);
    const stemCover = covers.find((candidate) => normalizedStem(candidate.name) !== '' && normalizedStem(candidate.name) === stem);
    const cover = stemCover ?? covers.find((candidate) => folder(candidate.name) === audioFolder && /^(cover|artwork|folder|front|album|)$/.test(normalizedStem(candidate.name)))
      ?? covers.find((candidate) => /^(cover|artwork|folder|front|album|)$/.test(normalizedStem(candidate.name)));
    return { file, cover, ...albumTrackMetadata(file.name) };
  });
}
