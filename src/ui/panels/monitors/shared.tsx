// ============================================================
// Shared building blocks for Source / Program monitors:
// letterbox fitting math and the mini scrub bar with in/out
// range band + draggable playhead / in / out markers.
// ============================================================

import React, { useRef } from 'react';
import { snapToFrame } from '../../../engine/timecode';

export interface Rect { x: number; y: number; w: number; h: number }

/** Fit a src rect into dst, centered (letterbox/pillarbox). */
export function fitRect(srcW: number, srcH: number, dstW: number, dstH: number): Rect {
  const s = Math.min(dstW / Math.max(1, srcW), dstH / Math.max(1, srcH));
  const w = srcW * s;
  const h = srcH * s;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

interface ScrubBarProps {
  duration: number;
  time: number;
  inPoint: number | null;
  outPoint: number | null;
  fps: number;
  /** phase: 'start' on pointer-down, 'move' while dragging, 'end' on release. */
  onScrub: (t: number, phase: 'start' | 'move' | 'end') => void;
  onSetIn?: (t: number) => void;
  onSetOut?: (t: number) => void;
}

/** Mini scrub bar: click/drag playhead, drag the in/out markers. */
export function ScrubBar({ duration, time, inPoint, outPoint, fps, onScrub, onSetIn, onSetOut }: ScrubBarProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<'playhead' | 'in' | 'out' | null>(null);

  const dur = Math.max(duration, 1e-6);
  const pct = (t: number) => `${clamp01(t / dur) * 100}%`;

  const toTime = (clientX: number): number => {
    const el = barRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return snapToFrame(clamp01((clientX - r.left) / Math.max(1, r.width)) * dur, fps);
  };

  const apply = (mode: 'playhead' | 'in' | 'out', t: number, phase: 'start' | 'move' | 'end') => {
    if (mode === 'in') onSetIn?.(Math.min(t, outPoint ?? dur));
    else if (mode === 'out') onSetOut?.(Math.max(t, inPoint ?? 0));
    else onScrub(t, phase);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const el = barRef.current;
    if (!el) return;
    e.preventDefault();
    const r = el.getBoundingClientRect();
    const px = (t: number) => r.left + clamp01(t / dur) * r.width;
    let mode: 'playhead' | 'in' | 'out' = 'playhead';
    if (inPoint != null && onSetIn && Math.abs(e.clientX - px(inPoint)) < 6) mode = 'in';
    else if (outPoint != null && onSetOut && Math.abs(e.clientX - px(outPoint)) < 6) mode = 'out';
    modeRef.current = mode;
    el.setPointerCapture(e.pointerId);
    apply(mode, toTime(e.clientX), 'start');
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!modeRef.current) return;
    apply(modeRef.current, toTime(e.clientX), 'move');
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (!modeRef.current) return;
    apply(modeRef.current, toTime(e.clientX), 'end');
    modeRef.current = null;
  };

  const bandStart = inPoint ?? 0;
  const bandEnd = outPoint ?? dur;
  const showBand = inPoint != null || outPoint != null;

  return (
    <div
      ref={barRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        position: 'relative', height: 16, background: 'var(--bg-inset)',
        borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
        cursor: 'pointer', userSelect: 'none', touchAction: 'none', flex: 'none',
      }}
    >
      {showBand && bandEnd > bandStart && (
        <div style={{
          position: 'absolute', top: 3, bottom: 3,
          left: pct(bandStart), width: `${clamp01((bandEnd - bandStart) / dur) * 100}%`,
          background: 'rgba(45,140,235,0.28)', borderTop: '2px solid var(--accent)',
          pointerEvents: 'none',
        }} />
      )}
      {inPoint != null && (
        <div title="インポイント" style={{
          position: 'absolute', top: 1, bottom: 1, left: pct(inPoint), width: 5,
          borderLeft: '2px solid var(--accent-bright)', borderTop: '2px solid var(--accent-bright)',
          borderBottom: '2px solid var(--accent-bright)', pointerEvents: 'none',
        }} />
      )}
      {outPoint != null && (
        <div title="アウトポイント" style={{
          position: 'absolute', top: 1, bottom: 1, left: `calc(${pct(outPoint)} - 5px)`, width: 5,
          borderRight: '2px solid var(--accent-bright)', borderTop: '2px solid var(--accent-bright)',
          borderBottom: '2px solid var(--accent-bright)', pointerEvents: 'none',
        }} />
      )}
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: pct(time), width: 2, marginLeft: -1,
        background: 'var(--playhead)', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', top: 0, left: `calc(${pct(time)} - 4px)`,
        borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
        borderTop: '5px solid var(--playhead)', pointerEvents: 'none',
      }} />
    </div>
  );
}

/** Compact transport button (auto width for text labels). */
export function TBtn({ label, title, onClick, toggled, disabled, wide, fontSize }: {
  label: string; title: string; onClick: () => void;
  toggled?: boolean; disabled?: boolean; wide?: boolean; fontSize?: number;
}) {
  return (
    <button
      className={`icon-btn ${toggled ? 'toggled' : ''}`}
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{
        // Japanese labels are wider than English — never let them be squeezed or clipped.
        flex: 'none',
        whiteSpace: 'nowrap',
        ...(wide ? { width: 'auto', minWidth: 26, padding: '0 7px', fontSize: 11 } : {}),
        ...(fontSize ? { fontSize } : {}),
        ...(disabled ? { opacity: 0.35, cursor: 'default' } : {}),
      }}
    >
      {label}
    </button>
  );
}
