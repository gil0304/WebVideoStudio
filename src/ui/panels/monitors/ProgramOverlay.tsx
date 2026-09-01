// ============================================================
// Program Monitor overlays: safe margins, dropped-frame / fps
// indicator, and the direct-manipulation layer (drag clips,
// text layers, inline text editing, type-tool click-to-add).
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { useStudio } from '../../../state/store';
import type { Sequence, TextLayer, TimelineClip } from '../../../model/types';
import { findClip } from '../../../model/types';
import { evalClipTransform, getTextLayerBounds, type ClipTransform } from '../../../engine/renderer';
import { evalNum, evalVec } from '../../../engine/keyframes';
import { playback } from '../../../engine/playback';
import type { Rect } from './shared';

// ---------------- safe margins ----------------

export function SafeMarginsOverlay({ va }: { va: Rect }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.max(2, Math.round(va.w));
  const h = Math.max(2, Math.round(va.h));
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 1;
    const rect = (f: number, alpha: number) => {
      ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
      const iw = Math.round(w * f);
      const ih = Math.round(h * f);
      ctx.strokeRect((w - iw) / 2 + 0.5, (h - ih) / 2 + 0.5, iw, ih);
    };
    rect(0.9, 0.5);  // action safe
    rect(0.8, 0.35); // title safe
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.moveTo(w / 2 + 0.5, h / 2 - 8);
    ctx.lineTo(w / 2 + 0.5, h / 2 + 8);
    ctx.moveTo(w / 2 - 8, h / 2 + 0.5);
    ctx.lineTo(w / 2 + 8, h / 2 + 0.5);
    ctx.stroke();
  }, [w, h]);
  return (
    <canvas
      ref={ref}
      width={w}
      height={h}
      style={{ position: 'absolute', left: va.x, top: va.y, width: va.w, height: va.h, pointerEvents: 'none' }}
    />
  );
}

// ---------------- fps / dropped frames ----------------

export function FpsIndicator() {
  const playing = useStudio((s) => s.ui.playing);
  const [stats, setStats] = useState({ fps: 0, dropped: 0, dropping: false });
  useEffect(() => {
    if (!playing) return;
    let lastDropped = playback.droppedFrames;
    const id = setInterval(() => {
      const d = playback.droppedFrames;
      setStats({ fps: Math.round(playback.fps), dropped: d, dropping: d > lastDropped });
      lastDropped = d;
    }, 500);
    return () => clearInterval(id);
  }, [playing]);
  if (!playing) return null;
  return (
    <div style={{
      position: 'absolute', top: 6, right: 8, display: 'flex', alignItems: 'center', gap: 5,
      background: 'rgba(0,0,0,0.55)', borderRadius: 3, padding: '2px 7px',
      fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text)', pointerEvents: 'none',
      whiteSpace: 'nowrap',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: stats.dropping ? 'var(--warning)' : '#4bbf6b',
        flex: 'none',
      }} />
      <span>{stats.fps}fps</span>
      <span style={{ color: stats.dropped > 0 ? 'var(--warning)' : 'var(--text-dim)' }}>
        ドロップフレーム: {stats.dropped}
      </span>
    </div>
  );
}

// ---------------- direct manipulation ----------------

interface DragState {
  moved: boolean;
  onMove: (e: MouseEvent) => void;
}

export function ManipulationOverlay({ seq, va, playhead }: { seq: Sequence; va: Rect; playhead: number }) {
  const tool = useStudio((s) => s.ui.tool);
  const selection = useStudio((s) => s.ui.selection);
  const selectedTextLayerId = useStudio((s) => s.ui.selectedTextLayerId);
  const [editing, setEditing] = useState<{ layerId: string; value: string } | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<DragState | null>(null);

  const store = useStudio.getState;

  const found = selection.length > 0 ? findClip(seq, selection[0]) : null;
  const clip: TimelineClip | null = found?.clip ?? null;
  const onVideo = found?.track.type === 'video';
  const activeAtPlayhead = !!clip && playhead >= clip.start - 1e-6 && playhead < clip.end;
  const localTime = clip ? playhead - clip.start : 0;

  // close inline editor when the target clip/selection changes
  const clipId = clip?.id ?? null;
  useEffect(() => { setEditing(null); }, [clipId, tool]);

  const showGizmos = tool === 'selection' && !!clip && onVideo && activeAtPlayhead;
  const showType = tool === 'type';
  if (!showGizmos && !showType) return null;

  const W = seq.width;
  const H = seq.height;
  const dspX = (sx: number) => (sx / W) * va.w;
  const dspY = (sy: number) => (sy / H) * va.h;
  const seqDx = (dx: number) => (dx / va.w) * W;
  const seqDy = (dy: number) => (dy / va.h) * H;

  const t: ClipTransform | null = clip ? evalClipTransform(clip, localTime) : null;
  const sw = t ? t.scaleW / 100 : 1;
  const sh = t ? t.scale / 100 : 1;
  // scale/position mapping around center (rotation ignored for text gizmos)
  const mapX = (px: number) => t ? (px - W / 2 - t.anchorX) * sw + t.x : px;
  const mapY = (py: number) => t ? (py - H / 2 - t.anchorY) * sh + t.y : py;
  const invX = (mx: number) => t ? (mx - t.x) / (sw || 1e-6) + W / 2 + t.anchorX : mx;
  const invY = (my: number) => t ? (my - t.y) / (sh || 1e-6) + H / 2 + t.anchorY : my;
  void invX; void invY;
  // full transform incl. rotation (clip bounding box)
  const xform = (px: number, py: number): { x: number; y: number } => {
    if (!t) return { x: px, y: py };
    let vx = (px - W / 2 - t.anchorX) * sw;
    let vy = (py - H / 2 - t.anchorY) * sh;
    const r = (t.rotation * Math.PI) / 180;
    const cos = Math.cos(r);
    const sin = Math.sin(r);
    const rx = vx * cos - vy * sin;
    const ry = vx * sin + vy * cos;
    vx = rx; vy = ry;
    return { x: vx + t.x, y: vy + t.y };
  };

  const beginDrag = (
    e: React.MouseEvent, label: string,
    onMove: (dxDisp: number, dyDisp: number, ev: MouseEvent) => void,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const s = store();
    s.beginTransaction(label);
    const startX = e.clientX;
    const startY = e.clientY;
    const state: DragState = {
      moved: false,
      onMove: (ev: MouseEvent) => {
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (Math.abs(dx) + Math.abs(dy) > 1) state.moved = true;
        if (state.moved) onMove(dx, dy, ev);
      },
    };
    dragRef.current = state;
    const onUp = () => {
      window.removeEventListener('mousemove', state.onMove);
      window.removeEventListener('mouseup', onUp);
      const st = store();
      if (state.moved) {
        st.endTransaction();
        suppressClickRef.current = true;
      } else {
        st.cancelTransaction();
      }
      dragRef.current = null;
    };
    window.addEventListener('mousemove', state.onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ---- text layer interactions ----

  const startLayerMove = (e: React.MouseEvent, layer: TextLayer) => {
    if (!clip) return;
    store().setUi({ selectedTextLayerId: layer.id });
    const x0 = layer.x;
    const y0 = layer.y;
    beginDrag(e, 'Move Text', (dx, dy) => {
      store().patchTextLayer(clip.id, layer.id, {
        x: Math.round(x0 + seqDx(dx) / (sw || 1e-6)),
        y: Math.round(y0 + seqDy(dy) / (sh || 1e-6)),
      }, 'Move Text');
    });
  };

  const startLayerScale = (e: React.MouseEvent, layer: TextLayer) => {
    if (!clip) return;
    const cX = va.x + dspX(mapX(layer.x));
    const cY = va.y + dspY(mapY(layer.y));
    const rect = (e.currentTarget as HTMLElement).ownerDocument.body.getBoundingClientRect();
    void rect;
    const d0 = Math.max(4, Math.hypot(e.clientX - (cX + overlayOrigin.x), e.clientY - (cY + overlayOrigin.y)));
    const font0 = layer.fontSize;
    const w0 = layer.width;
    const h0 = layer.height;
    beginDrag(e, layer.kind === 'text' ? 'Scale Text' : 'Resize Shape', (_dx, _dy, ev) => {
      const d1 = Math.hypot(ev.clientX - (cX + overlayOrigin.x), ev.clientY - (cY + overlayOrigin.y));
      const ratio = Math.max(0.05, d1 / d0);
      if (layer.kind === 'text') {
        store().patchTextLayer(clip.id, layer.id, {
          fontSize: Math.max(4, Math.min(800, Math.round(font0 * ratio))),
        }, 'Scale Text');
      } else {
        store().patchTextLayer(clip.id, layer.id, {
          width: Math.max(2, Math.round(w0 * ratio)),
          height: Math.max(2, Math.round(h0 * ratio)),
        }, 'Resize Shape');
      }
    });
  };

  // overlay origin in client coordinates (kept fresh via ref callback)
  const overlayOrigin = { x: 0, y: 0 };
  const overlayRefCb = (el: HTMLDivElement | null) => {
    if (el) {
      const r = el.getBoundingClientRect();
      overlayOrigin.x = r.left;
      overlayOrigin.y = r.top;
    }
  };

  // ---- normal clip interactions ----

  const startClipMove = (e: React.MouseEvent) => {
    if (!clip) return;
    const pos0 = evalVec(clip.position, localTime);
    const lt = localTime;
    beginDrag(e, 'Move', (dx, dy) => {
      store().setPropValue(clip.id, { kind: 'intrinsic', key: 'position' },
        [pos0[0] + seqDx(dx), pos0[1] + seqDy(dy)], lt);
    });
  };

  const startClipScale = (e: React.MouseEvent) => {
    if (!clip || !t) return;
    const corners = [xform(0, 0), xform(W, 0), xform(W, H), xform(0, H)];
    const cX = corners.reduce((m, c) => m + dspX(c.x), 0) / 4 + overlayOrigin.x;
    const cY = corners.reduce((m, c) => m + dspY(c.y), 0) / 4 + overlayOrigin.y;
    const d0 = Math.max(4, Math.hypot(e.clientX - cX, e.clientY - cY));
    const scale0 = evalNum(clip.scale, localTime);
    const scaleW0 = evalNum(clip.scaleWidth, localTime);
    const uniform = clip.uniformScale;
    const lt = localTime;
    beginDrag(e, 'Scale', (_dx, _dy, ev) => {
      const d1 = Math.hypot(ev.clientX - cX, ev.clientY - cY);
      const ratio = Math.max(0.02, d1 / d0);
      const s = store();
      s.setPropValue(clip.id, { kind: 'intrinsic', key: 'scale' }, Math.round(scale0 * ratio * 10) / 10, lt);
      if (!uniform) {
        s.setPropValue(clip.id, { kind: 'intrinsic', key: 'scaleWidth' }, Math.round(scaleW0 * ratio * 10) / 10, lt);
      }
    });
  };

  // ---- inline text editing ----

  const commitEditing = () => {
    if (editing && clip) {
      store().patchTextLayer(clip.id, editing.layerId, { text: editing.value }, 'Edit Text');
    }
    store().setUi({ editingTextLayer: null });
    setEditing(null);
  };
  const cancelEditing = () => {
    store().setUi({ editingTextLayer: null });
    setEditing(null);
  };

  const startEditing = (layer: TextLayer) => {
    if (!clip || layer.kind !== 'text') return;
    store().setUi({ selectedTextLayerId: layer.id, editingTextLayer: { clipId: clip.id, layerId: layer.id } });
    setEditing({ layerId: layer.id, value: layer.text ?? '' });
  };

  const onRootClick = (e: React.MouseEvent) => {
    if (suppressClickRef.current) { suppressClickRef.current = false; return; }
    if (e.target !== e.currentTarget) return;
    if (editing) { commitEditing(); return; }
    if (showType) return;
    store().togglePlay();
  };

  const onRootMouseDown = (e: React.MouseEvent) => {
    if (!showType || e.target !== e.currentTarget) return;
    e.preventDefault();
    // 2nd arg is the created layer's visible text / clip name (not a history label).
    store().addGraphicClip(playhead, '新規テキスト');
  };

  const handleStyle: React.CSSProperties = {
    position: 'absolute', width: 8, height: 8, marginLeft: -4, marginTop: -4,
    background: '#fff', border: '1px solid #333', cursor: 'nwse-resize', zIndex: 3,
  };

  const textLayers = (showGizmos && clip?.textLayers && clip.textLayers.length > 0) ? clip.textLayers : null;

  return (
    <div
      ref={overlayRefCb}
      onClick={onRootClick}
      onMouseDown={onRootMouseDown}
      style={{
        position: 'absolute', left: va.x, top: va.y, width: va.w, height: va.h,
        cursor: showType ? 'text' : 'default', zIndex: 2, overflow: 'visible',
      }}
    >
      {/* text/graphic layer gizmos */}
      {textLayers && textLayers.map((layer) => {
        if (!layer.visible) return null;
        const b = getTextLayerBounds(layer);
        const x1 = dspX(mapX(b.x));
        const y1 = dspY(mapY(b.y));
        const x2 = dspX(mapX(b.x + b.w));
        const y2 = dspY(mapY(b.y + b.h));
        const sel = layer.id === selectedTextLayerId;
        const isEditingThis = editing?.layerId === layer.id;
        const fontPx = layer.fontSize * sh * (va.h / H);
        return (
          <React.Fragment key={layer.id}>
            {!isEditingThis && (
              <div
                onMouseDown={(e) => startLayerMove(e, layer)}
                onDoubleClick={(e) => { e.stopPropagation(); startEditing(layer); }}
                title={layer.name}
                style={{
                  position: 'absolute', left: x1, top: y1, width: Math.max(4, x2 - x1), height: Math.max(4, y2 - y1),
                  border: sel ? '1.5px solid var(--accent-bright)' : '1px solid rgba(255,255,255,0.4)',
                  cursor: 'move', zIndex: sel ? 2 : 1,
                }}
              />
            )}
            {sel && !isEditingThis && (
              <div
                onMouseDown={(e) => startLayerScale(e, layer)}
                title="スケール"
                style={{ ...handleStyle, left: x2, top: y2 }}
              />
            )}
            {isEditingThis && editing && (
              <textarea
                autoFocus
                value={editing.value}
                onChange={(e) => setEditing({ layerId: layer.id, value: e.target.value })}
                onBlur={commitEditing}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'Escape') { e.preventDefault(); cancelEditing(); }
                  else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitEditing(); }
                }}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  position: 'absolute', left: x1 - 2, top: y1 - 2,
                  width: Math.max(80, x2 - x1 + 24), height: Math.max(fontPx * 1.5, y2 - y1 + 8),
                  background: 'rgba(0,0,0,0.55)', color: layer.fill,
                  font: `${layer.fontStyle === 'italic' ? 'italic ' : ''}${layer.fontWeight} ${Math.max(9, fontPx)}px ${layer.fontFamily}`,
                  textAlign: layer.align, border: '1px dashed var(--accent-bright)', outline: 'none',
                  resize: 'none', overflow: 'hidden', zIndex: 4, lineHeight: layer.lineHeight,
                }}
              />
            )}
          </React.Fragment>
        );
      })}

      {/* normal video clip bounding box */}
      {showGizmos && clip && !textLayers && t && (() => {
        const corners = [xform(0, 0), xform(W, 0), xform(W, H), xform(0, H)];
        const pts = corners.map((c) => `${dspX(c.x)},${dspY(c.y)}`).join(' ');
        return (
          <>
            <svg
              width={Math.max(1, va.w)}
              height={Math.max(1, va.h)}
              style={{ position: 'absolute', inset: 0, overflow: 'visible', pointerEvents: 'none' }}
            >
              <polygon
                points={pts}
                fill="rgba(0,0,0,0)"
                stroke="var(--accent-bright)"
                strokeWidth={1.5}
                style={{ pointerEvents: 'all', cursor: 'move' }}
                onMouseDown={(e) => startClipMove(e as unknown as React.MouseEvent)}
              />
            </svg>
            {corners.map((c, i) => (
              <div
                key={i}
                onMouseDown={startClipScale}
                title="スケール"
                style={{ ...handleStyle, left: dspX(c.x), top: dspY(c.y) }}
              />
            ))}
            <div
              onMouseDown={startClipMove}
              title="アンカーポイント"
              style={{
                position: 'absolute', left: dspX((corners[0].x + corners[2].x) / 2) - 3,
                top: dspY((corners[0].y + corners[2].y) / 2) - 3,
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--accent-bright)', cursor: 'move', zIndex: 3,
              }}
            />
          </>
        );
      })()}
    </div>
  );
}
