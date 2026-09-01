// ============================================================
// Procedural demo footage — deterministic Tokyo-night scenes.
// Every frame is a pure function of (kind, sourceTime, seed):
// the renderer calls drawProceduralFrame per frame, so all
// editing operations (cuts, speed, effects) act on real pixels.
// ============================================================

export type SceneKind =
  | 'title_bg' | 'skyline' | 'train' | 'crosswalk' | 'neon' | 'crowd'
  | 'buildings' | 'drone' | 'taxi_lights' | 'alley' | 'bars';

// -------- deterministic PRNG helpers --------
const fract = (x: number) => x - Math.floor(x);
const hash1 = (n: number) => fract(Math.sin(n * 127.1 + 311.7) * 43758.5453123);
const hash2 = (n: number, m: number) => hash1(n * 157.31 + m * 113.97);

const NEON = ['#ff2d78', '#00e5ff', '#ffb020', '#7c4dff', '#00ff9d', '#ff5e3a', '#4dc3ff'];

function windowGrid(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  cols: number, rows: number, seed: number, litRatio: number, warm: number,
) {
  const cw = w / cols, ch = h / rows;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const r = hash2(seed + i * 7.3, j * 3.1);
      if (r > litRatio) continue;
      const wr = hash2(seed + i, j + 50);
      ctx.fillStyle = wr < warm ? `rgba(255,${190 + wr * 60 | 0},120,${0.5 + r * 0.5})` : `rgba(160,210,255,${0.4 + r * 0.5})`;
      ctx.fillRect(x + i * cw + cw * 0.2, y + j * ch + ch * 0.25, cw * 0.55, ch * 0.5);
    }
  }
}

function skyGradient(ctx: CanvasRenderingContext2D, w: number, h: number, top = '#05060f', bottom = '#141a33') {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ---------------------------------------------------------------
export function drawProceduralFrame(
  ctx: CanvasRenderingContext2D, kind: string, w: number, h: number, t: number, seed = 0,
): void {
  ctx.save();
  switch (kind as SceneKind) {
    case 'title_bg': drawTitleBg(ctx, w, h, t, seed); break;
    case 'skyline': drawSkyline(ctx, w, h, t, seed); break;
    case 'train': drawTrain(ctx, w, h, t, seed); break;
    case 'crosswalk': drawCrosswalk(ctx, w, h, t, seed); break;
    case 'neon': drawNeon(ctx, w, h, t, seed); break;
    case 'crowd': drawCrowd(ctx, w, h, t, seed); break;
    case 'buildings': drawBuildings(ctx, w, h, t, seed); break;
    case 'drone': drawDrone(ctx, w, h, t, seed); break;
    case 'taxi_lights': drawTaxiLights(ctx, w, h, t, seed); break;
    case 'alley': drawAlley(ctx, w, h, t, seed); break;
    default: drawBars(ctx, w, h, t); break;
  }
  ctx.restore();
}

// -------- out-of-focus city bokeh (opening background) --------
function drawTitleBg(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  skyGradient(ctx, w, h, '#020308', '#0a0d1d');
  for (let i = 0; i < 46; i++) {
    const r1 = hash2(seed + i, 1), r2 = hash2(seed + i, 2), r3 = hash2(seed + i, 3);
    const x = ((r1 + t * 0.006 * (0.3 + r3)) % 1) * w;
    const y = (0.15 + r2 * 0.8) * h;
    const rad = (8 + r3 * 42) * (h / 1080);
    const pulse = 0.45 + 0.3 * Math.sin(t * (0.6 + r2) + i * 2.4);
    const col = NEON[i % NEON.length];
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col);
    g.addColorStop(1, 'transparent');
    ctx.globalAlpha = pulse * 0.5;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

// -------- night skyline with slow pan --------
function drawSkyline(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  skyGradient(ctx, w, h, '#070a18', '#1a2142');
  // moon glow
  const mg = ctx.createRadialGradient(w * 0.78, h * 0.18, 0, w * 0.78, h * 0.18, h * 0.25);
  mg.addColorStop(0, 'rgba(220,230,255,0.35)');
  mg.addColorStop(1, 'transparent');
  ctx.fillStyle = mg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#e8ecff';
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.18, h * 0.035, 0, 7);
  ctx.fill();

  const pan = t * w * 0.012; // slow drift
  for (let layer = 0; layer < 3; layer++) {
    const speed = [0.25, 0.55, 1][layer];
    const baseY = [0.42, 0.52, 0.62][layer] * h;
    const shade = ['#0b1026', '#101636', '#181f4a'][layer];
    const n = 14 + layer * 4;
    for (let i = -1; i < n + 1; i++) {
      const rw = (0.05 + hash2(seed + layer * 31, i) * 0.09) * w;
      const rh = (0.18 + hash2(seed + layer * 31, i + 90) * 0.4) * h * (0.6 + layer * 0.25);
      const x = ((i * w * 0.085 - pan * speed) % (w * (n * 0.085 + 0.1)));
      const xx = x < -rw ? x + w * (n * 0.085 + 0.1) : x;
      ctx.fillStyle = shade;
      ctx.fillRect(xx, baseY + h - rh - baseY, rw, rh);
      if (layer === 2) {
        windowGrid(ctx, xx, h - rh, rw, rh, Math.max(3, rw / 26 | 0), Math.max(4, rh / 30 | 0), seed + i * 13, 0.42, 0.55);
        // red aircraft-warning beacons
        if (hash2(seed, i) > 0.6) {
          ctx.fillStyle = `rgba(255,60,60,${0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i))})`;
          ctx.beginPath();
          ctx.arc(xx + rw / 2, h - rh - 4, 3.2 * (h / 1080), 0, 7);
          ctx.fill();
        }
      }
    }
  }
  // tokyo-tower-like landmark
  const tx = w * 0.22 - pan * 0.55 * 0.001 * w;
  ctx.strokeStyle = '#ff7a4d';
  ctx.lineWidth = 5 * (h / 1080);
  ctx.beginPath();
  ctx.moveTo(tx - w * 0.045, h * 0.62);
  ctx.lineTo(tx, h * 0.28);
  ctx.lineTo(tx + w * 0.045, h * 0.62);
  ctx.moveTo(tx - w * 0.027, h * 0.5);
  ctx.lineTo(tx + w * 0.027, h * 0.5);
  ctx.moveTo(tx - w * 0.015, h * 0.4);
  ctx.lineTo(tx + w * 0.015, h * 0.4);
  ctx.stroke();
  ctx.fillStyle = `rgba(255,120,80,${0.5 + 0.5 * Math.sin(t * 3)})`;
  ctx.beginPath();
  ctx.arc(tx, h * 0.275, 4 * (h / 1080), 0, 7);
  ctx.fill();
  // foreground water reflection
  const wg = ctx.createLinearGradient(0, h * 0.62, 0, h);
  wg.addColorStop(0, 'rgba(10,14,34,0.9)');
  wg.addColorStop(1, '#04050c');
  ctx.fillStyle = wg;
  ctx.fillRect(0, h * 0.62, w, h * 0.38);
  for (let i = 0; i < 60; i++) {
    const r = hash2(seed + 7, i);
    const x = ((r * 1.3 - pan * 0.0005) % 1) * w;
    const y = h * (0.64 + hash2(seed, i + 30) * 0.3);
    const len = 20 + r * 60;
    ctx.strokeStyle = `rgba(${r > 0.5 ? '255,150,120' : '120,190,255'},${0.12 + 0.1 * Math.sin(t * 2 + i)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + len * (h / 1080), y);
    ctx.stroke();
  }
}

// -------- commuter train passing --------
function drawTrain(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  skyGradient(ctx, w, h, '#06070f', '#101427');
  // background buildings
  for (let i = 0; i < 12; i++) {
    const rw = (0.06 + hash2(seed, i) * 0.06) * w;
    const rh = (0.25 + hash2(seed, i + 40) * 0.3) * h;
    const x = i * w * 0.088;
    ctx.fillStyle = '#0d1230';
    ctx.fillRect(x, h * 0.55 - rh, rw, rh);
    windowGrid(ctx, x, h * 0.55 - rh, rw, rh, 4, 8, seed + i, 0.35, 0.5);
  }
  // elevated track
  ctx.fillStyle = '#151a2e';
  ctx.fillRect(0, h * 0.52, w, h * 0.1);
  ctx.fillStyle = '#0a0d1a';
  for (let i = 0; i < 10; i++) ctx.fillRect(i * w * 0.11 + w * 0.03, h * 0.62, w * 0.02, h * 0.38);
  // train: enters at t=0.4, crosses in ~5s, loops
  const cars = 6, carW = w * 0.34, gap = w * 0.006;
  const total = cars * (carW + gap) + w * 1.4;
  const tx = w * 1.2 - ((t * 0.22 + seed * 0.13) % 1.15) * total;
  const cy = h * 0.40;
  const carH = h * 0.13;
  for (let c = 0; c < cars; c++) {
    const x = tx + c * (carW + gap);
    if (x > w || x + carW < 0) continue;
    ctx.fillStyle = '#c8ccd4';
    ctx.beginPath();
    ctx.roundRect(x, cy, carW, carH, 8);
    ctx.fill();
    ctx.fillStyle = '#2f9e6e';
    ctx.fillRect(x, cy + carH * 0.72, carW, carH * 0.14);
    // windows glowing warm
    const wins = 7;
    for (let k = 0; k < wins; k++) {
      ctx.fillStyle = `rgba(255,220,150,${0.75 + hash2(c, k) * 0.25})`;
      ctx.fillRect(x + carW * 0.05 + k * carW * 0.135, cy + carH * 0.18, carW * 0.1, carH * 0.42);
      // passenger silhouettes
      if (hash2(seed + c, k) > 0.4) {
        ctx.fillStyle = 'rgba(20,22,30,0.9)';
        ctx.beginPath();
        ctx.arc(x + carW * 0.1 + k * carW * 0.135, cy + carH * 0.44, carH * 0.1, 0, 7);
        ctx.fill();
        ctx.fillRect(x + carW * 0.065 + k * carW * 0.135, cy + carH * 0.5, carH * 0.24, carH * 0.14);
      }
    }
  }
  // light streak under train + motion blur strokes
  ctx.globalAlpha = 0.25;
  ctx.fillStyle = '#9fd8ff';
  ctx.fillRect(0, cy + carH + 2, w, 3);
  ctx.globalAlpha = 1;
  // foreground catenary poles sweeping fast
  ctx.strokeStyle = '#05060a';
  ctx.lineWidth = w * 0.012;
  const poleSpace = w * 0.5;
  const px = poleSpace - ((t * w * 0.9) % poleSpace);
  for (let x = px - poleSpace; x < w + poleSpace; x += poleSpace) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
}

// -------- scramble crossing --------
function drawCrosswalk(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  // wet asphalt
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#0c0f1c');
  g.addColorStop(0.45, '#141828');
  g.addColorStop(1, '#1d2236');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // buildings + signage glow at top
  for (let i = 0; i < 7; i++) {
    const x = i * w * 0.15;
    ctx.fillStyle = '#0a0e22';
    ctx.fillRect(x, 0, w * 0.13, h * 0.3);
    const col = NEON[(i + seed) % NEON.length];
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 2.2 + i * 1.7);
    ctx.fillRect(x + w * 0.01, h * (0.05 + hash2(seed, i) * 0.15), w * 0.11, h * 0.045);
    ctx.globalAlpha = 1;
  }
  // zebra stripes in perspective
  ctx.save();
  ctx.translate(w / 2, h * 0.34);
  for (let i = 0; i < 9; i++) {
    const p = i / 9;
    const y = p * p * h * 0.72;
    const sw = w * (0.24 + p * 0.9);
    const sh = h * 0.02 + p * h * 0.05;
    ctx.fillStyle = `rgba(210,218,235,${0.5 - p * 0.18})`;
    ctx.fillRect(-sw / 2, y, sw, sh);
  }
  ctx.restore();
  // pedestrians crossing (silhouettes with umbrella-free bob)
  for (let i = 0; i < 26; i++) {
    const r = hash2(seed + i, 3), dir = r > 0.5 ? 1 : -1;
    const speed = 0.05 + hash2(seed + i, 8) * 0.05;
    const px = ((hash2(seed + i, 5) + t * speed * dir + 10) % 1) * w;
    const depth = hash2(seed + i, 6);
    const py = h * (0.45 + depth * 0.45);
    const ph = h * (0.06 + depth * 0.16);
    const bob = Math.sin(t * 9 + i) * ph * 0.03;
    ctx.fillStyle = `rgba(8,10,16,${0.75 + depth * 0.25})`;
    // body
    ctx.beginPath();
    ctx.ellipse(px, py - ph * 0.55 + bob, ph * 0.14, ph * 0.34, 0, 0, 7);
    ctx.fill();
    // head
    ctx.beginPath();
    ctx.arc(px, py - ph + bob, ph * 0.12, 0, 7);
    ctx.fill();
    // legs scissor
    const leg = Math.sin(t * 9 + i) * ph * 0.16;
    ctx.strokeStyle = `rgba(8,10,16,${0.75 + depth * 0.25})`;
    ctx.lineWidth = ph * 0.07;
    ctx.beginPath();
    ctx.moveTo(px, py - ph * 0.3 + bob);
    ctx.lineTo(px + leg, py);
    ctx.moveTo(px, py - ph * 0.3 + bob);
    ctx.lineTo(px - leg, py);
    ctx.stroke();
  }
  // signal glow
  const green = Math.floor(t / 6) % 2 === 0;
  ctx.fillStyle = green ? 'rgba(60,255,140,0.8)' : 'rgba(255,70,70,0.8)';
  ctx.beginPath();
  ctx.arc(w * 0.93, h * 0.38, h * 0.02, 0, 7);
  ctx.fill();
  // reflections
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = NEON[i % NEON.length];
    ctx.fillRect(w * (0.1 + i * 0.18), h * 0.6, w * 0.08, h * 0.4);
  }
  ctx.globalAlpha = 1;
}

// -------- neon sign wall --------
function drawNeon(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  skyGradient(ctx, w, h, '#080510', '#120a20');
  const signs = 12;
  for (let i = 0; i < signs; i++) {
    const r1 = hash2(seed + i, 1), r2 = hash2(seed + i, 2);
    const x = (0.04 + (i % 4) * 0.25 + r1 * 0.04) * w;
    const y = (0.06 + Math.floor(i / 4) * 0.3 + r2 * 0.06) * h;
    const sw = w * (0.14 + r1 * 0.06);
    const sh = h * (0.16 + r2 * 0.08);
    const col = NEON[(i * 3 + seed) % NEON.length];
    const flicker = hash2(i, Math.floor(t * 12)) > 0.06 ? 1 : 0.25; // occasional flicker
    const on = 0.55 + 0.45 * Math.sin(t * (1 + r2 * 2) + i);
    // sign board
    ctx.fillStyle = '#0d0918';
    ctx.beginPath();
    ctx.roundRect(x, y, sw, sh, 10);
    ctx.fill();
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 26 * (h / 1080) * flicker;
    ctx.strokeStyle = col;
    ctx.globalAlpha = flicker * (0.7 + on * 0.3);
    ctx.lineWidth = 3.5 * (h / 1080);
    ctx.strokeRect(x + 6, y + 6, sw - 12, sh - 12);
    // abstract signage motif — stacked marks, no letterforms
    const marks = 3 + (i % 3);
    ctx.fillStyle = col;
    ctx.lineWidth = 3 * (h / 1080);
    for (let k = 0; k < marks; k++) {
      const my = y + sh * 0.24 + k * sh * 0.2;
      const kind = Math.floor(hash2(seed + i, k + 9) * 3);
      const half = sw * (0.1 + hash2(seed + i, k + 21) * 0.16);
      if (kind === 0) {
        ctx.fillRect(x + sw / 2 - half, my - sh * 0.035, half * 2, sh * 0.07);
      } else if (kind === 1) {
        ctx.beginPath();
        ctx.arc(x + sw / 2, my, sh * 0.055, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.moveTo(x + sw / 2 - half, my + sh * 0.04);
        ctx.lineTo(x + sw / 2, my - sh * 0.05);
        ctx.lineTo(x + sw / 2 + half, my + sh * 0.04);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  // rain streaks catching light
  ctx.strokeStyle = 'rgba(160,200,255,0.12)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 70; i++) {
    const x = hash2(seed, i) * w;
    const y = ((hash2(seed, i + 99) + t * 1.4) % 1) * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 4, y + h * 0.03);
    ctx.stroke();
  }
}

// -------- crowd flow (station concourse) --------
function drawCrowd(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#131320');
  g.addColorStop(1, '#232438');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  // ceiling light strips
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = 'rgba(255,240,210,0.5)';
    const p = i / 6;
    ctx.fillRect(w * (0.5 - 0.4 * (1 - p)), h * 0.06 + p * h * 0.16, w * 0.8 * (1 - p) + w * 0.05, 4 + p * 6);
  }
  // departure board — LED dash rows, no readable text
  ctx.fillStyle = '#0a0d14';
  ctx.fillRect(w * 0.3, h * 0.12, w * 0.4, h * 0.14);
  const dot = Math.max(1, h * 0.006);
  for (let row = 0; row < 3; row++) {
    const ry = h * (0.158 + row * 0.038);
    const lit = Math.floor(t * 2 + row) % 4 === 0;
    ctx.fillStyle = lit ? '#9CFF3C' : '#5aa82a';
    for (let c = 0; c < 26; c++) {
      if (hash2(seed + row * 13, c) > 0.55) continue;
      ctx.fillRect(w * 0.32 + c * w * 0.0135, ry, dot * 1.6, dot * 2.4);
    }
  }
  // walking crowd, layered by depth
  const people = 42;
  const list: number[] = [];
  for (let i = 0; i < people; i++) list.push(i);
  list.sort((a, b) => hash2(seed + a, 6) - hash2(seed + b, 6));
  for (const i of list) {
    const depth = hash2(seed + i, 6);
    const dir = hash2(seed + i, 2) > 0.45 ? 1 : -1;
    const speed = 0.04 + depth * 0.09;
    const px = ((hash2(seed + i, 4) + t * speed * dir + 10) % 1) * w;
    const py = h * (0.38 + depth * 0.55);
    const ph = h * (0.08 + depth * 0.3);
    const bob = Math.sin(t * 8 + i * 2) * ph * 0.02;
    const shade = 8 + depth * 26;
    ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 9})`;
    ctx.beginPath();
    ctx.ellipse(px, py - ph * 0.5 + bob, ph * 0.15, ph * 0.36, 0, 0, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py - ph * 0.95 + bob, ph * 0.11, 0, 7);
    ctx.fill();
    const leg = Math.sin(t * 8 + i * 2) * ph * 0.18;
    ctx.lineWidth = ph * 0.08;
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.beginPath();
    ctx.moveTo(px, py - ph * 0.22 + bob);
    ctx.lineTo(px + leg, py + ph * 0.02);
    ctx.moveTo(px, py - ph * 0.22 + bob);
    ctx.lineTo(px - leg * 0.8, py + ph * 0.02);
    ctx.stroke();
    // phone glow on some
    if (hash2(seed + i, 11) > 0.72) {
      ctx.fillStyle = 'rgba(160,210,255,0.6)';
      ctx.beginPath();
      ctx.arc(px + ph * 0.12 * dir, py - ph * 0.55 + bob, ph * 0.05, 0, 7);
      ctx.fill();
    }
  }
  // floor reflection sheen
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = '#aac8ff';
  ctx.fillRect(0, h * 0.86, w, h * 0.14);
  ctx.globalAlpha = 1;
}

// -------- low-angle tower shot --------
function drawBuildings(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  skyGradient(ctx, w, h, '#0a0f24', '#03040a');
  // converging towers from corners
  const cx = w * 0.5, cy = h * 0.34;
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + 0.4 + t * 0.008;
    const bw = w * (0.1 + hash2(seed, i) * 0.1);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#232c55');
    grad.addColorStop(1, '#05060d');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.14, 0);
    ctx.lineTo(bw * 0.14, 0);
    ctx.lineTo(bw, h);
    ctx.lineTo(-bw, h);
    ctx.closePath();
    ctx.fill();
    // window streams
    for (let k = 0; k < 30; k++) {
      const p = k / 30;
      const r = hash2(seed + i, k);
      if (r > 0.5) continue;
      const wx = (-0.6 + hash2(seed + i, k + 44) * 1.2) * bw * (0.14 + p * 0.86);
      ctx.fillStyle = r < 0.2 ? `rgba(255,205,140,${0.6 - p * 0.3})` : `rgba(150,200,255,${0.55 - p * 0.3})`;
      const ws = (1 + p * 7) * (h / 1080);
      ctx.fillRect(wx, p * h, ws, ws * 1.6);
    }
    ctx.restore();
  }
  // sky center glow + drifting clouds
  const cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, h * 0.5);
  cg.addColorStop(0, 'rgba(70,100,190,0.28)');
  cg.addColorStop(1, 'transparent');
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, w, h);
  // blinking rooftop beacons
  for (let i = 0; i < 7; i++) {
    const ang = (i / 7) * Math.PI * 2 + 0.4 + t * 0.008;
    ctx.fillStyle = `rgba(255,70,70,${0.35 + 0.65 * Math.abs(Math.sin(t * 1.8 + i * 1.3))})`;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(ang + Math.PI / 2) * 0, cy + Math.sin(ang) * 6, 3.5 * (h / 1080), 0, 7);
    ctx.fill();
  }
}

// -------- aerial drone shot --------
function drawDrone(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  ctx.fillStyle = '#04050c';
  ctx.fillRect(0, 0, w, h);
  // city grid from above with perspective drift
  const drift = t * 26;
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.rotate(0.06 + t * 0.004);
  ctx.translate(-w / 2, -h / 2);
  const cell = h * 0.11;
  for (let gx = -3; gx < w / cell + 3; gx++) {
    for (let gy = -3; gy < h / cell + 3; gy++) {
      const x = gx * cell - (drift % cell);
      const y = gy * cell - (drift * 0.4 % cell);
      const r = hash2(seed + gx * 17 + Math.floor(drift / cell), gy * 29 + Math.floor(drift * 0.4 / cell));
      // block
      ctx.fillStyle = `rgba(${14 + r * 14 | 0},${16 + r * 16 | 0},${34 + r * 22 | 0},1)`;
      ctx.fillRect(x + 3, y + 3, cell - 6, cell - 6);
      // lit windows sprinkle
      for (let k = 0; k < 6; k++) {
        const rr = hash2(gx * 31 + k, gy * 13);
        if (rr > 0.5) continue;
        ctx.fillStyle = rr < 0.18 ? 'rgba(255,190,110,0.85)' : 'rgba(140,190,255,0.7)';
        const ws = 2.4 * (h / 1080);
        ctx.fillRect(x + 6 + rr * (cell - 14), y + 6 + hash2(gx + k, gy + 7) * (cell - 14), ws, ws);
      }
    }
  }
  // arterial roads with moving car lights
  for (let lane = 0; lane < 4; lane++) {
    const ly = ((lane * 0.27 + 0.1) * h + cell * 1.5) % h;
    ctx.fillStyle = 'rgba(30,32,48,1)';
    ctx.fillRect(0, ly, w, cell * 0.34);
    for (let c = 0; c < 14; c++) {
      const dir = lane % 2 === 0 ? 1 : -1;
      const cx2 = ((hash2(seed + lane, c) + t * (0.1 + hash2(lane, c) * 0.12) * dir + 10) % 1) * w;
      ctx.fillStyle = dir > 0 ? 'rgba(255,90,70,0.9)' : 'rgba(255,235,190,0.95)';
      ctx.shadowColor = ctx.fillStyle as string;
      ctx.shadowBlur = 8;
      ctx.fillRect(cx2, ly + cell * 0.08 + (lane % 2) * cell * 0.14, 7 * (h / 1080), 3.4 * (h / 1080));
      ctx.shadowBlur = 0;
    }
  }
  ctx.restore();
  // vignette-ish altitude haze
  const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85);
  vg.addColorStop(0, 'transparent');
  vg.addColorStop(1, 'rgba(2,3,8,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

// -------- taxi light trails (slow-motion source) --------
function drawTaxiLights(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  skyGradient(ctx, w, h, '#070812', '#10121f');
  // distant intersection glow
  const ig = ctx.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, w * 0.4);
  ig.addColorStop(0, 'rgba(255,170,90,0.2)');
  ig.addColorStop(1, 'transparent');
  ctx.fillStyle = ig;
  ctx.fillRect(0, 0, w, h);
  // road
  ctx.fillStyle = '#0b0d16';
  ctx.beginPath();
  ctx.moveTo(w * 0.42, h * 0.5);
  ctx.lineTo(w * 0.58, h * 0.5);
  ctx.lineTo(w * 1.1, h);
  ctx.lineTo(-w * 0.1, h);
  ctx.closePath();
  ctx.fill();
  // long-exposure style trails: many pass sweeps
  for (let i = 0; i < 22; i++) {
    const r = hash2(seed + i, 1);
    const side = r > 0.5 ? 1 : -1; // right = headlights (white), left = taillights (red)
    const phase = (t * (0.16 + r * 0.1) + hash2(seed + i, 3)) % 1.15;
    const p = phase; // 0 far → 1 near
    const x0 = w * 0.5 + side * w * 0.02;
    const y0 = h * 0.5;
    const x1 = w * 0.5 + side * (0.1 + r * 0.32) * w;
    const y1 = h * 1.02;
    const px = x0 + (x1 - x0) * p * p;
    const py = y0 + (y1 - y0) * p * p;
    const trail = 0.16 + r * 0.1;
    const tp = Math.max(0, p - trail);
    const tx0 = x0 + (x1 - x0) * tp * tp;
    const ty0 = y0 + (y1 - y0) * tp * tp;
    const col = side > 0 ? 'rgba(255,240,200,' : 'rgba(255,60,60,';
    const grad = ctx.createLinearGradient(tx0, ty0, px, py);
    grad.addColorStop(0, col + '0)');
    grad.addColorStop(1, col + (0.5 + p * 0.5) + ')');
    ctx.strokeStyle = grad;
    ctx.lineWidth = (2 + p * 13) * (h / 1080);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tx0, ty0);
    ctx.lineTo(px, py);
    ctx.stroke();
  }
  // taxi silhouette mid-frame with roof sign
  const bounceT = (t * 0.14) % 1.15;
  const bp = bounceT;
  const tx = w * 0.5 - (0.05 + 0.2 * bp * bp) * w;
  const ty = h * 0.5 + (h * 0.52) * bp * bp;
  const ts = 0.15 + bp * 0.9;
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(ts, ts);
  ctx.fillStyle = '#e8b820';
  ctx.beginPath();
  ctx.roundRect(-w * 0.1, -h * 0.055, w * 0.2, h * 0.055, 12);
  ctx.fill();
  ctx.fillStyle = '#1a1206';
  ctx.beginPath();
  ctx.roundRect(-w * 0.06, -h * 0.095, w * 0.12, h * 0.045, 8);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,120,60,0.95)';
  ctx.fillRect(-w * 0.016, -h * 0.115, w * 0.032, h * 0.018);
  ctx.fillStyle = 'rgba(255,60,60,0.95)';
  ctx.fillRect(-w * 0.095, -h * 0.02, w * 0.02, h * 0.012);
  ctx.fillRect(w * 0.075, -h * 0.02, w * 0.02, h * 0.012);
  ctx.restore();
  // buildings either side
  for (let s = -1; s <= 1; s += 2) {
    for (let i = 0; i < 5; i++) {
      const bw = w * 0.1, bh = h * (0.3 + hash2(seed + i, s) * 0.25);
      const bx = w * 0.5 + s * (w * 0.28 + i * w * 0.11) - bw / 2;
      ctx.fillStyle = '#0a0d1e';
      ctx.fillRect(bx, h * 0.52 - bh, bw, bh);
      windowGrid(ctx, bx, h * 0.52 - bh, bw, bh, 4, 9, seed + i * 3 + s, 0.4, 0.5);
    }
  }
}

// -------- narrow izakaya alley --------
function drawAlley(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, seed: number) {
  skyGradient(ctx, w, h, '#0a0612', '#160d1f');
  const cx = w / 2, vy = h * 0.4;
  // converging walls
  for (let s = -1; s <= 1; s += 2) {
    const grad = ctx.createLinearGradient(cx, 0, cx + s * w * 0.5, 0);
    grad.addColorStop(0, '#120a1c');
    grad.addColorStop(1, '#1f1330');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx + s * w * 0.04, vy);
    ctx.lineTo(cx + s * w * 0.55, 0);
    ctx.lineTo(cx + s * w * 0.55, h);
    ctx.lineTo(cx + s * w * 0.04, vy + h * 0.12);
    ctx.closePath();
    ctx.fill();
    // hanging lanterns receding
    for (let i = 0; i < 7; i++) {
      const p = i / 7;
      const lx = cx + s * (w * 0.05 + p * w * 0.42);
      const ly = vy - h * 0.02 + p * -h * 0.18 + Math.sin(t * 1.6 + i * 2 + s) * (3 + p * 6);
      const lr = (6 + p * 26) * (h / 1080) * 2;
      const warm = hash2(seed + i, s) > 0.3;
      const col = warm ? '#ff8434' : '#ff2d5e';
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = lr * 1.4;
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 3 + i);
      ctx.beginPath();
      ctx.ellipse(lx, ly, lr * 0.62, lr * 0.8, 0, 0, 7);
      ctx.fill();
      ctx.restore();
    }
  }
  // steam wisp
  ctx.globalAlpha = 0.06 + 0.03 * Math.sin(t);
  ctx.fillStyle = '#cfd6ff';
  for (let i = 0; i < 3; i++) {
    const sx = cx + Math.sin(t * 0.5 + i * 2) * w * 0.06;
    const sy = h * 0.6 - ((t * 0.05 + i * 0.33) % 1) * h * 0.4;
    ctx.beginPath();
    ctx.ellipse(sx, sy, w * 0.05, h * 0.05, 0, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  // ground
  ctx.fillStyle = '#0b0714';
  ctx.beginPath();
  ctx.moveTo(cx + w * 0.04, vy + h * 0.12);
  ctx.lineTo(cx + w * 0.55, h);
  ctx.lineTo(cx - w * 0.55, h);
  ctx.lineTo(cx - w * 0.04, vy + h * 0.12);
  ctx.closePath();
  ctx.fill();
}

// -------- SMPTE-ish bars fallback --------
function drawBars(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const cols = ['#c0c0c0', '#c0c000', '#00c0c0', '#00c000', '#c000c0', '#c00000', '#0000c0'];
  cols.forEach((c, i) => {
    ctx.fillStyle = c;
    ctx.fillRect((i / 7) * w, 0, w / 7 + 1, h * 0.75);
  });
  ctx.fillStyle = '#111';
  ctx.fillRect(0, h * 0.75, w, h * 0.25);
  // moving position marker instead of a timecode readout (no text in footage)
  ctx.fillStyle = '#fff';
  ctx.fillRect(((t % 4) / 4) * w, h * 0.84, w * 0.02, h * 0.08);
}
