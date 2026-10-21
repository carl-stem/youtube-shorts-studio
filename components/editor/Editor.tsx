'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AccountStatus, DownloadItem } from '../../types';
import { createProject, type Id, type Project } from '../../lib/editor/model';
import { loadMediaFiles } from '../../lib/editor/persist';
import { setFraming } from '../../lib/editor/ops';
import { duration } from '../../lib/editor/timeline';
import { SequencePlayer } from '../../lib/render/sequencePlayer';
import type { AspectId } from '../../lib/render/layout';
import { EditorProvider, useEditor, type Notify } from './EditorProvider';
import EditorSteps from './EditorSteps';
import PreviewPlayer from './PreviewPlayer';
import ProjectBar from './ProjectBar';
import RelinkBanner from './RelinkBanner';
import StartScreen from './StartScreen';
import AddMedia from './steps/AddMedia';
import Arrange from './steps/Arrange';
import MakeItYours from './steps/MakeItYours';
import ReviewShare from './steps/ReviewShare';

interface Props {
  accounts: AccountStatus | null;
  notify: Notify;
  onOpenVisualizer: () => void;
}

interface Session {
  project: Project;
  files: Map<Id, File>;
}

export default function Editor({ accounts, notify, onOpenVisualizer }: Props) {
  const [session, setSession] = useState<Session | null>(null);
  const start = (format: AspectId) => setSession({ project: createProject(format), files: new Map() });
  const open = async (project: Project) => {
    try {
      setSession({ project, files: await loadMediaFiles(project) });
    } catch {
      setSession({ project, files: new Map() });
    }
  };
  if (!session) return <StartScreen onPick={start} onOpen={open} onOpenVisualizer={onOpenVisualizer} notify={notify} />;
  return (
    <EditorProvider key={session.project.id} initial={session.project} initialFiles={session.files} notify={notify}>
      <Workspace accounts={accounts} onClose={() => setSession(null)} />
    </EditorProvider>
  );
}

const isTyping = (target: EventTarget | null) =>
  target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'TEXTAREA' || (target.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range' && (target as HTMLInputElement).type !== 'checkbox'));

function Workspace({ accounts, onClose }: { accounts: AccountStatus | null; onClose: () => void }) {
  const { project, format, apply, seal, undo, redo, mediaUrl, notify } = useEditor();
  // A reopened project starts where the clips are.
  const [step, setStep] = useState(() => (project.story.length ? 2 : 1));
  const [selectedId, setSelectedId] = useState<Id | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [player, setPlayer] = useState<SequencePlayer | null>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [downloads, setDownloads] = useState<DownloadItem[]>([]);
  const projectRef = useRef(project);
  projectRef.current = project;
  const total = duration(project);

  useEffect(() => {
    if (!canvas) return;
    const next = new SequencePlayer({ canvas, getProject: () => projectRef.current, mediaUrl });
    let shown = -1;
    const offs = [
      // Ten updates a second is smooth enough for the readout without re-rendering every frame.
      next.on('time', (t) => { const tenth = Math.floor(Number(t) * 10); if (tenth !== shown) { shown = tenth; setTime(Number(t)); } }),
      next.on('playing', (value) => setPlaying(Boolean(value))),
      next.on('error', (message) => notify(String(message), 'error')),
    ];
    setPlayer(next);
    void next.seek(0);
    return () => { offs.forEach((off) => off()); next.destroy(); setPlayer(null); };
  }, [canvas, mediaUrl, notify]);

  // Any edit stops playback and redraws the current moment with the new story.
  useEffect(() => {
    if (!player || exporting) return;
    player.pause();
    player.refresh();
  }, [project, player, exporting]);

  useEffect(() => {
    if (!project.story.some((clip) => clip.id === selectedId)) setSelectedId(project.story[0]?.id ?? null);
  }, [project.story, selectedId]);

  const downloadsRef = useRef(downloads);
  downloadsRef.current = downloads;
  useEffect(() => () => downloadsRef.current.forEach((item) => URL.revokeObjectURL(item.url)), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (exporting || isTyping(event.target) || !(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey) { event.preventDefault(); undo(); }
      else if ((key === 'z' && event.shiftKey) || key === 'y') { event.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [exporting, undo, redo]);

  const goTo = useCallback((next: number) => {
    setStep(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);
  // Wait a frame so the player sees the edit that triggered the seek.
  const seek = useCallback((t: number) => { requestAnimationFrame(() => void player?.seek(t)); }, [player]);
  const toggle = () => { if (!player) return; if (player.isPlaying) player.pause(); else void player.play(); };

  // In step 3, dragging the preview moves a filled clip's picture (pan -1..1 across the overflow).
  const dragStart = useRef<{ clipId: Id; panX: number; panY: number } | null>(null);
  const selectedClip = project.story.find((clip) => clip.id === selectedId);
  const onDrag = step === 3 && selectedClip?.framing.mode === 'fill' ? (dx: number, dy: number, done: boolean) => {
    const framing = selectedClip.framing;
    if (framing.mode !== 'fill') return;
    if (!dragStart.current || dragStart.current.clipId !== selectedClip.id) dragStart.current = { clipId: selectedClip.id, panX: framing.panX, panY: framing.panY };
    const start = dragStart.current;
    const clampPan = (value: number) => Math.max(-1, Math.min(1, value));
    apply((p) => setFraming(p, selectedClip.id, { ...framing, panX: clampPan(start.panX + dx * 2), panY: clampPan(start.panY + dy * 2) }), 'Move picture', `pan:${selectedClip.id}`);
    if (done) { dragStart.current = null; seal(); }
  } : undefined;

  return (
    <div className="min-h-[calc(100vh-5rem)] w-full">
      <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-indigo-500/20 bg-gradient-to-br from-indigo-600/10 via-[var(--bg-surface)] to-fuchsia-500/10 p-4 shadow-lg shadow-indigo-900/5 sm:px-6">
          <ProjectBar locked={exporting} onClose={onClose} />
          {/* Every step opens once the story has a clip; nothing moves while exporting. */}
          <EditorSteps current={step} furthest={exporting ? 0 : project.story.length ? 4 : 1} onChange={goTo} />
        </div>
        <RelinkBanner />
      </div>
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-6 px-4 py-5 sm:px-6 lg:grid-cols-12 lg:px-8">
        <section className="space-y-5 lg:col-span-7">
          {step === 1 && <AddMedia onNext={() => goTo(2)} />}
          {step === 2 && <Arrange selectedId={selectedId} onSelect={setSelectedId} playhead={time} onSeek={seek} onBack={() => goTo(1)} onNext={() => goTo(3)} />}
          {step === 3 && <MakeItYours selectedId={selectedId} onSelect={setSelectedId} playhead={time} onSeek={seek} onBack={() => goTo(2)} onNext={() => goTo(4)} />}
          {step === 4 && (
            <ReviewShare player={player} canvas={canvas} accounts={accounts} downloads={downloads}
              onExported={(item) => setDownloads((previous) => [item, ...previous])} onExportingChange={setExporting} onBack={() => goTo(3)} />
          )}
        </section>
        <aside className="space-y-4 lg:sticky lg:top-20 lg:col-span-5">
          <PreviewPlayer format={format} canvasRef={setCanvas} time={time} total={total} playing={playing} disabled={exporting} onToggle={toggle} onSeek={seek} onDrag={onDrag} />
        </aside>
      </div>
    </div>
  );
}
