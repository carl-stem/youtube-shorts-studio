import type { VizConfig, SRTCue, RenderFrameOptions } from '../types';

export const SHORTS_WIDTH = 1080;
export const SHORTS_HEIGHT = 1920;
export const SPECTRUM_BANDS = 36;

export function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  const cr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + cr, y);
  ctx.arcTo(x + w, y, x + w, y + h, cr);
  ctx.arcTo(x + w, y + h, x, y + h, cr);
  ctx.arcTo(x, y + h, x, y, cr);
  ctx.arcTo(x, y, x + w, y, cr);
  ctx.closePath();
}

type RGB = [number, number, number];

const THEMES: Record<string, [RGB, RGB]> = {
  'indigo-pink': [[99, 102, 241], [236, 72, 153]],
  'fire':        [[250, 204, 21],  [239, 68, 68]],
  'ocean':       [[6, 182, 212],   [59, 130, 246]],
  'neon':        [[74, 222, 128],  [34, 211, 238]],
  'gold':        [[251, 191, 36],  [217, 119, 6]],
};

export function getThemeColors(i: number, total: number, theme: VizConfig['colorTheme']): RGB {
  const ratio = i / total;
  const [c1, c2] = THEMES[theme] ?? THEMES['indigo-pink'];
  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * ratio),
    Math.round(c1[1] + (c2[1] - c1[1]) * ratio),
    Math.round(c1[2] + (c2[2] - c1[2]) * ratio),
  ];
}

export function updateBlurredBackground(
  bgCanvas: HTMLCanvasElement,
  img: HTMLImageElement,
) {
  const bCtx = bgCanvas.getContext('2d');
  if (!bCtx) return;
  bCtx.save();
  bCtx.clearRect(0, 0, SHORTS_WIDTH, SHORTS_HEIGHT);
  const imgRatio = img.width / img.height;
  const targetRatio = SHORTS_WIDTH / SHORTS_HEIGHT;
  let dw: number, dh: number;
  if (imgRatio > targetRatio) { dh = SHORTS_HEIGHT; dw = dh * imgRatio; }
  else { dw = SHORTS_WIDTH; dh = dw / imgRatio; }
  const ox = (SHORTS_WIDTH - dw) / 2;
  const oy = (SHORTS_HEIGHT - dh) / 2;
  bCtx.filter = 'blur(55px)';
  bCtx.drawImage(img, ox - 80, oy - 80, dw + 160, dh + 160);
  bCtx.filter = 'none';
  bCtx.fillStyle = 'rgba(10, 12, 18, 0.68)';
  bCtx.fillRect(0, 0, SHORTS_WIDTH, SHORTS_HEIGHT);
  bCtx.restore();
}

export function computeSpectrumFromAnalyser(
  analyser: AnalyserNode | null,
  smoothed: Float32Array,
): { spectrum: Float32Array; bass: number } {
  if (!analyser) {
    const t = performance.now() / 1000;
    let bassSum = 0;
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      const wave = 0.08 + 0.06 * Math.sin(t * 2.5 + i * 0.35);
      smoothed[i] = 0.7 * smoothed[i] + 0.3 * wave;
      if (i < 6) bassSum += smoothed[i];
    }
    return { spectrum: smoothed, bass: (bassSum / 6) * 0.5 };
  }
  const freq = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(freq);
  const usable = Math.floor(freq.length * 0.35);
  let bassSum = 0;
  for (let i = 0; i < SPECTRUM_BANDS; i++) {
    const lo = Math.floor(1 + (i / SPECTRUM_BANDS) * (usable - 1));
    const hi = Math.max(lo + 1, Math.floor(1 + ((i + 1) / SPECTRUM_BANDS) * (usable - 1)));
    let sum = 0;
    for (let b = lo; b < hi; b++) sum += freq[b] / 255.0;
    const avg = sum / (hi - lo);
    const boosted = Math.min(1, Math.max(0.04, Math.log1p(avg * 9) / 2.25));
    smoothed[i] = 0.55 * boosted + 0.45 * smoothed[i];
    if (i < 6) bassSum += smoothed[i];
  }
  return { spectrum: smoothed, bass: Math.min(1, (bassSum / 6) * 1.15) };
}

function renderBackground(
  ctx: CanvasRenderingContext2D,
  bgCanvas: HTMLCanvasElement | null,
  coverImage: HTMLImageElement | null,
  bgStyle: VizConfig['bgStyle'],
) {
  if (bgStyle === 'blur' && bgCanvas && coverImage) {
    ctx.drawImage(bgCanvas, 0, 0);
  } else if (bgStyle === 'gradient') {
    const g = ctx.createRadialGradient(
      SHORTS_WIDTH / 2, SHORTS_HEIGHT * 0.35, 80,
      SHORTS_WIDTH / 2, SHORTS_HEIGHT * 0.35, SHORTS_HEIGHT * 0.7,
    );
    g.addColorStop(0, '#1e1b4b');
    g.addColorStop(0.5, '#0f172a');
    g.addColorStop(1, '#020617');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SHORTS_WIDTH, SHORTS_HEIGHT);
  } else {
    ctx.fillStyle = '#070810';
    ctx.fillRect(0, 0, SHORTS_WIDTH, SHORTS_HEIGHT);
    const v = ctx.createRadialGradient(
      SHORTS_WIDTH / 2, SHORTS_HEIGHT / 2, SHORTS_HEIGHT * 0.3,
      SHORTS_WIDTH / 2, SHORTS_HEIGHT / 2, SHORTS_HEIGHT * 0.85,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, SHORTS_WIDTH, SHORTS_HEIGHT);
  }
}

function renderSpectrumBars(
  ctx: CanvasRenderingContext2D,
  spectrum: Float32Array,
  vizConfig: VizConfig,
) {
  const specBaseY = 1480;
  const maxBarHeight = 190;
  const totalSpecWidth = 820;
  const barGap = 8;
  const barWidth = (totalSpecWidth - (SPECTRUM_BANDS - 1) * barGap) / SPECTRUM_BANDS;
  const startX = (SHORTS_WIDTH - totalSpecWidth) / 2;

  if (vizConfig.spectrumStyle === 'wave') {
    ctx.save();
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const wg = ctx.createLinearGradient(startX, 0, startX + totalSpecWidth, 0);
    const [r1, g1, b1] = getThemeColors(0, SPECTRUM_BANDS, vizConfig.colorTheme);
    const [r2, g2, b2] = getThemeColors(SPECTRUM_BANDS - 1, SPECTRUM_BANDS, vizConfig.colorTheme);
    wg.addColorStop(0, `rgba(${r1},${g1},${b1},0.95)`);
    wg.addColorStop(1, `rgba(${r2},${g2},${b2},0.95)`);
    ctx.strokeStyle = wg;
    ctx.beginPath();
    for (let i = 0; i < SPECTRUM_BANDS; i++) {
      const x = startX + i * (barWidth + barGap) + barWidth / 2;
      const y = specBaseY - Math.max(8, Math.round(spectrum[i] * maxBarHeight));
      if (i === 0) ctx.moveTo(x, y);
      else {
        const px = startX + (i - 1) * (barWidth + barGap) + barWidth / 2;
        const py = specBaseY - Math.max(8, Math.round(spectrum[i - 1] * maxBarHeight));
        const cpX = (px + x) / 2;
        ctx.bezierCurveTo(cpX, py, cpX, y, x, y);
      }
    }
    ctx.stroke();
    const lx = startX + (SPECTRUM_BANDS - 1) * (barWidth + barGap) + barWidth / 2;
    ctx.lineTo(lx, specBaseY);
    ctx.lineTo(startX, specBaseY);
    ctx.closePath();
    const [rm, gm, bm] = getThemeColors(Math.floor(SPECTRUM_BANDS / 2), SPECTRUM_BANDS, vizConfig.colorTheme);
    ctx.fillStyle = `rgba(${rm},${gm},${bm},0.12)`;
    ctx.fill();
    ctx.restore();
    return;
  }

  for (let i = 0; i < SPECTRUM_BANDS; i++) {
    const val = spectrum[i];
    const barH = Math.max(8, Math.round(val * maxBarHeight));
    const bx = Math.round(startX + i * (barWidth + barGap));
    const [r, g, b] = getThemeColors(i, SPECTRUM_BANDS, vizConfig.colorTheme);
    ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.92)`;
    if (vizConfig.spectrumStyle === 'mirror') {
      const cy = specBaseY - maxBarHeight / 2;
      const hh = Math.max(4, Math.round(barH / 2));
      drawRoundedRect(ctx, bx, cy - hh, barWidth, hh, 4); ctx.fill();
      drawRoundedRect(ctx, bx, cy, barWidth, hh, 4); ctx.fill();
    } else {
      drawRoundedRect(ctx, bx, specBaseY - barH, barWidth, barH + Math.floor(barH / 3), 6);
      ctx.fill();
    }
  }
}

function renderCC(
  ctx: CanvasRenderingContext2D,
  cues: SRTCue[],
  absTime: number,
  vizConfig: VizConfig,
) {
  if (!vizConfig.showCC || !cues.length) return;
  const cue = cues.find((c) => absTime >= c.start && absTime < c.end);
  if (!cue) return;
  const lines = cue.text.replace(/<[^>]*>/g, '').split('\n');
  const fontSize = 44;
  const lineH = fontSize + 10;
  const padV = 20;
  const totalH = lines.length * lineH + padV * 2;
  const bgW = 900;
  const bgX = (SHORTS_WIDTH - bgW) / 2;
  const bgY = SHORTS_HEIGHT - 380 - totalH;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
  drawRoundedRect(ctx, bgX, bgY, bgW, totalH, 16);
  ctx.fill();
  ctx.font = `500 ${fontSize}px Inter, Segoe UI, sans-serif`;
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  lines.forEach((line, i) => ctx.fillText(line.trim(), SHORTS_WIDTH / 2, bgY + padV + i * lineH));
  ctx.restore();
}

function renderCTA(ctx: CanvasRenderingContext2D, vizConfig: VizConfig) {
  const text = [vizConfig.overlayEmoji, vizConfig.ctaText, vizConfig.overlayLink].filter(Boolean).join('  ');
  if (!text) return;
  ctx.save();
  const fontSize = 38;
  ctx.font = `600 ${fontSize}px Inter, Segoe UI, sans-serif`;
  const maxWidth = 900;
  const label = text.length > 120 ? `${text.slice(0, 117)}…` : text;
  const pH = 28, pV = 14;
  const bgW = Math.min(maxWidth, ctx.measureText(label).width + pH * 2);
  const bgH = fontSize + pV * 2;
  const bgX = (SHORTS_WIDTH - bgW) / 2;
  const position = vizConfig.overlayPosition ?? vizConfig.ctaPosition;
  const bgY = position === 'middle' ? 900 : position === 'bottom' ? 1720 : (position === 'top' ? 60 : 1250);
  const style = vizConfig.overlayStyle ?? 'pill';
  if (style !== 'outline') {
    ctx.fillStyle = style === 'banner' ? 'rgba(0, 0, 0, 0.72)' : 'rgba(0, 0, 0, 0.55)';
    if (style === 'banner') ctx.fillRect(bgX, bgY, bgW, bgH);
    else { drawRoundedRect(ctx, bgX, bgY, bgW, bgH, 50); ctx.fill(); }
  } else {
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, bgX, bgY, bgW, bgH, 50);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, SHORTS_WIDTH / 2, bgY + bgH / 2, bgW - pH);
  ctx.restore();
}

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export function renderShortsFrame(
  ctx: CanvasRenderingContext2D,
  currentTime: number,
  totalDuration: number,
  spectrum: Float32Array,
  bassEnergy: number,
  opts: RenderFrameOptions,
): string {
  const { blurredBgCanvas, coverImage, vizConfig, srtCues, segmentOffset, titleText, artistText } = opts;

  renderBackground(ctx, blurredBgCanvas, coverImage, vizConfig.bgStyle);

  // Cover art with bass-pulse scale
  if (coverImage) {
    const scale = 1.0 + 0.035 * bassEnergy;
    const artSize = Math.round(760 * scale);
    const artX = Math.round((SHORTS_WIDTH - artSize) / 2);
    const artY = Math.round(260 - (artSize - 760) / 2);
    const radius = Math.round(42 * scale);
    ctx.save();
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 45;
    ctx.shadowOffsetY = 18;
    drawRoundedRect(ctx, artX, artY, artSize, artSize, radius);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.clip();
    const minDim = Math.min(coverImage.width, coverImage.height);
    const sx = (coverImage.width - minDim) / 2;
    const sy = (coverImage.height - minDim) / 2;
    ctx.drawImage(coverImage, sx, sy, minDim, minDim, artX, artY, artSize, artSize);
    ctx.restore();
  }

  if (vizConfig.showTitle) {
    ctx.save();
    ctx.font = '700 54px Inter, Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 1.0)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(titleText || 'Your Track Title', SHORTS_WIDTH / 2, 1100);
    ctx.restore();
  }

  if (vizConfig.showArtist) {
    ctx.save();
    ctx.font = '500 36px Inter, Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(185, 190, 210, 0.90)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(artistText || 'Artist Name', SHORTS_WIDTH / 2, 1172);
    ctx.restore();
  }

  if (vizConfig.showSpectrum) {
    renderSpectrumBars(ctx, spectrum, vizConfig);
  }

  const safe = Math.max(0.1, totalDuration);
  const ratio = Math.min(1, Math.max(0, currentTime / safe));
  const progBarW = 820, progBarH = 10;
  const progBarX = (SHORTS_WIDTH - progBarW) / 2;
  const progBarY = 1620;

  if (vizConfig.showProgress) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
    drawRoundedRect(ctx, progBarX, progBarY, progBarW, progBarH, 5); ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    drawRoundedRect(ctx, progBarX, progBarY, Math.max(10, Math.round(progBarW * ratio)), progBarH, 5); ctx.fill();
  }

  const timeStr = `${fmt(currentTime)} / ${fmt(safe)}`;
  if (vizConfig.showTimecode) {
    ctx.save();
    ctx.font = '500 26px Inter, Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(200, 200, 210, 0.72)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(timeStr, SHORTS_WIDTH / 2, progBarY + 24);
    ctx.restore();
  }

  renderCC(ctx, srtCues, segmentOffset + currentTime, vizConfig);
  renderCTA(ctx, vizConfig);

  return timeStr;
}

export function createDefaultCoverImage(): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    const tmp = document.createElement('canvas');
    tmp.width = 800; tmp.height = 800;
    const t = tmp.getContext('2d')!;

    // Deep indigo-to-black background
    const g = t.createLinearGradient(0, 0, 800, 800);
    g.addColorStop(0, '#1e1b4b'); g.addColorStop(1, '#030712');
    t.fillStyle = g; t.fillRect(0, 0, 800, 800);

    // Soft glow in center
    const glow = t.createRadialGradient(400, 380, 0, 400, 380, 280);
    glow.addColorStop(0, 'rgba(99,102,241,0.45)');
    glow.addColorStop(0.6, 'rgba(168,85,247,0.18)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    t.fillStyle = glow; t.fillRect(0, 0, 800, 800);

    // Music note icon (simplified waveform bars as placeholder)
    const barData = [0.35, 0.55, 0.80, 1.0, 0.75, 0.50, 0.30];
    const totalBarW = barData.length * 52 + (barData.length - 1) * 18;
    let bx = (800 - totalBarW) / 2;
    barData.forEach(h => {
      const barH = h * 200;
      const by = 400 - barH / 2;
      t.beginPath();
      t.roundRect(bx, by, 52, barH, 12);
      const barGrad = t.createLinearGradient(0, by, 0, by + barH);
      barGrad.addColorStop(0, 'rgba(165,180,252,0.95)');
      barGrad.addColorStop(1, 'rgba(99,102,241,0.6)');
      t.fillStyle = barGrad;
      t.fill();
      bx += 70;
    });

    // Instruction text
    t.fillStyle = 'rgba(148,163,184,0.70)';
    t.font = '500 32px Inter, sans-serif';
    t.textAlign = 'center';
    t.fillText('Drop your album cover above', 400, 660);

    const img = new Image();
    img.onload = () => resolve(img);
    img.src = tmp.toDataURL();
  });
}
