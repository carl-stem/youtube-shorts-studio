'use client';

import type { VizConfig } from '../types';

interface Props {
  vizConfig: VizConfig;
  onChange: (cfg: VizConfig) => void;
}

const selectCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-input)] text-[var(--text-1)] text-sm focus:outline-none focus:border-indigo-500 transition';

const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-[var(--bg-input)] border border-[var(--border-input)] text-[var(--text-1)] text-sm focus:outline-none focus:border-indigo-500 transition';

const toggleCls =
  'flex items-center gap-2.5 cursor-pointer select-none bg-[var(--bg-input)] border border-[var(--border)] rounded-xl px-3 py-3 min-h-[44px]';

export default function VisualStylePanel({ vizConfig, onChange }: Props) {
  const set = <K extends keyof VizConfig>(key: K, value: VizConfig[K]) =>
    onChange({ ...vizConfig, [key]: value });

  const toggles: { id: keyof VizConfig; label: string }[] = [
    { id: 'showTitle',    label: 'Track Title'     },
    { id: 'showArtist',   label: 'Artist Name'     },
    { id: 'showSpectrum', label: 'Spectrum Bars'   },
    { id: 'showProgress', label: 'Progress Bar'    },
    { id: 'showTimecode', label: 'Timecode'        },
    { id: 'showCC',       label: 'Subtitles (CC)'  },
  ];

  return (
    <section className="bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl p-5 shadow-xl space-y-5">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-300 flex items-center justify-center text-xs">3</span>
        Visual Style &amp; Layout
      </h2>

      {/* Visibility toggles */}
      <div>
        <p className="text-xs font-medium text-[var(--text-2)] mb-2">Visible Elements</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {toggles.map(({ id, label }) => (
            <label key={id} className={toggleCls}>
              <input
                type="checkbox"
                checked={vizConfig[id] as boolean}
                onChange={(e) => set(id, e.target.checked as VizConfig[typeof id])}
                className="accent-indigo-500 w-4 h-4"
              />
              <span className="text-xs text-[var(--text-1)]">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Style dropdowns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Color Theme</label>
          <select
            value={vizConfig.colorTheme}
            onChange={(e) => set('colorTheme', e.target.value as VizConfig['colorTheme'])}
            className={selectCls}
          >
            <option value="indigo-pink">Indigo → Pink (Default)</option>
            <option value="fire">Fire 🔥 (Yellow → Red)</option>
            <option value="ocean">Ocean 🌊 (Cyan → Blue)</option>
            <option value="neon">Neon 💚 (Green → Cyan)</option>
            <option value="gold">Gold ✨ (Amber → Orange)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Spectrum Style</label>
          <select
            value={vizConfig.spectrumStyle}
            onChange={(e) => set('spectrumStyle', e.target.value as VizConfig['spectrumStyle'])}
            className={selectCls}
          >
            <option value="bars">Bars (Default)</option>
            <option value="mirror">Mirror Bars</option>
            <option value="wave">Wave Line</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Background Style</label>
          <select
            value={vizConfig.bgStyle}
            onChange={(e) => set('bgStyle', e.target.value as VizConfig['bgStyle'])}
            className={selectCls}
          >
            <option value="blur">Blurred Art (Default)</option>
            <option value="gradient">Dark Gradient</option>
            <option value="dark">Pure Dark</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">Export Quality</label>
          <select
            value={vizConfig.exportQuality}
            onChange={(e) => set('exportQuality', parseInt(e.target.value, 10))}
            className={selectCls}
          >
            <option value={8000000}>Ultra (8 Mbps)</option>
            <option value={6000000}>High (6 Mbps)</option>
            <option value={3000000}>Medium (3 Mbps)</option>
            <option value={1500000}>Low (1.5 Mbps)</option>
          </select>
        </div>
      </div>

      {/* Creator overlay */}
      <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-surface2)] p-4">
        <div><h3 className="text-xs font-semibold text-[var(--text-1)]">Creator overlay</h3><p className="mt-1 text-[11px] text-[var(--text-3)]">Text, emoji and a link are burned into both preview and export; links appear as text, not clickable in the rendered video.</p></div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Emoji</label><input type="text" maxLength={8} value={vizConfig.overlayEmoji ?? ''} onChange={(e) => set('overlayEmoji', e.target.value)} placeholder="✨" className={inputCls} /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Link or handle</label><input type="text" maxLength={100} value={vizConfig.overlayLink ?? ''} onChange={(e) => set('overlayLink', e.target.value)} placeholder="example.com / @handle" className={inputCls} /></div>
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Overlay position</label><select value={vizConfig.overlayPosition ?? 'top'} onChange={(e) => set('overlayPosition', e.target.value as VizConfig['overlayPosition'])} className={selectCls}><option value="top">Top</option><option value="middle">Middle</option><option value="bottom">Bottom</option></select></div>
          <div><label className="mb-1.5 block text-xs font-medium text-[var(--text-2)]">Overlay treatment</label><select value={vizConfig.overlayStyle ?? 'pill'} onChange={(e) => set('overlayStyle', e.target.value as VizConfig['overlayStyle'])} className={selectCls}><option value="pill">Rounded pill</option><option value="banner">Banner</option><option value="outline">Outline</option></select></div>
        </div>
      </div>

      {/* CTA / Watermark */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">CTA / Watermark Text</label>
          <input
            type="text"
            value={vizConfig.ctaText}
            onChange={(e) => set('ctaText', e.target.value)}
            placeholder="e.g. Follow for more! · @handle"
            className={inputCls}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--text-2)] mb-1.5">CTA Position</label>
          <select
            value={vizConfig.ctaPosition}
            onChange={(e) => set('ctaPosition', e.target.value as VizConfig['ctaPosition'])}
            className={selectCls}
          >
            <option value="top">Top Banner</option>
            <option value="above-spectrum">Above Spectrum</option>
          </select>
        </div>
      </div>
    </section>
  );
}
