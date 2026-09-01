// ============================================================
// Timeline clip — memoized absolutely-positioned block with
// label strip, name, fx badge, thumbnails (video), waveform +
// volume envelope (audio) and transition ribbons.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import type { MediaAsset, TimelineClip, Transition } from '../../../model/types';
import { LABEL_COLORS } from '../../../model/types';
import { audioEngine } from '../../../engine/audioEngine';
import { evalNum } from '../../../engine/keyframes';
import { getAssetThumbnail, clipSourceTime } from '../../../engine/renderer';
import { sharedMedia } from '../../../engine/playback';
import { useStudio } from '../../../state/store';
import { clipFillColor, prettyTransitionName } from './utils';

const NAME_ROW_H = 14;
const STRIP_H = 3;

interface ClipViewProps {
  clip: TimelineClip;
  asset: MediaAsset | undefined;
  trackType: 'video' | 'audio';
  trackHeight: number;
  zoom: number;
  selected: boolean;
}

function speedSuffix(clip: TimelineClip): string {
  if (clip.speed === 0 || clip.speed === 1) return '';
  const v = Math.round(Math.abs(clip.speed) * 100) / 100;
  return ` ×${clip.reversed || clip.speed < 0 ? '-' : ''}${v}`;
}

// ---------------- audio waveform ----------------

function WaveformCanvas({ clip, asset, width, height }: {
  clip: TimelineClip; asset: MediaAsset; width: number; height: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || width < 2 || height < 2) return;
    const peaks = audioEngine.waveform(asset);
    if (!peaks) {
      // buffer still decoding — retry shortly
      const timer = window.setTimeout(() => setTick((t) => t + 1), 400);
      return () => window.clearTimeout(timer);
    }
    const W = Math.max(2, Math.min(2048, Math.round(width)));
    const H = Math.max(2, Math.round(height));
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const dur = clip.end - clip.start;
    const speed = Math.abs(clip.speed) || 0;
    const srcSpan = clip.speed === 0 ? 0 : dur * speed;
    const bps = peaks.buckets / Math.max(peaks.duration, 1e-6);
    const mid = H / 2;
    const half = (H / 2) - 1;
    ctx.fillStyle = 'rgba(215, 240, 222, 0.55)';
    for (let x = 0; x < W; x++) {
      const frac = x / W;
      let srcT = clip.speed === 0
        ? clip.inPoint
        : (clip.reversed ? clip.inPoint + srcSpan - frac * srcSpan : clip.inPoint + frac * srcSpan);
      if (srcT < 0) srcT = 0;
      const b = Math.min(peaks.buckets - 1, Math.floor(srcT * bps));
      if (b < 0) continue;
      const mn = peaks.peaks[b * 2];
      const mx = peaks.peaks[b * 2 + 1];
      const y0 = mid + mn * half;
      const y1 = mid + mx * half;
      ctx.fillRect(x, Math.min(y0, y1), 1, Math.max(1, Math.abs(y1 - y0)));
    }
    // volume envelope: dB -60..+6 mapped to full height
    ctx.strokeStyle = '#e8d44d';
    ctx.lineWidth = 1;
    ctx.beginPath();
    const stepPx = 3;
    for (let x = 0; x <= W; x += stepPx) {
      const localT = (x / W) * dur;
      const db = Math.max(-60, Math.min(6, evalNum(clip.volume, localT)));
      const y = H * (1 - (db + 60) / 66);
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }, [clip, asset, width, height, tick]);

  return (
    <canvas
      ref={ref}
      style={{ position: 'absolute', left: 0, right: 0, top: STRIP_H + NAME_ROW_H, width: '100%', height, pointerEvents: 'none' }}
    />
  );
}

// ---------------- video thumbnails ----------------

function ThumbStrip({ clip, asset, height }: { clip: TimelineClip; asset: MediaAsset; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || height < 8) return;
    const w = Math.max(16, Math.round(height * 16 / 9));
    const project = useStudio.getState().project;
    const thumb = getAssetThumbnail(project, asset, clipSourceTime(clip, clip.start), w, height, sharedMedia);
    if (!thumb) {
      const timer = window.setTimeout(() => setTick((t) => t + 1), 400);
      return () => window.clearTimeout(timer);
    }
    canvas.width = w;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(thumb, 0, 0, w, height);
  }, [clip, asset, height, tick]);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute', left: 0, top: STRIP_H + NAME_ROW_H, height,
        pointerEvents: 'none', opacity: 0.9,
      }}
    />
  );
}

// ---------------- transition ribbon ----------------

function TransitionRibbon({ clipId, edge, tr, zoom, clipWidth }: {
  clipId: string; edge: 'in' | 'out'; tr: Transition; zoom: number; clipWidth: number;
}) {
  const w = Math.min(Math.max(6, tr.duration * zoom), clipWidth);
  return (
    <div
      data-transition-edge={edge}
      data-clip-id={clipId}
      title={`${prettyTransitionName(tr.type)}(${tr.duration.toFixed(2)}秒)`}
      style={{
        position: 'absolute', top: STRIP_H, height: 12, width: w,
        [edge === 'in' ? 'left' : 'right']: 0,
        background: 'rgba(230,230,240,0.28)',
        border: '1px solid rgba(255,255,255,0.45)',
        borderRadius: 2,
        fontSize: 8, lineHeight: '10px', color: '#fff',
        padding: '0 2px', overflow: 'hidden', whiteSpace: 'nowrap',
        zIndex: 3, cursor: 'context-menu',
      } as React.CSSProperties}
    >
      {w > 34 ? prettyTransitionName(tr.type) : ''}
    </div>
  );
}

// ---------------- clip ----------------

function ClipViewInner({ clip, asset, trackType, trackHeight, zoom, selected }: ClipViewProps) {
  const left = clip.start * zoom;
  const width = Math.max(2, (clip.end - clip.start) * zoom);
  const fill = clipFillColor(asset?.type, trackType);
  const labelHex = LABEL_COLORS[clip.label] ?? '#888';
  const showThumb = trackType === 'video' && trackHeight >= 48 && !!asset
    && (asset.type === 'video' || asset.type === 'image' || asset.type === 'sequence' || !!asset.procedural);
  const showWave = trackType === 'audio' && !!asset && trackHeight >= 30
    && (asset.type === 'audio' || asset.hasAudio);
  const contentH = Math.max(0, trackHeight - STRIP_H - NAME_ROW_H - 2);

  return (
    <div
      data-clip-id={clip.id}
      style={{
        position: 'absolute',
        left,
        width,
        top: 0,
        height: trackHeight,
        background: selected
          ? `linear-gradient(rgba(255,255,255,0.16), rgba(255,255,255,0.16)), ${cssVarFallback(fill)}`
          : cssVarFallback(fill),
        backgroundColor: undefined,
        borderRadius: 2,
        boxShadow: selected
          ? 'inset 0 0 0 1px var(--selection-clip)'
          : 'inset 0 0 0 1px rgba(0,0,0,0.45)',
        opacity: clip.enabled ? 1 : 0.45,
        filter: clip.enabled ? undefined : 'saturate(0.25)',
        overflow: 'hidden',
        boxSizing: 'border-box',
        contain: 'strict',
      }}
    >
      {/* label color strip */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: STRIP_H, background: labelHex, pointerEvents: 'none' }} />
      {/* name row */}
      <div style={{
        position: 'absolute', left: 0, right: 0, top: STRIP_H, height: NAME_ROW_H,
        display: 'flex', alignItems: 'center', gap: 3, padding: '0 4px',
        fontSize: 10.5, lineHeight: `${NAME_ROW_H}px`, color: 'rgba(255,255,255,0.92)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        pointerEvents: 'none', textShadow: '0 1px 1px rgba(0,0,0,0.5)',
      }}>
        {clip.effects.length > 0 && (
          <span style={{
            flex: 'none', width: 11, height: 11, borderRadius: '50%',
            background: 'rgba(20,20,20,0.55)', border: '1px solid rgba(255,255,255,0.6)',
            fontSize: 6.5, lineHeight: '11px', textAlign: 'center', fontStyle: 'italic',
          }}>fx</span>
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {clip.name}{speedSuffix(clip)}
        </span>
      </div>
      {showThumb && asset && <ThumbStrip clip={clip} asset={asset} height={contentH} />}
      {showWave && asset && <WaveformCanvas clip={clip} asset={asset} width={width} height={contentH} />}
      {clip.transitionIn && (
        <TransitionRibbon clipId={clip.id} edge="in" tr={clip.transitionIn} zoom={zoom} clipWidth={width} />
      )}
      {clip.transitionOut && (
        <TransitionRibbon clipId={clip.id} edge="out" tr={clip.transitionOut} zoom={zoom} clipWidth={width} />
      )}
    </div>
  );
}

/** Wrap a `var(--x)` reference so it can be used inside a background shorthand. */
function cssVarFallback(v: string): string {
  return v;
}

export const ClipView = React.memo(ClipViewInner);
