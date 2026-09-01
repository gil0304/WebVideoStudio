// ============================================================
// Project panel — shared helpers: type icons, asset thumbnail
// canvas, codec labels. Asset type display names live in
// ASSET_TYPE_NAMES_JA (src/model/types).
// ============================================================

import React, { useEffect, useRef } from 'react';
import type { MediaAsset, VideoProject } from '../../../model/types';
import { getAssetThumbnail } from '../../../engine/renderer';
import { sharedMedia } from '../../../engine/playback';

/** Assets that render a real picture thumbnail (everything getAssetThumbnail can draw). */
export const hasThumb = (a: MediaAsset): boolean =>
  a.type !== 'audio' && (!!a.procedural || a.type === 'video' || a.type === 'image' || a.type === 'sequence');

/** Hover-scrub only makes sense for time-varying visual sources. */
export const isScrubbable = (a: MediaAsset): boolean =>
  hasThumb(a) && (a.type === 'video' || a.type === 'sequence');

export const cmpName = (a: { name: string }, b: { name: string }): number =>
  a.name.localeCompare(b.name, 'ja');

export const codecOf = (a: MediaAsset): string => {
  if (a.codec) return a.codec.replace(/^(video|audio|image)\//, '');
  if (a.procedural) return '合成';
  if (a.type === 'sequence') return '—';
  return '—';
};

export type IconKind = MediaAsset['type'] | 'bin';

/** Small monochrome type icon (SVG, decorative). */
export function TypeIcon({ kind, size = 13 }: { kind: IconKind; size?: number }) {
  const c = 'var(--text-dim)';
  const s: React.CSSProperties = { width: size, height: size, flex: 'none', display: 'block' };
  switch (kind) {
    case 'bin':
      return (
        <svg style={s} viewBox="0 0 16 16">
          <path fill="#c9a45c" d="M1 3.5C1 2.7 1.7 2 2.5 2h3.2l1.4 1.8h6.4c.8 0 1.5.7 1.5 1.5v7.2c0 .8-.7 1.5-1.5 1.5h-11C1.7 14 1 13.3 1 12.5v-9z" />
        </svg>
      );
    case 'video':
      return (
        <svg style={s} viewBox="0 0 16 16">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke={c} />
          <path d="M4.5 2.5v11M11.5 2.5v11M1.5 5.5h3M1.5 8h3M1.5 10.5h3M11.5 5.5h3M11.5 8h3M11.5 10.5h3" stroke={c} strokeWidth="1" fill="none" />
        </svg>
      );
    case 'audio':
      return (
        <svg style={s} viewBox="0 0 16 16">
          <path fill={c} d="M12.5 1.5 5.5 3v7.1a2.4 2.4 0 1 0 1 1.95V6.3l5-1.1v3.9a2.4 2.4 0 1 0 1 1.95V1.5z" />
        </svg>
      );
    case 'image':
      return (
        <svg style={s} viewBox="0 0 16 16">
          <rect x="1.5" y="2.5" width="13" height="11" rx="1" fill="none" stroke={c} />
          <circle cx="5.2" cy="6" r="1.3" fill={c} />
          <path d="M2.5 12.5 6.5 8l3 3 2-2 2 3.5z" fill={c} />
        </svg>
      );
    case 'sequence':
      return (
        <svg style={s} viewBox="0 0 16 16">
          <rect x="1.5" y="4.5" width="10" height="8" rx="1" fill="none" stroke={c} />
          <path d="M4.5 2.5h10v8" fill="none" stroke={c} />
        </svg>
      );
    case 'graphic':
      return (
        <svg style={s} viewBox="0 0 16 16">
          <path d="M3 3h10M8 3v10" stroke={c} strokeWidth="1.6" fill="none" />
        </svg>
      );
    case 'adjustment':
      return (
        <svg style={s} viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="5.5" fill="none" stroke={c} />
          <path d="M8 2.5a5.5 5.5 0 0 1 0 11z" fill={c} />
        </svg>
      );
    default:
      return null;
  }
}

/**
 * Thumbnail canvas for an asset. Retries while the media decoder warms up
 * (getAssetThumbnail returns null until frames are available).
 */
export function AssetThumb({ project, asset, time, w, h, style }: {
  project: VideoProject;
  asset: MediaAsset;
  time: number;
  w: number;
  h: number;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    let alive = true;
    let tries = 0;
    let timer = 0;
    const draw = () => {
      if (!alive) return;
      const cv = ref.current;
      const ctx = cv?.getContext('2d');
      if (!cv || !ctx) return;
      const src = getAssetThumbnail(project, asset, time, w, h, sharedMedia);
      if (src) {
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(src, 0, 0);
      } else if (tries++ < 12) {
        timer = window.setTimeout(draw, 250);
      }
    };
    draw();
    return () => { alive = false; window.clearTimeout(timer); };
  }, [project, asset, time, w, h]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ background: '#111', borderRadius: 2, flex: 'none', ...style }}
    />
  );
}

/** 16px label color chip shown next to every asset. */
export function LabelChip({ color }: { color: string }) {
  return (
    <span
      style={{
        width: 16, height: 9, borderRadius: 2, background: color,
        flex: 'none', display: 'inline-block',
      }}
    />
  );
}
