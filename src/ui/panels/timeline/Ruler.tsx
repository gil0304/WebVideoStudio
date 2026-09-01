// ============================================================
// Timeline ruler — adaptive tick marks + timecode labels,
// sequence markers (draggable pentagons), In/Out range band,
// playhead handle, and click/drag scrubbing with audio scrub.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import type { Marker } from '../../../model/types';
import {
  getActiveSequence, useActiveSequence, usePlayhead, useStudio,
} from '../../../state/store';
import { snapToFrame, toTimecode } from '../../../engine/timecode';
import { audioEngine } from '../../../engine/audioEngine';
import { useContextMenu } from '../../components/ContextMenu';
import { FPS, MARKER_HEX, RULER_H } from './utils';

const TICK_STEPS = [
  1 / 30, 2 / 30, 5 / 30, 10 / 30, 0.5, 1, 2, 5, 10, 15, 30,
  60, 120, 300, 600, 1800, 3600,
];

function PlayheadHandle() {
  const ph = usePlayhead();
  const zoom = useStudio((s) => s.ui.zoom);
  const scrollX = useStudio((s) => s.ui.scrollX);
  const x = ph * zoom - scrollX;
  if (x < -20) return null;
  return (
    <div style={{ position: 'absolute', top: 0, bottom: 0, left: x, width: 0, zIndex: 6, pointerEvents: 'none' }}>
      <div style={{
        position: 'absolute', left: -5.5, top: 1, width: 11, height: 13,
        background: 'var(--playhead)',
        clipPath: 'polygon(0 0, 100% 0, 100% 55%, 50% 100%, 0 55%)',
      }} />
      <div style={{ position: 'absolute', left: -0.5, top: 10, bottom: 0, width: 1, background: 'var(--playhead)' }} />
    </div>
  );
}

export function TimelineRuler() {
  const zoom = useStudio((s) => s.ui.zoom);
  const scrollX = useStudio((s) => s.ui.scrollX);
  const seq = useActiveSequence();
  const seqIn = useStudio((s) => s.ui.seqIn[s.ui.activeSequenceId] ?? null);
  const seqOut = useStudio((s) => s.ui.seqOut[s.ui.activeSequenceId] ?? null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrubbingRef = useRef(false);
  const [w, setW] = useState(0);
  const { openMenu, menuEl } = useContextMenu();

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ---- tick canvas ----
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || w < 2) return;
    const dpr = window.devicePixelRatio || 1;
    const h = RULER_H;
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const labelStep = TICK_STEPS.find((s) => s * zoom >= 74) ?? 3600;
    let minor = labelStep / 5;
    if (minor * zoom < 6) minor = labelStep / 2;
    if (minor * zoom < 6) minor = labelStep;

    const t0 = scrollX / zoom;
    const t1 = (scrollX + w) / zoom;
    ctx.strokeStyle = '#4d4d4d';
    ctx.fillStyle = '#9a9a9a';
    ctx.font = '9px "SF Mono", Menlo, Consolas, monospace';
    const eps = minor / 4;
    const i0 = Math.max(0, Math.floor(t0 / minor));
    for (let i = i0; i * minor <= t1 + eps; i++) {
      const t = i * minor;
      const x = Math.round(t * zoom - scrollX) + 0.5;
      const isMajor = Math.abs(t / labelStep - Math.round(t / labelStep)) < 1e-4;
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? h - 11 : h - 5);
      ctx.lineTo(x, h - 1);
      ctx.stroke();
      if (isMajor) ctx.fillText(toTimecode(t, FPS), x + 3, h - 14);
    }
  }, [w, zoom, scrollX]);

  // ---- scrubbing ----
  const scrubTo = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const st = useStudio.getState();
    const t = snapToFrame(Math.max(0, (clientX - rect.left + st.ui.scrollX) / st.ui.zoom), FPS);
    st.setPlayhead(t);
    audioEngine.scrub(st.project, getActiveSequence(st), t);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    useStudio.getState().setPlaying(false);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    scrubbingRef.current = true;
    scrubTo(e.clientX);
  };

  // ---- marker dragging ----
  const onMarkerDown = (e: React.PointerEvent, m: Marker) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    let moved = false;
    useStudio.getState().beginTransaction('Move Marker');
    const move = (ev: PointerEvent) => {
      moved = true;
      const st = useStudio.getState();
      const t = snapToFrame(Math.max(0, (ev.clientX - rect.left + st.ui.scrollX) / st.ui.zoom), FPS);
      st.updateMarker(m.id, { time: t });
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      const st = useStudio.getState();
      if (moved) st.endTransaction();
      else st.cancelTransaction();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const onMarkerContext = (e: React.MouseEvent, m: Marker) => {
    const st = useStudio.getState();
    openMenu(e, [
      { label: 'マーカーを編集…', onClick: () => st.setUi({ openDialog: 'marker-edit', dialogPayload: m.id }) },
      { separator: true },
      { label: 'マーカーを消去', onClick: () => st.removeMarker(m.id) },
    ]);
  };

  const onRulerContext = (e: React.MouseEvent) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const st = useStudio.getState();
    const t = snapToFrame(Math.max(0, (e.clientX - rect.left + st.ui.scrollX) / st.ui.zoom), FPS);
    openMenu(e, [
      { label: 'マーカーを追加', onClick: () => st.addMarker(t) },
      { separator: true },
      { label: 'インをマーク', onClick: () => st.setSeqIn(t) },
      { label: 'アウトをマーク', onClick: () => st.setSeqOut(t) },
      {
        label: 'インとアウトを消去',
        disabled: seqIn == null && seqOut == null,
        onClick: () => { st.setSeqIn(null); st.setSeqOut(null); },
      },
    ]);
  };

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={(e) => { if (scrubbingRef.current) scrubTo(e.clientX); }}
      onPointerUp={() => { scrubbingRef.current = false; }}
      onContextMenu={onRulerContext}
      style={{
        flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden',
        height: RULER_H, cursor: 'default', background: 'var(--bg-panel-header)',
      }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />

      {/* In/Out range band */}
      {seqIn != null && seqOut != null && seqOut > seqIn && (
        <div style={{
          position: 'absolute', top: 13, bottom: 0,
          left: seqIn * zoom - scrollX, width: (seqOut - seqIn) * zoom,
          background: 'rgba(110, 152, 210, 0.30)',
          borderLeft: '1px solid var(--accent)', borderRight: '1px solid var(--accent)',
          pointerEvents: 'none',
        }} />
      )}

      {/* markers (translated layer) */}
      <div style={{ position: 'absolute', inset: 0, transform: `translateX(${-scrollX}px)`, pointerEvents: 'none' }}>
        {seq.markers.map((m) => (
          <React.Fragment key={m.id}>
            {m.duration > 0 && (
              <div style={{
                position: 'absolute', left: m.time * zoom, width: m.duration * zoom,
                top: 2, height: 3, background: MARKER_HEX[m.color], opacity: 0.8, borderRadius: 1,
              }} />
            )}
            <div
              title={`${m.name || 'マーカー'} — ${toTimecode(m.time, FPS)}${m.comment ? `\n${m.comment}` : ''}`}
              onPointerDown={(e) => onMarkerDown(e, m)}
              onContextMenu={(e) => onMarkerContext(e, m)}
              style={{
                position: 'absolute', left: m.time * zoom - 5, top: 1, width: 10, height: 12,
                background: MARKER_HEX[m.color],
                clipPath: 'polygon(50% 100%, 0 55%, 0 0, 100% 0, 100% 55%)',
                cursor: 'ew-resize', pointerEvents: 'auto', zIndex: 4,
              }}
            />
          </React.Fragment>
        ))}
      </div>

      <PlayheadHandle />
      {menuEl}
    </div>
  );
}
