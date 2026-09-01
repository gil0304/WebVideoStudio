// ============================================================
// Timeline panel — Premiere-style multi-track editor for the
// active sequence: sequence tabs, adaptive ruler with markers
// and In/Out, track headers, virtualized clip lanes, full tool
// interactions (move/trim/ripple/rolling/rate/razor/slip/slide/
// hand/zoom), snapping, marquee, drag&drop targets, context
// menus and a zoom/scroll bottom bar.
// ============================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { LabelColor, MediaAsset, Sequence, TimelineClip, Track } from '../../model/types';
import { findClip, getAsset, LABEL_COLORS, LABEL_NAMES_JA, sequenceDuration } from '../../model/types';
import {
  getActiveSequence, useActiveSequence, usePlayhead, useStudio,
} from '../../state/store';
import { snapToFrame, toTimecode } from '../../engine/timecode';
import { useContextMenu, type CtxItem } from '../components/ContextMenu';
import { ClipView } from './timeline/ClipView';
import { TrackHeader } from './timeline/TrackHeader';
import { TimelineRuler } from './timeline/Ruler';
import {
  applyBlockSnap, applySnap, computeLaneLayout, DIVIDER_H, EDGE_PX, FPS,
  HEADER_W, laneAtY, RULER_H, snapCandidates, TABS_H,
} from './timeline/utils';

// ---------------- constants / small helpers ----------------

const DND_ASSET = 'application/x-wvs-asset';
const DND_EFFECT = 'application/x-wvs-effect';
const DND_TRANSITION = 'application/x-wvs-transition';

const ZMIN = 1.5;
const ZMAX = 400;
const zoomToSlider = (z: number) => Math.log(z / ZMIN) / Math.log(ZMAX / ZMIN);
const sliderToZoom = (v: number) => ZMIN * Math.pow(ZMAX / ZMIN, Math.max(0, Math.min(1, v)));

function edgeAt(c: TimelineClip, xPx: number, zoom: number, th: number): 'in' | 'out' | null {
  const l = c.start * zoom;
  const r = c.end * zoom;
  const lim = Math.min(th, Math.max(3, (r - l) / 3));
  if (Math.abs(xPx - l) <= lim) return 'in';
  if (Math.abs(r - xPx) <= lim) return 'out';
  return null;
}

const allSeqClipIds = (sq: Sequence): string[] =>
  [...sq.videoTracks, ...sq.audioTracks].flatMap((t) => t.clips.map((c) => c.id));

// ---------------- overlay state ----------------

interface OvRect { x: number; y: number; w: number; h: number }
interface GhostRect { left: number; top: number; width: number; height: number }

interface Overlay {
  snapLine: number | null;      // seconds
  razorT: number | null;        // seconds
  marquee: OvRect | null;       // content px
  ghosts: GhostRect[] | null;   // alt-duplicate drag preview
  dropTrackId: string | null;
  dropGhost: { x: number; w: number; top: number; h: number } | null;
  dropClipId: string | null;
}

const EMPTY_OV: Overlay = {
  snapLine: null, razorT: null, marquee: null, ghosts: null,
  dropTrackId: null, dropGhost: null, dropClipId: null,
};

const rectEq = (a: OvRect | null, b: OvRect | null) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
const dropGhostEq = (a: Overlay['dropGhost'], b: Overlay['dropGhost']) =>
  a === b || (!!a && !!b && a.x === b.x && a.w === b.w && a.top === b.top && a.h === b.h);
const ghostsEq = (a: GhostRect[] | null, b: GhostRect[] | null) =>
  a === b || (!!a && !!b && a.length === b.length &&
    a.every((g, i) => g.left === b[i].left && g.top === b[i].top && g.width === b[i].width && g.height === b[i].height));
const ovEq = (a: Overlay, b: Overlay) =>
  a.snapLine === b.snapLine && a.razorT === b.razorT && a.dropTrackId === b.dropTrackId &&
  a.dropClipId === b.dropClipId && rectEq(a.marquee, b.marquee) &&
  dropGhostEq(a.dropGhost, b.dropGhost) && ghostsEq(a.ghosts, b.ghosts);

// ---------------- drag state machine ----------------

interface MoveInfo { id: string; start: number; end: number; type: 'video' | 'audio'; listIdx: number }

type Drag =
  | { kind: 'hand'; downX: number; downY: number; scroll0: number; top0: number }
  | { kind: 'marquee'; x0: number; y0: number; base: string[]; additive: boolean; moved: boolean }
  | {
      kind: 'move'; ids: string[]; grabId: string; infos: MoveInfo[]; minStart: number;
      offsets: number[]; grabType: 'video' | 'audio'; grabIdx: number; vLen: number; aLen: number;
      downX: number; downClientX: number; downClientY: number; candidates: number[];
      dup: boolean; moved: boolean; inTx: boolean; applied: number; appliedTrack: number;
      pendDelta: number; pendTrack: number; collapse: boolean;
    }
  | { kind: 'trim'; clipId: string; edge: 'in' | 'out'; ripple: boolean; candidates: number[]; moved: boolean; inTx: boolean }
  | { kind: 'roll'; clipId: string; edge: 'in' | 'out'; candidates: number[]; moved: boolean; inTx: boolean }
  | { kind: 'rate'; clipId: string; candidates: number[]; moved: boolean; inTx: boolean }
  | { kind: 'slip'; clipId: string; lastT: number; moved: boolean; inTx: boolean }
  | { kind: 'slide'; clipId: string; downT: number; start0: number; moved: boolean; inTx: boolean };

/** Alt-drag duplicate: clone each selected clip and move the copy to the drop position. */
function commitDuplicate(d: Extract<Drag, { kind: 'move' }>): void {
  useStudio.getState().beginTransaction('Duplicate');
  const newIds: string[] = [];
  for (const info of d.infos) {
    const before = new Set(allSeqClipIds(getActiveSequence(useStudio.getState())));
    useStudio.getState().duplicateClips([info.id]);
    const after = getActiveSequence(useStudio.getState());
    const newId = allSeqClipIds(after).find((id) => !before.has(id));
    if (!newId) continue;
    const f = findClip(after, newId);
    if (!f) continue;
    useStudio.getState().moveClips([newId], info.start + d.pendDelta - f.clip.start, d.pendTrack);
    newIds.push(newId);
  }
  useStudio.getState().endTransaction();
  useStudio.getState().setSelection(newIds);
}

// ---------------- clip context menu ----------------

function clipMenuItems(clip: TimelineClip, track: Track, sel: string[], t: number): CtxItem[] {
  const st = () => useStudio.getState();
  return [
    { label: 'カット', shortcut: '⌘X', onClick: () => { st().copyClips(sel); st().deleteClips(sel, false); } },
    { label: 'コピー', shortcut: '⌘C', onClick: () => st().copyClips(sel) },
    { label: 'ペースト', shortcut: '⌘V', disabled: !st().ui.clipboard?.length, onClick: () => st().pasteClips(t) },
    { separator: true },
    { label: 'リップル削除', onClick: () => st().deleteClips(sel, true) },
    { label: '削除', shortcut: '⌫', onClick: () => st().deleteClips(sel, false) },
    { separator: true },
    { label: '有効', checked: clip.enabled, onClick: () => st().toggleClipEnabled(sel) },
    { label: 'リンク解除', disabled: !clip.linkedClipId, onClick: () => st().unlinkClip(clip.id) },
    { label: 'グループ化', disabled: sel.length < 2, onClick: () => st().groupClips(sel) },
    { label: 'グループ解除', disabled: !clip.groupId, onClick: () => st().ungroupClips(sel) },
    {
      label: 'ネスト…',
      onClick: () => {
        const name = window.prompt('ネストしたシーケンスの名前:', 'ネストされたシーケンス');
        if (name) st().nestClips(sel, name);
      },
    },
    { separator: true },
    { label: '速度・デュレーション…', onClick: () => st().setUi({ openDialog: 'speed-duration', dialogPayload: clip.id }) },
    {
      label: 'デフォルトのトランジションを適用',
      onClick: () => st().addTransition(clip.id, 'in', track.type === 'audio' ? 'constant-power' : 'cross-dissolve', 1),
    },
    {
      label: 'ラベル',
      children: (Object.keys(LABEL_COLORS) as LabelColor[]).map((lc) => ({
        label: LABEL_NAMES_JA[lc],
        checked: clip.label === lc,
        onClick: () => st().mutate('Label', (draft) => {
          const sq = draft.sequences.find((q) => q.id === st().ui.activeSequenceId) ?? draft.sequences[0];
          for (const id of sel) {
            const f = findClip(sq, id);
            if (f) f.clip.label = lc;
          }
        }),
      })),
    },
    {
      label: '名前を変更…',
      onClick: () => {
        const name = window.prompt('クリップ名を変更:', clip.name);
        if (name) st().patchClip(clip.id, { name }, 'Rename');
      },
    },
  ];
}

// ---------------- small subscribed components ----------------

/** Blue playhead line, rendered in content coordinates (translated with the lanes). */
function PlayheadLine() {
  const ph = usePlayhead();
  const zoom = useStudio((s) => s.ui.zoom);
  return (
    <div style={{
      position: 'absolute', left: ph * zoom, top: 0, bottom: 0, width: 1,
      background: 'var(--playhead)', zIndex: 25, pointerEvents: 'none',
    }} />
  );
}

/** Ruler corner: current timecode + snapping (magnet) toggle. */
function CornerCell() {
  const ph = usePlayhead();
  const snapping = useStudio((s) => s.ui.snapping);
  return (
    <div style={{
      width: HEADER_W, flex: 'none', display: 'flex', alignItems: 'center',
      gap: 4, padding: '0 6px', borderRight: '1px solid var(--border)',
    }}>
      <span className="timecode" style={{ fontSize: 11 }}>{toTimecode(ph, FPS)}</span>
      <button
        className={`icon-btn ${snapping ? 'toggled' : ''}`}
        title="タイムラインにスナップ (S)"
        onClick={() => useStudio.getState().setSnapping(!snapping)}
        style={{ marginLeft: 'auto', width: 20, height: 18, fontSize: 11, fontWeight: 700 }}
      >
        <span style={{ display: 'inline-block', transform: 'rotate(180deg)' }}>U</span>
      </button>
    </div>
  );
}

// ---------------- lane row (virtualized clips) ----------------

const LaneRow = React.memo(function LaneRow({ track, top, height, zoom, vis0, vis1, assetMap, selSet }: {
  track: Track; top: number; height: number; zoom: number; vis0: number; vis1: number;
  assetMap: Map<string, MediaAsset>; selSet: Set<string>;
}) {
  return (
    <div data-track-id={track.id} style={{ position: 'absolute', left: 0, right: 0, top, height, background: 'var(--bg-track)' }}>
      {track.clips.filter((c) => c.end > vis0 && c.start < vis1).map((c) => (
        <ClipView
          key={c.id}
          clip={c}
          asset={assetMap.get(c.assetId)}
          trackType={track.type}
          trackHeight={height}
          zoom={zoom}
          selected={selSet.has(c.id)}
        />
      ))}
      {track.locked && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none',
          background: 'repeating-linear-gradient(45deg, rgba(200,200,200,0.07) 0 5px, transparent 5px 10px)',
        }} />
      )}
    </div>
  );
});

// ================= main panel =================

export default function TimelinePanel() {
  const seq = useActiveSequence();
  const zoom = useStudio((s) => s.ui.zoom);
  const scrollX = useStudio((s) => s.ui.scrollX);
  const tool = useStudio((s) => s.ui.tool);
  const snapping = useStudio((s) => s.ui.snapping);
  const selection = useStudio((s) => s.ui.selection);
  const assets = useStudio((s) => s.project.assets);
  const sequences = useStudio((s) => s.project.sequences);
  const activeId = useStudio((s) => s.ui.activeSequenceId);

  const vScrollRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const hScrollRef = useRef<HTMLDivElement>(null);
  const hSyncRef = useRef(false);
  const dragRef = useRef<Drag | null>(null);
  const [viewW, setViewW] = useState(600);
  const [ov, setOv] = useState<Overlay>(EMPTY_OV);
  const { openMenu, menuEl } = useContextMenu();

  const layout = useMemo(() => computeLaneLayout(seq), [seq]);
  const assetMap = useMemo(() => new Map(assets.map((a) => [a.id, a] as const)), [assets]);
  const selSet = useMemo(() => new Set(selection), [selection]);
  const dur = useMemo(() => sequenceDuration(seq), [seq]);
  const contentW = Math.max((dur + 60) * zoom, scrollX + viewW + 200);

  // virtualization window (quantized so scroll doesn't thrash renders)
  const chunk = Math.max(1, viewW / zoom / 2);
  const vis0 = Math.max(0, (Math.floor(scrollX / zoom / chunk) - 1) * chunk);
  const vis1 = vis0 + chunk * 4;

  const setOverlay = (patch: Partial<Overlay>) => {
    setOv((prev) => {
      const next = { ...prev, ...patch };
      return ovEq(prev, next) ? prev : next;
    });
  };

  // ---- viewport width tracking ----
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // ---- wheel: alt/ctrl = zoom around cursor, shift/horizontal = pan ----
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const st = useStudio.getState();
      if (e.altKey || e.ctrlKey) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const t = (st.ui.scrollX + cx) / st.ui.zoom;
        const nz = Math.max(ZMIN, Math.min(ZMAX, st.ui.zoom * Math.pow(1.0015, -e.deltaY)));
        st.setZoom(nz);
        st.setScrollX(t * nz - cx);
      } else if (e.shiftKey) {
        e.preventDefault();
        st.setScrollX(st.ui.scrollX + (e.deltaY || e.deltaX));
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        st.setScrollX(st.ui.scrollX + e.deltaX);
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---- keep native bottom scrollbar in sync with ui.scrollX ----
  useEffect(() => {
    const el = hScrollRef.current;
    if (!el) return;
    if (Math.abs(el.scrollLeft - scrollX) > 1) {
      hSyncRef.current = true;
      el.scrollLeft = scrollX;
    }
  }, [scrollX, contentW]);

  const onHScroll = () => {
    if (hSyncRef.current) { hSyncRef.current = false; return; }
    const el = hScrollRef.current;
    if (el) useStudio.getState().setScrollX(el.scrollLeft);
  };

  // ---- coordinate helpers ----
  const contentPos = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const el = contentRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const zoomAt = (clientX: number, factor: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const st = useStudio.getState();
    const rect = vp.getBoundingClientRect();
    const cx = clientX - rect.left;
    const t = (st.ui.scrollX + cx) / st.ui.zoom;
    const nz = Math.max(ZMIN, Math.min(ZMAX, st.ui.zoom * factor));
    st.setZoom(nz);
    st.setScrollX(t * nz - cx);
  };

  const fitToView = () => {
    const st = useStudio.getState();
    const d = Math.max(1, sequenceDuration(getActiveSequence(st)));
    const nz = Math.max(ZMIN, Math.min(ZMAX, (viewW - 40) / d));
    st.setZoom(nz);
    st.setScrollX(0);
  };

  // ---------------- pointer interactions ----------------

  const onLanePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const st = useStudio.getState();
    const seqNow = getActiveSequence(st);
    const pos = contentPos(e);
    if (!pos) return;
    const { x, y } = pos;
    const t = x / zoom;
    const clipEl = (e.target as HTMLElement).closest('[data-clip-id]') as HTMLElement | null;
    const clipId = clipEl?.dataset.clipId ?? null;
    const hit = clipId ? findClip(seqNow, clipId) : null;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    if (tool === 'hand') {
      dragRef.current = {
        kind: 'hand', downX: e.clientX, downY: e.clientY,
        scroll0: st.ui.scrollX, top0: vScrollRef.current?.scrollTop ?? 0,
      };
      if (viewportRef.current) viewportRef.current.style.cursor = 'grabbing';
      return;
    }
    if (tool === 'zoom') { zoomAt(e.clientX, e.altKey ? 1 / 1.5 : 1.5); return; }
    if (tool === 'razor') {
      const ts = snapToFrame(Math.max(0, t), FPS);
      if (e.altKey) st.razorAtTime(ts, true);
      else if (hit) st.razorClip(hit.clip.id, ts);
      return;
    }
    if (tool === 'track-select-forward') { if (clipId) st.selectTrackForward(clipId, e.shiftKey); return; }
    if (tool === 'track-select-backward') { if (clipId) st.selectTrackForward(clipId, true); return; }
    if (tool === 'ripple' || tool === 'rolling' || tool === 'rate-stretch') {
      if (!hit) return;
      const edge = edgeAt(hit.clip, x, zoom, 10) ?? (t < (hit.clip.start + hit.clip.end) / 2 ? 'in' : 'out');
      if (tool === 'ripple') {
        dragRef.current = {
          kind: 'trim', clipId: hit.clip.id, edge, ripple: true,
          candidates: snapCandidates(st, seqNow, new Set([hit.clip.id])), moved: false, inTx: false,
        };
      } else if (tool === 'rolling') {
        const nb = edge === 'out'
          ? hit.track.clips.find((c) => Math.abs(c.start - hit.clip.end) < 1e-3)
          : hit.track.clips.find((c) => Math.abs(c.end - hit.clip.start) < 1e-3);
        const excl = new Set([hit.clip.id]);
        if (nb) excl.add(nb.id);
        dragRef.current = {
          kind: 'roll', clipId: hit.clip.id, edge,
          candidates: snapCandidates(st, seqNow, excl), moved: false, inTx: false,
        };
      } else if (edge === 'out') {
        dragRef.current = {
          kind: 'rate', clipId: hit.clip.id,
          candidates: snapCandidates(st, seqNow, new Set([hit.clip.id])), moved: false, inTx: false,
        };
      }
      return;
    }
    if (tool === 'slip') {
      if (hit) dragRef.current = { kind: 'slip', clipId: hit.clip.id, lastT: t, moved: false, inTx: false };
      return;
    }
    if (tool === 'slide') {
      if (hit) dragRef.current = { kind: 'slide', clipId: hit.clip.id, downT: t, start0: hit.clip.start, moved: false, inTx: false };
      return;
    }

    // ---- selection tool (default) ----
    if (hit) {
      const edge = edgeAt(hit.clip, x, zoom, EDGE_PX);
      if (edge) {
        dragRef.current = {
          kind: 'trim', clipId: hit.clip.id, edge, ripple: false,
          candidates: snapCandidates(st, seqNow, new Set([hit.clip.id])), moved: false, inTx: false,
        };
        return;
      }
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      const already = st.ui.selection.includes(hit.clip.id);
      if (!already || additive) st.selectClip(hit.clip.id, additive);
      const sel = useStudio.getState().ui.selection;
      if (!sel.includes(hit.clip.id)) return; // shift-click toggled it off
      const seq2 = getActiveSequence(useStudio.getState());
      const infos: MoveInfo[] = [];
      for (const id of sel) {
        const f = findClip(seq2, id);
        if (!f) continue;
        const list = f.track.type === 'video' ? seq2.videoTracks : seq2.audioTracks;
        infos.push({ id, start: f.clip.start, end: f.clip.end, type: f.track.type, listIdx: list.indexOf(f.track) });
      }
      if (infos.length === 0) return;
      const minStart = Math.min(...infos.map((i) => i.start));
      const grabInfo = infos.find((i) => i.id === hit.clip.id) ?? infos[0];
      dragRef.current = {
        kind: 'move', ids: sel, grabId: hit.clip.id, infos, minStart,
        offsets: infos.flatMap((i) => [i.start - minStart, i.end - minStart]),
        grabType: grabInfo.type, grabIdx: grabInfo.listIdx,
        vLen: seq2.videoTracks.length, aLen: seq2.audioTracks.length,
        downX: x, downClientX: e.clientX, downClientY: e.clientY,
        candidates: snapCandidates(useStudio.getState(), seq2, new Set(sel)),
        dup: e.altKey, moved: false, inTx: false, applied: 0, appliedTrack: 0,
        pendDelta: 0, pendTrack: 0, collapse: already && !additive,
      };
      return;
    }
    // empty area → marquee select
    dragRef.current = { kind: 'marquee', x0: x, y0: y, base: e.shiftKey ? st.ui.selection : [], additive: e.shiftKey, moved: false };
  };

  const updateHover = (e: React.PointerEvent, x: number) => {
    const vp = viewportRef.current;
    if (!vp) return;
    const st = useStudio.getState();
    const seqNow = getActiveSequence(st);
    const clipEl = (e.target as HTMLElement).closest?.('[data-clip-id]') as HTMLElement | null;
    const hit = clipEl?.dataset.clipId ? findClip(seqNow, clipEl.dataset.clipId) : null;
    let cursor = 'default';
    let razorT: number | null = null;
    switch (tool) {
      case 'razor': cursor = 'crosshair'; razorT = snapToFrame(Math.max(0, x / zoom), FPS); break;
      case 'hand': cursor = 'grab'; break;
      case 'zoom': cursor = e.altKey ? 'zoom-out' : 'zoom-in'; break;
      case 'slip': case 'slide': cursor = hit ? 'ew-resize' : 'default'; break;
      case 'ripple': case 'rolling': cursor = hit ? 'col-resize' : 'default'; break;
      case 'rate-stretch': cursor = hit && edgeAt(hit.clip, x, zoom, 10) === 'out' ? 'col-resize' : 'default'; break;
      case 'track-select-forward': case 'track-select-backward': cursor = 'e-resize'; break;
      default: cursor = hit && edgeAt(hit.clip, x, zoom, EDGE_PX) ? 'ew-resize' : 'default';
    }
    vp.style.cursor = cursor;
    setOverlay({ razorT });
  };

  const onLanePointerMove = (e: React.PointerEvent) => {
    const pos = contentPos(e);
    if (!pos) return;
    const { x, y } = pos;
    const d = dragRef.current;
    if (!d) { updateHover(e, x); return; }
    const st = useStudio.getState();

    switch (d.kind) {
      case 'hand': {
        st.setScrollX(d.scroll0 - (e.clientX - d.downX));
        if (vScrollRef.current) vScrollRef.current.scrollTop = d.top0 - (e.clientY - d.downY);
        return;
      }
      case 'marquee': {
        if (!d.moved && Math.abs(x - d.x0) < 3 && Math.abs(y - d.y0) < 3) return;
        d.moved = true;
        const rx0 = Math.min(d.x0, x);
        const rx1 = Math.max(d.x0, x);
        const ry0 = Math.min(d.y0, y);
        const ry1 = Math.max(d.y0, y);
        const ids = new Set(d.base);
        for (const lane of layout.lanes) {
          if (lane.top > ry1 || lane.top + lane.height < ry0) continue;
          for (const c of lane.track.clips) {
            if (c.start * zoom < rx1 && c.end * zoom > rx0) ids.add(c.id);
          }
        }
        st.setSelection([...ids]);
        setOverlay({ marquee: { x: rx0, y: ry0, w: rx1 - rx0, h: ry1 - ry0 } });
        return;
      }
      case 'move': {
        if (!d.moved && Math.abs(e.clientX - d.downClientX) < 3 && Math.abs(e.clientY - d.downClientY) < 3) return;
        d.moved = true;
        const raw = d.minStart + (x - d.downX) / zoom;
        const snapRes = applyBlockSnap(Math.max(0, raw), d.offsets, d.candidates, zoom, snapping);
        const total = Math.max(0, snapRes.origin) - d.minStart;
        const lane = laneAtY(layout, y);
        let td = d.pendTrack;
        if (lane && lane.type === d.grabType) td = lane.listIdx - d.grabIdx;
        d.pendDelta = total;
        d.pendTrack = td;
        if (d.dup) {
          const ghosts: GhostRect[] = d.infos.map((info) => {
            const len = info.type === 'video' ? d.vLen : d.aLen;
            const li = Math.max(0, Math.min(len - 1, info.listIdx + td));
            const lane2 = layout.lanes.find((l) => l.type === info.type && l.listIdx === li);
            return {
              left: (info.start + total) * zoom, width: Math.max(2, (info.end - info.start) * zoom),
              top: lane2?.top ?? 0, height: lane2?.height ?? 24,
            };
          });
          setOverlay({ snapLine: snapRes.snapLine, ghosts });
        } else {
          if (total !== d.applied || td !== d.appliedTrack) {
            if (d.inTx) st.cancelTransaction();
            st.beginTransaction('Move');
            d.inTx = true;
            st.moveClips(d.ids, total, td);
            d.applied = total;
            d.appliedTrack = td;
          }
          setOverlay({ snapLine: snapRes.snapLine });
        }
        return;
      }
      case 'trim': {
        d.moved = true;
        if (!d.inTx) { st.beginTransaction(d.ripple ? 'Ripple Trim' : 'Trim'); d.inTx = true; }
        const r = applySnap(x / zoom, d.candidates, zoom, snapping);
        st.trimClip(d.clipId, d.edge, r.time, d.ripple);
        setOverlay({ snapLine: r.snapLine });
        return;
      }
      case 'roll': {
        d.moved = true;
        if (!d.inTx) { st.beginTransaction('Rolling Edit'); d.inTx = true; }
        const r = applySnap(x / zoom, d.candidates, zoom, snapping);
        st.rollEdit(d.clipId, d.edge, r.time);
        setOverlay({ snapLine: r.snapLine });
        return;
      }
      case 'rate': {
        d.moved = true;
        if (!d.inTx) { st.beginTransaction('Rate Stretch'); d.inTx = true; }
        const r = applySnap(x / zoom, d.candidates, zoom, snapping);
        st.rateStretchTo(d.clipId, r.time);
        setOverlay({ snapLine: r.snapLine });
        return;
      }
      case 'slip': {
        d.moved = true;
        if (!d.inTx) { st.beginTransaction('Slip'); d.inTx = true; }
        const cur = x / zoom;
        st.slipClip(d.clipId, cur - d.lastT);
        d.lastT = cur;
        return;
      }
      case 'slide': {
        d.moved = true;
        if (!d.inTx) { st.beginTransaction('Slide'); d.inTx = true; }
        const desired = x / zoom - d.downT;
        const f = findClip(getActiveSequence(st), d.clipId);
        if (!f) return;
        st.slideClip(d.clipId, desired - (f.clip.start - d.start0));
        return;
      }
    }
  };

  const onLanePointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    setOv(EMPTY_OV);
    if (viewportRef.current && tool === 'hand') viewportRef.current.style.cursor = 'grab';
    if (!d) return;
    const st = useStudio.getState();
    switch (d.kind) {
      case 'move':
        if (d.dup && d.moved) commitDuplicate(d);
        else if (d.inTx) {
          if (d.applied === 0 && d.appliedTrack === 0) st.cancelTransaction();
          else st.endTransaction();
        } else if (!d.moved && d.collapse) st.selectClip(d.grabId, false);
        break;
      case 'trim': case 'roll': case 'rate': case 'slip': case 'slide':
        if (d.inTx) st.endTransaction();
        break;
      case 'marquee':
        if (!d.moved && !d.additive) st.clearSelection();
        break;
      case 'hand': break;
    }
  };

  // ---------------- context menu / double-click ----------------

  const onLaneContext = (e: React.MouseEvent) => {
    e.preventDefault();
    const pos = contentPos(e);
    if (!pos) return;
    const { x, y } = pos;
    const t = snapToFrame(Math.max(0, x / zoom), FPS);
    const st = useStudio.getState();
    const seqNow = getActiveSequence(st);
    const target = e.target as HTMLElement;

    const ribbon = target.closest('[data-transition-edge]') as HTMLElement | null;
    if (ribbon) {
      const clipId = ribbon.dataset.clipId ?? '';
      const edge: 'in' | 'out' = ribbon.dataset.transitionEdge === 'out' ? 'out' : 'in';
      const f = findClip(seqNow, clipId);
      const tr = edge === 'in' ? f?.clip.transitionIn : f?.clip.transitionOut;
      openMenu(e, [
        {
          label: 'デュレーションを設定…',
          onClick: () => {
            const v = window.prompt('トランジションのデュレーション(秒):', String(tr?.duration ?? 1));
            const durV = v ? parseFloat(v) : NaN;
            if (isFinite(durV) && durV > 0) {
              st.updateTransition(clipId, edge, { duration: Math.max(1 / FPS, snapToFrame(durV, FPS)) });
            }
          },
        },
        { separator: true },
        { label: 'トランジションを削除', onClick: () => st.removeTransition(clipId, edge) },
      ]);
      return;
    }

    const clipEl = target.closest('[data-clip-id]') as HTMLElement | null;
    const f = clipEl?.dataset.clipId ? findClip(seqNow, clipEl.dataset.clipId) : null;
    if (f) {
      if (!st.ui.selection.includes(f.clip.id)) st.selectClip(f.clip.id, false);
      const sel = useStudio.getState().ui.selection;
      openMenu(e, clipMenuItems(f.clip, f.track, sel, t));
      return;
    }

    const lane = laneAtY(layout, y);
    openMenu(e, [
      { label: '間隔を詰める', disabled: !lane, onClick: () => { if (lane) st.closeGap(lane.track.id, t); } },
      { label: 'ペースト', disabled: !st.ui.clipboard?.length, onClick: () => st.pasteClips(t) },
      { separator: true },
      { label: 'マーカーを追加', onClick: () => st.addMarker(t) },
    ]);
  };

  const onLaneDouble = (e: React.MouseEvent) => {
    const clipEl = (e.target as HTMLElement).closest('[data-clip-id]') as HTMLElement | null;
    if (!clipEl?.dataset.clipId) return;
    const st = useStudio.getState();
    const f = findClip(getActiveSequence(st), clipEl.dataset.clipId);
    if (!f) return;
    const asset = getAsset(st.project, f.clip.assetId);
    if (asset?.type === 'sequence' && asset.sequenceId) st.setActiveSequence(asset.sequenceId);
  };

  // ---------------- drag & drop targets ----------------

  const onDragOver = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    const pos = contentPos(e);
    if (!pos) return;
    const { x, y } = pos;
    if (types.includes(DND_ASSET)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const lane = laneAtY(layout, y);
      const st = useStudio.getState();
      const r = applySnap(Math.max(0, x / zoom), snapCandidates(st, seq), zoom, snapping);
      setOverlay({
        dropTrackId: lane?.track.id ?? null,
        dropGhost: lane ? { x: r.time * zoom, w: Math.max(24, 3 * zoom), top: lane.top, h: lane.height } : null,
        snapLine: r.snapLine,
        dropClipId: null,
      });
    } else if (types.includes(DND_EFFECT) || types.includes(DND_TRANSITION)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const clipEl = (e.target as HTMLElement).closest?.('[data-clip-id]') as HTMLElement | null;
      setOverlay({ dropClipId: clipEl?.dataset.clipId ?? null, dropGhost: null, dropTrackId: null });
    }
  };

  const onDragLeave = (e: React.DragEvent) => {
    if (viewportRef.current && e.relatedTarget instanceof Node && viewportRef.current.contains(e.relatedTarget)) return;
    setOverlay({ dropGhost: null, dropTrackId: null, dropClipId: null, snapLine: null });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const pos = contentPos(e);
    const st = useStudio.getState();
    const seqNow = getActiveSequence(st);
    try {
      if (!pos) return;
      const { x, y } = pos;
      const t = Math.max(0, x / zoom);
      const assetRaw = e.dataTransfer.getData(DND_ASSET);
      if (assetRaw) {
        const payload = JSON.parse(assetRaw) as { assetId: string; srcIn?: number; srcOut?: number };
        const asset = getAsset(st.project, payload.assetId);
        if (asset) {
          const wantsAudio = asset.type === 'audio';
          const lane = laneAtY(layout, y);
          let track: Track | null = lane && (lane.type === 'audio') === wantsAudio ? lane.track : null;
          if (!track) {
            const list = wantsAudio ? seqNow.audioTracks : seqNow.videoTracks;
            track = list.find((tr) => tr.sourcePatch) ?? list[0] ?? null;
          }
          if (track) {
            const r = applySnap(t, snapCandidates(st, seqNow), zoom, st.ui.snapping);
            st.addClipFromAsset(asset.id, track.id, r.time, payload.srcIn, payload.srcOut);
          }
        }
        return;
      }
      const clipEl = (e.target as HTMLElement).closest?.('[data-clip-id]') as HTMLElement | null;
      const clipId = clipEl?.dataset.clipId ?? null;
      const fxRaw = e.dataTransfer.getData(DND_EFFECT);
      if (fxRaw && clipId) {
        const { effectId } = JSON.parse(fxRaw) as { effectId: string };
        st.addEffectToClips([clipId], effectId);
        return;
      }
      const trRaw = e.dataTransfer.getData(DND_TRANSITION);
      if (trRaw && clipId) {
        const { type } = JSON.parse(trRaw) as { type: string };
        const f = findClip(seqNow, clipId);
        if (f) {
          const edge: 'in' | 'out' = t < (f.clip.start + f.clip.end) / 2 ? 'in' : 'out';
          st.addTransition(clipId, edge, type, 1);
        }
      }
    } catch { /* malformed drag payload — ignore */ }
    finally {
      setOverlay({ dropGhost: null, dropTrackId: null, dropClipId: null, snapLine: null });
    }
  };

  // ---------------- overlay helpers ----------------

  const dropLaneHighlight = () => {
    const lane = layout.lanes.find((l) => l.track.id === ov.dropTrackId);
    if (!lane) return null;
    return (
      <div style={{
        position: 'absolute', left: 0, right: 0, top: lane.top, height: lane.height,
        background: 'rgba(45,140,235,0.08)', boxShadow: 'inset 0 0 0 1px var(--accent)',
        zIndex: 24, pointerEvents: 'none',
      }} />
    );
  };

  const dropClipHighlight = () => {
    const f = ov.dropClipId ? findClip(seq, ov.dropClipId) : null;
    if (!f) return null;
    const lane = layout.lanes.find((l) => l.track.id === f.track.id);
    if (!lane) return null;
    return (
      <div style={{
        position: 'absolute', left: f.clip.start * zoom, width: Math.max(2, (f.clip.end - f.clip.start) * zoom),
        top: lane.top, height: lane.height, boxShadow: 'inset 0 0 0 2px var(--accent-bright)',
        borderRadius: 2, zIndex: 26, pointerEvents: 'none',
      }} />
    );
  };

  // ---------------- render ----------------

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', fontSize: 11, minWidth: 0 }}>
      {/* sequence tabs */}
      <div style={{
        height: TABS_H, flex: 'none', display: 'flex', alignItems: 'stretch',
        background: 'var(--bg-panel-header)', borderBottom: '1px solid var(--border)',
        overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {sequences.map((sq) => (
          <div
            key={sq.id}
            className={`panel-tab ${sq.id === activeId ? 'active' : ''}`}
            onClick={() => useStudio.getState().setActiveSequence(sq.id)}
            title={sq.name}
          >
            {sq.name}
          </div>
        ))}
      </div>

      {/* ruler row */}
      <div style={{ height: RULER_H, flex: 'none', display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel-header)' }}>
        <CornerCell />
        <TimelineRuler />
      </div>

      {/* track headers + lanes (shared vertical scroll) */}
      <div
        ref={vScrollRef}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          display: 'flex', alignItems: 'stretch', background: 'var(--bg-timeline)',
        }}
      >
        <div style={{ width: HEADER_W, flex: 'none', position: 'relative', height: layout.totalHeight, borderRight: '1px solid var(--border)' }}>
          {layout.lanes.map((l) => (
            <TrackHeader key={l.track.id} track={l.track} top={l.top} height={l.height} />
          ))}
          <div style={{ position: 'absolute', left: 0, right: 0, top: layout.dividerTop, height: DIVIDER_H, background: 'var(--bg-inset)' }} />
        </div>

        <div
          ref={viewportRef}
          onPointerDown={onLanePointerDown}
          onPointerMove={onLanePointerMove}
          onPointerUp={onLanePointerUp}
          onPointerLeave={() => { if (!dragRef.current) setOverlay({ razorT: null }); }}
          onContextMenu={onLaneContext}
          onDoubleClick={onLaneDouble}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{
            flex: 1, minWidth: 0, minHeight: layout.totalHeight,
            position: 'relative', overflow: 'hidden', touchAction: 'none',
          }}
        >
          <div
            ref={contentRef}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: contentW, transform: `translateX(${-scrollX}px)` }}
          >
            {layout.lanes.map((l) => (
              <LaneRow
                key={l.track.id}
                track={l.track}
                top={l.top}
                height={l.height}
                zoom={zoom}
                vis0={vis0}
                vis1={vis1}
                assetMap={assetMap}
                selSet={selSet}
              />
            ))}
            <div style={{ position: 'absolute', left: 0, right: 0, top: layout.dividerTop, height: DIVIDER_H, background: 'var(--bg-inset)' }} />

            {/* overlays */}
            {ov.dropTrackId && dropLaneHighlight()}
            {ov.dropClipId && dropClipHighlight()}
            {ov.dropGhost && (
              <div style={{
                position: 'absolute', left: ov.dropGhost.x, width: ov.dropGhost.w,
                top: ov.dropGhost.top, height: ov.dropGhost.h,
                background: 'rgba(45,140,235,0.25)', border: '1px dashed var(--accent-bright)',
                zIndex: 27, pointerEvents: 'none',
              }} />
            )}
            {ov.ghosts?.map((g, i) => (
              <div key={i} style={{
                position: 'absolute', left: g.left, width: g.width, top: g.top, height: g.height,
                background: 'rgba(255,255,255,0.18)', border: '1px solid rgba(255,255,255,0.55)',
                borderRadius: 2, zIndex: 28, pointerEvents: 'none',
              }} />
            ))}
            {ov.marquee && (
              <div style={{
                position: 'absolute', left: ov.marquee.x, top: ov.marquee.y, width: ov.marquee.w, height: ov.marquee.h,
                background: 'rgba(45,140,235,0.12)', border: '1px solid var(--accent)',
                zIndex: 29, pointerEvents: 'none',
              }} />
            )}
            {ov.razorT != null && (
              <div style={{
                position: 'absolute', left: ov.razorT * zoom, top: 0, bottom: 0, width: 1,
                background: 'rgba(255,255,255,0.75)', zIndex: 30, pointerEvents: 'none',
              }} />
            )}
            {ov.snapLine != null && (
              <div style={{
                position: 'absolute', left: ov.snapLine * zoom, top: 0, bottom: 0, width: 1,
                background: '#fff', zIndex: 31, pointerEvents: 'none',
              }} />
            )}
            <PlayheadLine />
          </div>
        </div>
      </div>

      {/* bottom zoom / scroll bar */}
      <div style={{
        height: 20, flex: 'none', display: 'flex', alignItems: 'center', gap: 6,
        borderTop: '1px solid var(--border)', background: 'var(--bg-panel)', padding: '0 6px',
      }}>
        <button className="icon-btn" title="全体を表示" onClick={fitToView} style={{ width: 22, height: 16, fontSize: 10 }}>
          &#10530;
        </button>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={zoomToSlider(zoom)}
          onChange={(e) => {
            const st = useStudio.getState();
            const nz = sliderToZoom(parseFloat(e.target.value));
            const tc = (st.ui.scrollX + viewW / 2) / st.ui.zoom;
            st.setZoom(nz);
            st.setScrollX(tc * nz - viewW / 2);
          }}
          title="ズーム (Alt+ホイール)"
          style={{ width: 130, height: 12 }}
        />
        <div ref={hScrollRef} onScroll={onHScroll} style={{ flex: 1, minWidth: 0, height: '100%', overflowX: 'auto', overflowY: 'hidden' }}>
          <div style={{ width: contentW, height: 1 }} />
        </div>
      </div>

      {menuEl}
    </div>
  );
}
