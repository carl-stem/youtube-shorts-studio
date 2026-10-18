// scripts/gen-icons.mjs
// Run: node scripts/gen-icons.mjs
import { createCanvas } from 'canvas';
import fs from 'fs';
import path from 'path';

function drawIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size * 0.1875;
  // Rounded rect background
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, r);
  const grd = ctx.createLinearGradient(0, 0, size, size);
  grd.addColorStop(0, '#6366f1');
  grd.addColorStop(0.5, '#a855f7');
  grd.addColorStop(1, '#ec4899');
  ctx.fillStyle = grd;
  ctx.fill();
  // Spectrum bars
  const bars = [0.2, 0.35, 0.25, 0.42, 0.32, 0.18];
  const barW = size * 0.085;
  const gap = size * 0.02;
  const totalW = bars.length * barW + (bars.length - 1) * gap;
  let x = (size - totalW) / 2;
  const baseY = size * 0.72;
  bars.forEach(h => {
    const barH = h * size;
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.roundRect(x, baseY - barH, barW, barH, barW * 0.3);
    ctx.fill();
    x += barW + gap;
  });
  return canvas.toBuffer('image/png');
}

const dir = path.join(process.cwd(), 'public', 'icons');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon-192.png'), drawIcon(192));
fs.writeFileSync(path.join(dir, 'icon-512.png'), drawIcon(512));
console.log('Icons generated: public/icons/icon-192.png, icon-512.png');
