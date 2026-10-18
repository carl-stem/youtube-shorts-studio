import type { TrackMeta, VizConfig, Segment, SRTCue } from '../types';

export const PROJECT_VERSION = '1.0';

export interface ShortProject {
  _type: 'shorts-studio-project';
  version: typeof PROJECT_VERSION;
  name: string;
  savedAt: string;
  trackMeta: TrackMeta;
  vizConfig: VizConfig;
  userSegments: Segment[] | null;
  srtCues: SRTCue[];
  audioFileName?: string;
  imageFileName?: string;
}

export function serializeProject(
  trackMeta: TrackMeta,
  vizConfig: VizConfig,
  userSegments: Segment[] | null,
  srtCues: SRTCue[],
  audioFileName?: string,
  imageFileName?: string,
): ShortProject {
  return {
    _type: 'shorts-studio-project',
    version: PROJECT_VERSION,
    name: trackMeta.title || 'Untitled',
    savedAt: new Date().toISOString(),
    trackMeta,
    vizConfig,
    userSegments,
    srtCues,
    audioFileName,
    imageFileName,
  };
}

export function downloadProject(project: ShortProject) {
  const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const name = (project.name || 'project').replace(/[^a-z0-9]/gi, '-').toLowerCase();
  a.href = url;
  a.download = `${name}.shortsproject.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function loadProjectFromFile(file: File): Promise<ShortProject> {
  const text = await file.text();
  const data = JSON.parse(text);
  if (data._type !== 'shorts-studio-project') throw new Error('Not a valid Shorts Studio project file.');
  return data as ShortProject;
}
