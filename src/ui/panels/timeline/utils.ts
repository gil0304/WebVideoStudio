// ============================================================
// Timeline panel — shared geometry / snapping helpers.
// ============================================================

import type { Marker, Sequence, Track } from '../../../model/types';
import type { StudioState } from '../../../state/store';
import { snapToFrame } from '../../../engine/timecode';

export const FPS = 30;
export const HEADER_W = 180;
export const RULER_H = 28;
export const TABS_H = 26;
export const DIVIDER_H = 5;
export const MIN_TRACK_H = 24;
export const MAX_TRACK_H = 240;
export const EDGE_PX = 6;

export interface LaneInfo {
  track: Track;
  type: 'video' | 'audio';
  /** Index into seq.videoTracks / seq.audioTracks. */
  listIdx: number;
  top: number;
  height: number;
}

export interface LaneLayout {
  lanes: LaneInfo[];
  dividerTop: number;
  totalHeight: number;
}

/** Lane geometry: V-tracks top-down (Vn..V1), thin divider, A1..An. */
export function computeLaneLayout(seq: Sequence): LaneLayout {
  const lanes: LaneInfo[] = [];
  let y = 0;
  for (let i = seq.videoTracks.length - 1; i >= 0; i--) {
    const t = seq.videoTracks[i];
    lanes.push({ track: t, type: 'video', listIdx: i, top: y, height: t.height });
    y += t.height + 1;
  }
  const dividerTop = y;
  y += DIVIDER_H;
  for (let i = 0; i < seq.audioTracks.length; i++) {
    const t = seq.audioTracks[i];
    lanes.push({ track: t, type: 'audio', listIdx: i, top: y, height: t.height });
    y += t.height + 1;
  }
  return { lanes, dividerTop, totalHeight: y };
}

export function laneAtY(layout: LaneLayout, y: number): LaneInfo | null {
  for (const l of layout.lanes) {
    if (y >= l.top && y < l.top + l.height) return l;
  }
  return null;
}

/** All snap candidate times: playhead, clip edges, markers, in/out, 0. */
export function snapCandidates(state: StudioState, seq: Sequence, excludeClipIds?: Set<string>): number[] {
  const out: number[] = [0];
  const ui = state.ui;
  out.push(ui.playheads[ui.activeSequenceId] ?? 0);
  for (const track of [...seq.videoTracks, ...seq.audioTracks]) {
    for (const c of track.clips) {
      if (excludeClipIds?.has(c.id)) continue;
      out.push(c.start, c.end);
    }
  }
  for (const m of seq.markers) out.push(m.time);
  const sIn = ui.seqIn[ui.activeSequenceId];
  const sOut = ui.seqOut[ui.activeSequenceId];
  if (sIn != null) out.push(sIn);
  if (sOut != null) out.push(sOut);
  return out;
}

/** Snap a single time. Returns the frame-snapped time plus the candidate hit (if any). */
export function applySnap(
  t: number, candidates: number[], zoom: number, snappingOn: boolean,
): { time: number; snapLine: number | null } {
  if (snappingOn) {
    const thresh = 8 / zoom;
    let best: number | null = null;
    let bestD = Infinity;
    for (const c of candidates) {
      const d = Math.abs(c - t);
      if (d < thresh && d < bestD) { bestD = d; best = c; }
    }
    if (best != null) return { time: best, snapLine: best };
  }
  return { time: snapToFrame(Math.max(0, t), FPS), snapLine: null };
}

/**
 * Snap a whole dragged block: `offsets` are edge offsets relative to the block
 * origin. Finds the candidate that best matches any edge and shifts the origin.
 */
export function applyBlockSnap(
  origin: number, offsets: number[], candidates: number[], zoom: number, snappingOn: boolean,
): { origin: number; snapLine: number | null } {
  if (snappingOn) {
    const thresh = 8 / zoom;
    let bestShift = 0;
    let bestD = Infinity;
    let bestLine: number | null = null;
    for (const o of offsets) {
      const edge = origin + o;
      for (const c of candidates) {
        const d = Math.abs(c - edge);
        if (d < thresh && d < bestD) { bestD = d; bestShift = c - edge; bestLine = c; }
      }
    }
    if (bestLine != null) return { origin: origin + bestShift, snapLine: bestLine };
  }
  return { origin: snapToFrame(origin, FPS), snapLine: null };
}

export const MARKER_HEX: Record<Marker['color'], string> = {
  green: '#4caf6e', red: '#e05555', purple: '#9a57b5', orange: '#e0913c',
  yellow: '#c7b45a', white: '#d8d8d8', blue: '#2d8ceb', cyan: '#27c3d4',
};

export function clipFillColor(assetType: string | undefined, trackType: 'video' | 'audio'): string {
  if (trackType === 'audio') return 'var(--clip-audio)';
  switch (assetType) {
    case 'audio': return 'var(--clip-audio)';
    case 'graphic': return 'var(--clip-graphic)';
    case 'adjustment': return 'var(--clip-adjustment)';
    case 'sequence': return 'var(--clip-nested)';
    default: return 'var(--clip-video)';
  }
}

/** Japanese display names for transition ids (ids themselves never change). */
const TRANSITION_NAMES_JA: Record<string, string> = {
  'cross-dissolve': 'クロスディゾルブ',
  'dip-to-black': '暗転',
  'dip-to-white': '明転',
  wipe: 'ワイプ',
  slide: 'スライド',
  push: 'プッシュ',
  zoom: 'ズーム',
  iris: 'アイリス',
  'blur-dissolve': 'ブラーディゾルブ',
  'constant-gain': 'コンスタントゲイン',
  'constant-power': 'コンスタントパワー',
  'exponential-fade': '指数フェード',
};

export function prettyTransitionName(type: string): string {
  return TRANSITION_NAMES_JA[type]
    ?? type.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
