'use client';

interface DropzoneFile { name: string; meta: string }

interface Props {
  audio: DropzoneFile;
  image: DropzoneFile;
  srt: DropzoneFile;
  onAudioChange: (file: File) => void;
  onImageChange: (file: File) => void;
  onSrtChange: (file: File) => void;
}

export default function MediaUploader({ audio, image, srt, onAudioChange, onImageChange, onSrtChange }: Props) {
  const handleFile =
    (cb: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) cb(f);
    };

  return (
    <section className="bg-[#161822] border border-slate-800/80 rounded-2xl p-5 shadow-xl">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 mb-4 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs">1</span>
        Select Audio, Cover Art &amp; Subtitles
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Audio */}
        <label className="relative group cursor-pointer flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-700 hover:border-indigo-500 rounded-xl bg-[#11131a] hover:bg-indigo-950/10 transition-all text-center">
          <input type="file" accept=".wav,audio/*" className="hidden" onChange={handleFile(onAudioChange)} />
          <div className="w-11 h-11 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-slate-200 line-clamp-1">{audio.name}</span>
          <span className="text-xs text-slate-400 mt-1">{audio.meta}</span>
          <span className="text-[10px] text-slate-600 mt-0.5 lg:hidden">Tap to choose</span>
        </label>

        {/* Image */}
        <label className="relative group cursor-pointer flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-700 hover:border-pink-500 rounded-xl bg-[#11131a] hover:bg-pink-950/10 transition-all text-center">
          <input type="file" accept="image/*" className="hidden" onChange={handleFile(onImageChange)} />
          <div className="w-11 h-11 rounded-full bg-pink-500/10 text-pink-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-slate-200 line-clamp-1">{image.name}</span>
          <span className="text-xs text-slate-400 mt-1">{image.meta}</span>
        </label>

        {/* SRT */}
        <label className="relative group cursor-pointer flex flex-col items-center justify-center p-5 border-2 border-dashed border-slate-700 hover:border-violet-500 rounded-xl bg-[#11131a] hover:bg-violet-950/10 transition-all text-center">
          <input type="file" accept=".srt,.vtt" className="hidden" onChange={handleFile(onSrtChange)} />
          <div className="w-11 h-11 rounded-full bg-violet-500/10 text-violet-400 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-slate-200 line-clamp-1">{srt.name}</span>
          <span className="text-xs text-slate-400 mt-1">{srt.meta}</span>
        </label>
      </div>
    </section>
  );
}
