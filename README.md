# YouTube Shorts Studio

> **1080×1920 vertical video generator** — React/Next.js, live 60 fps canvas preview, editable segments, SRT captions, and one-click Vercel deploy.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/carl-stem/youtube-shorts-studio)

---

## Features

| Feature | Details |
|---------|---------|
| 🎵 **Audio engine** | Web Audio API — decodes WAV/MP3/OGG, fade-in/out, live FFT spectrum |
| 🎨 **Live canvas** | 1080×1920 @ 60 fps — see every change instantly |
| ✂️ **Editable segments** | Add, delete, and adjust start/duration per clip — not just auto-sliced |
| 🌈 **5 color themes** | Indigo→Pink, Fire, Ocean, Neon, Gold |
| 📊 **3 spectrum styles** | Bars, Mirror Bars, Wave Line |
| 🖼️ **3 backgrounds** | Blurred Art, Dark Gradient, Pure Dark |
| 💬 **SRT / CC** | Upload a subtitle file — captions render on-canvas in every clip |
| 📢 **CTA overlay** | Watermark / call-to-action text, top or above-spectrum position |
| 🎬 **Export quality** | 1.5 / 3 / 6 / 8 Mbps — MP4 (H.264) or WebM (VP9) depending on browser |
| 🚀 **Vercel-ready** | Static export (`next build` → `out/`) — zero backend required |

---

## Getting Started

```bash
git clone https://github.com/carl-stem/youtube-shorts-studio.git
cd youtube-shorts-studio
npm install
npm run dev
# → http://localhost:3000
```

## Deploy to Vercel

```bash
npx vercel --prod
```

Or click the **Deploy** button above to import directly into Vercel.

---

## Project Structure

```
├── app/                   # Next.js App Router
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
├── components/
│   ├── Studio.tsx         # Main orchestrator — all state & audio engine
│   ├── SegmentEditor.tsx  # Editable clip segments
│   ├── VisualStylePanel.tsx
│   ├── MediaUploader.tsx  # Audio + Image + SRT dropzones
│   ├── TrackSettings.tsx
│   ├── CanvasPreview.tsx
│   ├── Header.tsx
│   └── ConsoleLog.tsx
├── lib/
│   ├── canvasRenderer.ts  # All pure canvas drawing functions
│   ├── srtParser.ts
│   └── mediaCodec.ts
└── types/index.ts
```

## Tech Stack

- **Next.js 14** App Router · TypeScript · Tailwind CSS
- **Web Audio API** — AudioContext, AnalyserNode, MediaRecorder
- **HTML5 Canvas** — 1080×1920 @ 60 fps via `requestAnimationFrame`
- **MediaRecorder API** — real-time video capture from canvas stream

---

## How It Works

1. Load a WAV/audio file → auto-decoded with `AudioContext.decodeAudioData`
2. Segments are auto-sliced (or manually edited) in the **Segments panel**
3. Hit **Render & Download All** — each segment records canvas + audio simultaneously via `MediaRecorder`, producing an MP4 or WebM file per clip
4. Files auto-download and are listed for manual re-download

> **Note:** `MediaRecorder` records in real-time (1× speed). A 3-minute song split into 3 clips = ~3 minutes of render time. Plan accordingly for batch jobs.
