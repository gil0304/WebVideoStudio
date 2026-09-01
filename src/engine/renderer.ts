// ============================================================
// Frame renderer — composites the sequence edit graph at time t.
// Program Monitor playback, thumbnails and Export all call this;
// there is no pre-rendered video anywhere.
// ============================================================

import type {
  MediaAsset, MaskShape, Sequence, TextLayer, TimelineClip, Track, VideoProject, Transition,
} from '../model/types';
import { clipSourceOut, getAsset, getSequence } from '../model/types';
import { evalNum, evalVec } from './keyframes';
import { CanvasPool, applyVideoEffects } from './effects';
import { MediaCache } from './sources';
import { drawProceduralFrame } from './procedural';

export interface RenderOpts {
  /** Processing resolution (playback quality). */
  width: number;
  height: number;
  pool: CanvasPool;
  media: MediaCache;
  /** Await frame-accurate media seeks (export). */
  exact?: boolean;
  drawCaptions?: boolean;
  /** Recursion guard for nested sequences. */
  depth?: number;
  /** Transparency grid instead of black. */
  transparencyGrid?: boolean;
}

// ---------------- transforms ----------------

export interface ClipTransform {
  x: number; y: number; scale: number; scaleW: number; rotation: number;
  anchorX: number; anchorY: number; opacity: number;
}

export function evalClipTransform(clip: TimelineClip, localTime: number): ClipTransform {
  const pos = evalVec(clip.position, localTime);
  const anchor = evalVec(clip.anchor, localTime);
  const scale = evalNum(clip.scale, localTime);
  const scaleW = clip.uniformScale ? scale : evalNum(clip.scaleWidth, localTime);
  return {
    x: pos[0], y: pos[1],
    scale, scaleW,
    rotation: evalNum(clip.rotation, localTime),
    anchorX: anchor[0] ?? 0, anchorY: anchor[1] ?? 0,
    opacity: evalNum(clip.opacity, localTime),
  };
}

/** Source time (asset seconds) for a sequence time inside the clip. */
export function clipSourceTime(clip: TimelineClip, seqTime: number): number {
  const local = seqTime - clip.start;
  if (clip.speed === 0) return clip.inPoint; // freeze frame
  if (clip.reversed) return Math.max(0, clipSourceOut(clip) - local * Math.abs(clip.speed));
  return clip.inPoint + local * clip.speed;
}

// ---------------- text ----------------

export function layerFont(layer: TextLayer): string {
  return `${layer.fontStyle === 'italic' ? 'italic ' : ''}${layer.fontWeight} ${layer.fontSize}px ${layer.fontFamily}`;
}

export function measureTextLayer(layer: TextLayer): { w: number; h: number; lines: string[] } {
  const canvas = measureCanvas ?? (measureCanvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d')!;
  ctx.font = layerFont(layer);
  const prevSpacing = (ctx as CanvasRenderingContext2D & { letterSpacing?: string });
  if ('letterSpacing' in ctx) prevSpacing.letterSpacing = `${layer.letterSpacing}px`;
  const lines = (layer.text ?? '').split('\n');
  let w = 0;
  for (const line of lines) w = Math.max(w, ctx.measureText(line).width);
  const h = lines.length * layer.fontSize * layer.lineHeight;
  return { w, h, lines };
}
let measureCanvas: HTMLCanvasElement | null = null;

/** Bounds in sequence pixels (for Program Monitor hit-testing / gizmos). */
export function getTextLayerBounds(layer: TextLayer): { x: number; y: number; w: number; h: number } {
  if (layer.kind !== 'text') {
    return { x: layer.x - layer.width / 2, y: layer.y - layer.height / 2, w: layer.width, h: layer.height };
  }
  const m = measureTextLayer(layer);
  const pad = layer.bgEnabled ? layer.bgPadding : 0;
  return { x: layer.x - m.w / 2 - pad, y: layer.y - m.h / 2 - pad, w: m.w + pad * 2, h: m.h + pad * 2 };
}

export function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer, scale: number): void {
  if (!layer.visible) return;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.globalAlpha *= layer.opacity / 100;
  if (layer.kind === 'text') {
    const m = measureTextLayer(layer);
    ctx.font = layerFont(layer);
    if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${layer.letterSpacing}px`;
    ctx.textBaseline = 'middle';
    const lineH = layer.fontSize * layer.lineHeight;
    const totalH = m.lines.length * lineH;
    if (layer.bgEnabled) {
      ctx.fillStyle = layer.bgColor;
      const p = layer.bgPadding;
      ctx.beginPath();
      ctx.roundRect(layer.x - m.w / 2 - p, layer.y - totalH / 2 - p, m.w + p * 2, totalH + p * 2, 4);
      ctx.fill();
    }
    if (layer.shadow) {
      ctx.shadowColor = layer.shadowColor;
      ctx.shadowBlur = layer.shadowBlur;
      ctx.shadowOffsetX = layer.shadowOffsetX;
      ctx.shadowOffsetY = layer.shadowOffsetY;
    }
    m.lines.forEach((line, i) => {
      const ly = layer.y - totalH / 2 + lineH * (i + 0.5);
      let lx = layer.x;
      ctx.textAlign = 'center';
      if (layer.align === 'left') { ctx.textAlign = 'left'; lx = layer.x - m.w / 2; }
      if (layer.align === 'right') { ctx.textAlign = 'right'; lx = layer.x + m.w / 2; }
      if (layer.strokeWidth > 0) {
        ctx.strokeStyle = layer.strokeColor;
        ctx.lineWidth = layer.strokeWidth;
        ctx.lineJoin = 'round';
        ctx.strokeText(line, lx, ly);
      }
      ctx.fillStyle = layer.fill;
      ctx.fillText(line, lx, ly);
    });
  } else {
    if (layer.shadow) {
      ctx.shadowColor = layer.shadowColor;
      ctx.shadowBlur = layer.shadowBlur;
      ctx.shadowOffsetX = layer.shadowOffsetX;
      ctx.shadowOffsetY = layer.shadowOffsetY;
    }
    ctx.fillStyle = layer.fill;
    ctx.strokeStyle = layer.strokeColor;
    ctx.lineWidth = layer.strokeWidth;
    const x = layer.x - layer.width / 2, y = layer.y - layer.height / 2;
    if (layer.kind === 'rect') {
      ctx.fillRect(x, y, layer.width, layer.height);
      if (layer.strokeWidth > 0) ctx.strokeRect(x, y, layer.width, layer.height);
    } else if (layer.kind === 'ellipse') {
      ctx.beginPath();
      ctx.ellipse(layer.x, layer.y, layer.width / 2, layer.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (layer.strokeWidth > 0) ctx.stroke();
    } else if (layer.kind === 'line') {
      ctx.beginPath();
      ctx.moveTo(x, layer.y);
      ctx.lineTo(x + layer.width, layer.y);
      ctx.lineWidth = Math.max(1, layer.height);
      ctx.strokeStyle = layer.fill;
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ---------------- masks ----------------

function applyMasks(canvas: HTMLCanvasElement, masks: MaskShape[], localTime: number, pool: CanvasPool, scale: number): void {
  const active = masks.filter(() => true);
  if (active.length === 0) return;
  const w = canvas.width, h = canvas.height;
  const maskCanvas = pool.acquire(w, h);
  const mctx = maskCanvas.getContext('2d')!;
  let anyNormal = false;
  for (const m of active) {
    if (!m.inverted) anyNormal = true;
  }
  // start from black (transparent) if any normal mask, else white
  if (!anyNormal) {
    mctx.fillStyle = '#fff';
    mctx.fillRect(0, 0, w, h);
  }
  for (const m of active) {
    const cx = evalNum(m.cx, localTime) * w;
    const cy = evalNum(m.cy, localTime) * h;
    const rx = evalNum(m.rx, localTime) * w;
    const ry = evalNum(m.ry, localTime) * h;
    const feather = evalNum(m.feather, localTime) * scale;
    const op = evalNum(m.opacity, localTime) / 100;
    mctx.save();
    if (feather > 0.5) mctx.filter = `blur(${feather}px)`;
    if (m.inverted) {
      mctx.globalCompositeOperation = 'destination-out';
      mctx.fillStyle = `rgba(255,255,255,${op})`;
    } else {
      mctx.globalCompositeOperation = 'source-over';
      mctx.fillStyle = `rgba(255,255,255,${op})`;
    }
    mctx.beginPath();
    if (m.type === 'rectangle') mctx.rect(cx - rx, cy - ry, rx * 2, ry * 2);
    else mctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    mctx.fill();
    mctx.restore();
  }
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(maskCanvas, 0, 0);
  ctx.restore();
  pool.release(maskCanvas);
}

// ---------------- clip rendering ----------------

async function drawSourceFrame(
  ctx: CanvasRenderingContext2D, project: VideoProject, asset: MediaAsset, sourceTime: number,
  procW: number, procH: number, seqW: number, seqH: number, opts: RenderOpts,
): Promise<void> {
  const s = procW / seqW;
  if (asset.procedural && asset.type !== 'audio') {
    drawProceduralFrame(ctx, asset.procedural, procW, procH, sourceTime, asset.seed ?? 0);
    return;
  }
  if (asset.type === 'sequence' && asset.sequenceId && (opts.depth ?? 0) < 4) {
    const nested = getSequence(project, asset.sequenceId);
    if (nested) {
      await renderSequenceFrame(ctx, project, nested, sourceTime, {
        ...opts, width: procW, height: procH, depth: (opts.depth ?? 0) + 1, drawCaptions: false,
      });
    }
    return;
  }
  if (asset.type === 'video' && asset.fileId) {
    const nw = (asset.width ?? seqW) * s, nh = (asset.height ?? seqH) * s;
    const x = (procW - nw) / 2, y = (procH - nh) / 2;
    if (opts.exact) await opts.media.drawVideoExact(ctx, asset, sourceTime, x, y, nw, nh);
    else opts.media.drawVideoRealtime(ctx, asset, sourceTime, x, y, nw, nh);
    return;
  }
  if (asset.type === 'image') {
    const bmp = opts.exact ? await opts.media.getImageAsync(asset) : opts.media.getImage(asset);
    if (bmp) {
      const nw = bmp.width * s, nh = bmp.height * s;
      ctx.drawImage(bmp, (procW - nw) / 2, (procH - nh) / 2, nw, nh);
    }
    return;
  }
  // graphic assets draw nothing here (textLayers handled by caller)
}

/**
 * Render one clip into a full-frame canvas at processing resolution,
 * with source → effects → masks → motion applied. Opacity is applied here;
 * blend mode is applied by the caller when compositing.
 */
async function renderClipComposite(
  project: VideoProject, seq: Sequence, clip: TimelineClip, seqTime: number, opts: RenderOpts,
): Promise<HTMLCanvasElement> {
  const { width: procW, height: procH, pool } = opts;
  const s = procW / seq.width;
  const localTime = seqTime - clip.start;
  const asset = getAsset(project, clip.assetId);
  const frame = pool.acquire(procW, procH);
  const fctx = frame.getContext('2d')!;

  // 1. source frame
  let scratch = pool.acquire(procW, procH);
  const sctx = scratch.getContext('2d')!;
  if (asset) {
    const st = clipSourceTime(clip, seqTime);
    await drawSourceFrame(sctx, project, asset, st, procW, procH, seq.width, seq.height, opts);
  }
  // graphic text layers
  if (clip.textLayers && clip.textLayers.length > 0) {
    for (const layer of clip.textLayers) drawTextLayer(sctx, layer, s);
  }

  // 2. effects
  scratch = applyVideoEffects(scratch, clip.effects, localTime, pool, seqTime);

  // 3. masks
  if (clip.masks.length > 0) applyMasks(scratch, clip.masks, localTime, pool, s);

  // 4. motion + opacity
  const t = evalClipTransform(clip, localTime);
  fctx.save();
  fctx.globalAlpha = Math.max(0, Math.min(1, t.opacity / 100));
  fctx.translate(t.x * s, t.y * s);
  fctx.rotate((t.rotation * Math.PI) / 180);
  fctx.scale(t.scaleW / 100, t.scale / 100);
  fctx.translate(-t.anchorX * s, -t.anchorY * s);
  fctx.drawImage(scratch, -procW / 2, -procH / 2);
  fctx.restore();
  pool.release(scratch);
  return frame;
}

// ---------------- transitions ----------------

function transitionWindow(tr: Transition, cutTime: number): { from: number; to: number } {
  switch (tr.alignment) {
    case 'start': return { from: cutTime, to: cutTime + tr.duration };
    case 'end': return { from: cutTime - tr.duration, to: cutTime };
    default: return { from: cutTime - tr.duration / 2, to: cutTime + tr.duration / 2 };
  }
}

function blendTransition(
  type: string, p: number, a: HTMLCanvasElement | null, b: HTMLCanvasElement | null,
  pool: CanvasPool, w: number, h: number,
): HTMLCanvasElement {
  const out = pool.acquire(w, h);
  const ctx = out.getContext('2d')!;
  const ease = p * p * (3 - 2 * p);
  switch (type) {
    case 'dip-to-black':
    case 'dip-to-white': {
      const col = type === 'dip-to-black' ? '#000' : '#fff';
      if (p < 0.5) {
        if (a) ctx.drawImage(a, 0, 0);
        ctx.fillStyle = col;
        ctx.globalAlpha = p * 2;
        ctx.fillRect(0, 0, w, h);
      } else {
        if (b) ctx.drawImage(b, 0, 0);
        ctx.fillStyle = col;
        ctx.globalAlpha = (1 - p) * 2;
        ctx.fillRect(0, 0, w, h);
      }
      break;
    }
    case 'wipe': {
      if (a) ctx.drawImage(a, 0, 0);
      if (b) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, w * ease, h);
        ctx.clip();
        ctx.drawImage(b, 0, 0);
        ctx.restore();
      }
      break;
    }
    case 'push': {
      if (a) ctx.drawImage(a, w * ease, 0);
      if (b) ctx.drawImage(b, -w * (1 - ease), 0);
      break;
    }
    case 'slide': {
      if (a) ctx.drawImage(a, 0, 0);
      if (b) ctx.drawImage(b, -w * (1 - ease), 0);
      break;
    }
    case 'zoom': {
      if (a) ctx.drawImage(a, 0, 0);
      if (b) {
        ctx.save();
        ctx.globalAlpha = ease;
        const z = 0.4 + 0.6 * ease;
        ctx.translate(w / 2, h / 2);
        ctx.scale(z, z);
        ctx.drawImage(b, -w / 2, -h / 2);
        ctx.restore();
      }
      break;
    }
    case 'iris': {
      if (a) ctx.drawImage(a, 0, 0);
      if (b) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.hypot(w, h) * 0.5 * ease, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(b, 0, 0);
        ctx.restore();
      }
      break;
    }
    case 'blur-dissolve': {
      const blurAmt = Math.sin(p * Math.PI) * 14;
      if (a) {
        ctx.filter = `blur(${blurAmt.toFixed(1)}px)`;
        ctx.globalAlpha = 1 - ease;
        ctx.drawImage(a, 0, 0);
      }
      if (b) {
        ctx.filter = `blur(${blurAmt.toFixed(1)}px)`;
        ctx.globalAlpha = ease;
        ctx.drawImage(b, 0, 0);
      }
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      break;
    }
    default: { // cross-dissolve
      if (a) {
        ctx.globalAlpha = 1 - ease;
        ctx.drawImage(a, 0, 0);
      }
      if (b) {
        ctx.globalAlpha = ease;
        ctx.drawImage(b, 0, 0);
      }
      ctx.globalAlpha = 1;
      break;
    }
  }
  return out;
}

// ---------------- track / sequence compositing ----------------

interface ActiveTransition {
  tr: Transition;
  from: number;
  to: number;
  outgoing: TimelineClip | null;
  incoming: TimelineClip | null;
}

function findActiveTransition(track: Track, time: number): ActiveTransition | null {
  const clips = track.clips;
  for (let i = 0; i < clips.length; i++) {
    const c = clips[i];
    const prev = i > 0 && Math.abs(clips[i - 1].end - c.start) < 0.002 ? clips[i - 1] : null;
    if (c.transitionIn) {
      const w = transitionWindow(c.transitionIn, c.start);
      if (time >= w.from && time < w.to) return { tr: c.transitionIn, ...w, outgoing: prev, incoming: c };
    }
    const next = i < clips.length - 1 && Math.abs(clips[i + 1].start - c.end) < 0.002 ? clips[i + 1] : null;
    if (c.transitionOut && !(next && next.transitionIn)) {
      const w = transitionWindow(c.transitionOut, c.end);
      if (time >= w.from && time < w.to) return { tr: c.transitionOut, ...w, outgoing: c, incoming: next };
    }
  }
  return null;
}

const checkerCache = new Map<string, CanvasPattern | null>();

export async function renderSequenceFrame(
  target: CanvasRenderingContext2D, project: VideoProject, seq: Sequence, time: number, opts: RenderOpts,
): Promise<void> {
  const { width: procW, height: procH, pool } = opts;
  const comp = pool.acquire(procW, procH);
  let compCanvas = comp;
  const cctx = () => compCanvas.getContext('2d')!;

  // V1 upward
  for (const track of seq.videoTracks) {
    if (!track.enabled) continue;
    const active = findActiveTransition(track, time);
    let frame: HTMLCanvasElement | null = null;
    let blend: string = 'normal';

    if (active) {
      const p = Math.max(0, Math.min(1, (time - active.from) / (active.to - active.from)));
      const aC = active.outgoing && active.outgoing.enabled
        ? await renderClipComposite(project, seq, active.outgoing, time, opts) : null;
      const bC = active.incoming && active.incoming.enabled
        ? await renderClipComposite(project, seq, active.incoming, time, opts) : null;
      frame = blendTransition(active.tr.type, p, aC, bC, pool, procW, procH);
      if (aC) pool.release(aC);
      if (bC) pool.release(bC);
      blend = active.incoming?.blendMode ?? active.outgoing?.blendMode ?? 'normal';
    } else {
      const clip = track.clips.find((c) => time >= c.start && time < c.end);
      if (!clip || !clip.enabled) continue;
      const asset = getAsset(project, clip.assetId);
      if (asset?.type === 'adjustment') {
        // apply adjustment effects to everything composited so far
        const localTime = time - clip.start;
        const op = evalNum(clip.opacity, localTime) / 100;
        if (clip.effects.length > 0 && op > 0.001) {
          const before = pool.acquire(procW, procH);
          before.getContext('2d')!.drawImage(compCanvas, 0, 0);
          let processed = pool.acquire(procW, procH);
          processed.getContext('2d')!.drawImage(compCanvas, 0, 0);
          processed = applyVideoEffects(processed, clip.effects, localTime, pool, time);
          if (clip.masks.length > 0) applyMasks(processed, clip.masks, localTime, pool, procW / seq.width);
          const bctx = before.getContext('2d')!;
          bctx.globalAlpha = op;
          bctx.drawImage(processed, 0, 0);
          bctx.globalAlpha = 1;
          const c2 = cctx();
          c2.clearRect(0, 0, procW, procH);
          c2.drawImage(before, 0, 0);
          pool.release(before);
          pool.release(processed);
        }
        continue;
      }
      frame = await renderClipComposite(project, seq, clip, time, opts);
      blend = clip.blendMode;
    }

    if (frame) {
      const c2 = cctx();
      c2.save();
      c2.globalCompositeOperation = blend === 'normal' ? 'source-over' : (blend as GlobalCompositeOperation);
      c2.drawImage(frame, 0, 0);
      c2.restore();
      pool.release(frame);
    }
  }

  // captions
  if (opts.drawCaptions !== false && seq.captionsVisible) {
    const cap = seq.captions.find((c) => time >= c.start && time < c.end);
    if (cap) drawCaption(cctx(), cap.text, seq, procW, procH);
  }

  // blit to target (letterbox if aspect differs)
  const tw = target.canvas.width, th = target.canvas.height;
  if (opts.transparencyGrid) {
    let pattern = checkerCache.get('grid') ?? null;
    if (!checkerCache.has('grid')) {
      const pc = document.createElement('canvas');
      pc.width = pc.height = 16;
      const pctx = pc.getContext('2d')!;
      pctx.fillStyle = '#2a2a2a';
      pctx.fillRect(0, 0, 16, 16);
      pctx.fillStyle = '#3a3a3a';
      pctx.fillRect(0, 0, 8, 8);
      pctx.fillRect(8, 8, 8, 8);
      pattern = target.createPattern(pc, 'repeat');
      checkerCache.set('grid', pattern);
    }
    target.fillStyle = pattern ?? '#000';
  } else {
    target.fillStyle = '#000';
  }
  target.fillRect(0, 0, tw, th);
  const scale = Math.min(tw / seq.width, th / seq.height);
  const dw = seq.width * scale, dh = seq.height * scale;
  target.imageSmoothingQuality = 'high';
  target.drawImage(compCanvas, (tw - dw) / 2, (th - dh) / 2, dw, dh);
  pool.release(compCanvas);
}

export function drawCaption(ctx: CanvasRenderingContext2D, text: string, seq: Sequence, procW: number, procH: number): void {
  const st = seq.captionStyle;
  const s = procH / seq.height;
  const fontSize = st.fontSize * s;
  ctx.save();
  ctx.font = `600 ${fontSize}px ${st.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = text.split('\n');
  const lineH = fontSize * 1.35;
  const baseY = st.position === 'bottom' ? procH * 0.92 - (lines.length - 1) * lineH : procH * 0.08;
  lines.forEach((line, i) => {
    const y = baseY + i * lineH;
    const w = ctx.measureText(line).width;
    if (st.bgOpacity > 0.01) {
      ctx.fillStyle = st.bgColor;
      ctx.globalAlpha = st.bgOpacity;
      ctx.fillRect(procW / 2 - w / 2 - fontSize * 0.4, y - lineH / 2, w + fontSize * 0.8, lineH);
      ctx.globalAlpha = 1;
    }
    if (st.edge === 'shadow') {
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = fontSize * 0.15;
      ctx.shadowOffsetY = fontSize * 0.06;
    } else if (st.edge === 'outline') {
      ctx.strokeStyle = '#000';
      ctx.lineWidth = fontSize * 0.12;
      ctx.lineJoin = 'round';
      ctx.strokeText(line, procW / 2, y);
    }
    ctx.fillStyle = st.color;
    ctx.fillText(line, procW / 2, y);
  });
  ctx.restore();
}

// ---------------- thumbnails ----------------

const thumbCache = new Map<string, HTMLCanvasElement>();

/** Small deterministic thumbnail for project panel / timeline clips. */
export function getAssetThumbnail(_project: VideoProject, asset: MediaAsset, sourceTime: number, w = 80, h = 45, media?: MediaCache): HTMLCanvasElement | null {
  const key = `${asset.id}:${Math.round(sourceTime * 2)}:${w}`;
  const hit = thumbCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  if (asset.procedural && asset.type !== 'audio') {
    drawProceduralFrame(ctx, asset.procedural, w, h, sourceTime, asset.seed ?? 0);
  } else if (asset.type === 'video' && asset.fileId && media) {
    const ok = media.drawVideoRealtime(ctx, asset, sourceTime, 0, 0, w, h);
    if (!ok) return null; // not ready yet — don't cache
  } else if (asset.type === 'image' && media) {
    const bmp = media.getImage(asset);
    if (!bmp) return null;
    ctx.drawImage(bmp, 0, 0, w, h);
  } else if (asset.type === 'sequence') {
    ctx.fillStyle = '#1c3242';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#7fd0f0';
    ctx.font = `${h * 0.5}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⧉', w / 2, h / 2);
  } else {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);
  }
  if (thumbCache.size > 600) thumbCache.clear();
  thumbCache.set(key, c);
  return c;
}
