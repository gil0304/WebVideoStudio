// ============================================================
// Studio store — single source of truth for the project data
// model, editing operations (all undoable), tool state and
// transport. UI panels call these actions; the render/audio
// engines read the resulting edit graph.
// ============================================================

import { create } from 'zustand';
import type {
  CaptionItem, CaptionStyle, Interp, LabelColor, Marker, MaskShape, MediaAsset,
  Prop, Sequence, TextLayer, TimelineClip, Track, Transition, VideoProject,
} from '../model/types';
import { clipSourceOut, findClip, getAsset, getSequence, prop, sequenceDuration } from '../model/types';
import { uid } from '../model/ids';
import { buildDemoProject } from '../model/demoProject';
import { defaultTextLayer, makeClip, makeTrack } from '../model/clipFactory';
import { createEffectInstance, getEffectDef } from '../engine/effects';
import { snapToFrame } from '../engine/timecode';
import { upsertKeyframe, evalProp } from '../engine/keyframes';
import { registerBlob } from '../engine/sources';

export type ToolId =
  | 'selection' | 'track-select-forward' | 'track-select-backward' | 'ripple' | 'rolling'
  | 'rate-stretch' | 'razor' | 'slip' | 'slide' | 'pen' | 'hand' | 'zoom' | 'type';

export type PropTarget =
  | { kind: 'intrinsic'; key: 'position' | 'scale' | 'scaleWidth' | 'rotation' | 'anchor' | 'opacity' | 'volume' | 'pan' }
  | { kind: 'effect'; instanceId: string; key: string }
  | { kind: 'mask'; maskId: string; key: 'cx' | 'cy' | 'rx' | 'ry' | 'feather' | 'opacity' };

export interface SourceMonitorState {
  assetId: string | null;
  time: number;
  inPoint: number | null;
  outPoint: number | null;
  playing: boolean;
}

export interface HistoryEntry {
  label: string;
  project: VideoProject;
}

interface UIState {
  activeSequenceId: string;
  workspace: string;
  tool: ToolId;
  selection: string[];
  selectedAssetIds: string[];
  playheads: Record<string, number>;
  seqIn: Record<string, number | null>;
  seqOut: Record<string, number | null>;
  zoom: number;
  scrollX: number;
  source: SourceMonitorState;
  playing: boolean;
  loop: boolean;
  playbackResolution: number;
  snapping: boolean;
  showSafeMargins: boolean;
  transparencyGrid: boolean;
  selectedEffectInstanceId: string | null;
  editingTextLayer: { clipId: string; layerId: string } | null;
  selectedTextLayerId: string | null;
  exportOpen: boolean;
  homeOpen: boolean;
  droppedFrames: number;
  currentBinId: string | null;
  openBins: Record<string, boolean>;
  projectViewMode: 'list' | 'icon';
  clipboard: TimelineClip[] | null;
  clipboardTrackIdx: Record<string, { type: 'video' | 'audio'; idx: number }>;
  lastSaveTime: number;
  saving: boolean;
  statusMessage: string | null;
  /** Cross-panel modal dialogs: 'speed-duration' | 'new-sequence' | 'sequence-settings' | 'preferences' | 'keyboard-shortcuts' | 'about' | null */
  openDialog: string | null;
  /** Payload for openDialog (e.g. target clip id). */
  dialogPayload: unknown;
}

export interface StudioState {
  project: VideoProject;
  ui: UIState;
  past: HistoryEntry[];
  future: HistoryEntry[];
  transaction: { label: string; base: VideoProject } | null;

  // ---- generic mutation (undoable) ----
  mutate: (label: string, fn: (p: VideoProject) => void) => void;
  beginTransaction: (label: string) => void;
  liveMutate: (fn: (p: VideoProject) => void) => void;
  endTransaction: () => void;
  cancelTransaction: () => void;
  undo: () => void;
  redo: () => void;

  // ---- transport / view ----
  setTool: (t: ToolId) => void;
  setWorkspace: (w: string) => void;
  setActiveSequence: (id: string) => void;
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  togglePlay: () => void;
  stepFrames: (n: number) => void;
  goToStart: () => void;
  goToEnd: () => void;
  setLoop: (l: boolean) => void;
  setPlaybackResolution: (r: number) => void;
  setZoom: (z: number) => void;
  setScrollX: (x: number) => void;
  setSnapping: (s: boolean) => void;
  setUi: (patch: Partial<UIState>) => void;
  setSeqIn: (t: number | null) => void;
  setSeqOut: (t: number | null) => void;
  goToNextMarker: () => void;
  goToPrevMarker: () => void;
  goToNextEdit: () => void;
  goToPrevEdit: () => void;

  // ---- selection ----
  selectClip: (id: string, additive?: boolean) => void;
  setSelection: (ids: string[]) => void;
  clearSelection: () => void;
  selectAllClips: () => void;
  selectTrackForward: (clipId: string, backward?: boolean) => void;

  // ---- clip editing ----
  moveClips: (ids: string[], deltaTime: number, trackDelta: number) => void;
  trimClip: (clipId: string, edge: 'in' | 'out', newTime: number, ripple: boolean) => void;
  rollEdit: (clipId: string, edge: 'in' | 'out', newTime: number) => void;
  slipClip: (clipId: string, delta: number) => void;
  slideClip: (clipId: string, delta: number) => void;
  razorAtTime: (time: number, allTracks: boolean) => void;
  razorClip: (clipId: string, time: number) => void;
  deleteClips: (ids: string[], ripple: boolean) => void;
  liftRange: () => void;
  extractRange: () => void;
  closeGap: (trackId: string, gapStart: number) => void;
  duplicateClips: (ids: string[]) => void;
  copyClips: (ids: string[]) => void;
  pasteClips: (atTime?: number) => void;
  setClipSpeed: (clipId: string, speed: number, ripple: boolean) => void;
  rateStretchTo: (clipId: string, newEnd: number) => void;
  toggleClipEnabled: (ids: string[]) => void;
  patchClip: (clipId: string, patch: Partial<TimelineClip>, label?: string) => void;
  linkClips: (aId: string, bId: string) => void;
  unlinkClip: (id: string) => void;
  groupClips: (ids: string[]) => void;
  ungroupClips: (ids: string[]) => void;
  nestClips: (ids: string[], name: string) => void;
  addClipFromAsset: (assetId: string, trackId: string, start: number, srcIn?: number, srcOut?: number) => void;
  insertEdit: (assetId: string, time: number, srcIn?: number, srcOut?: number) => void;
  overwriteEdit: (assetId: string, time: number, srcIn?: number, srcOut?: number) => void;

  // ---- tracks ----
  addTrack: (type: 'video' | 'audio') => void;
  deleteTrack: (trackId: string) => void;
  patchTrack: (trackId: string, patch: Partial<Track>, label?: string, transient?: boolean) => void;

  // ---- markers ----
  addMarker: (time?: number, patch?: Partial<Marker>) => void;
  updateMarker: (id: string, patch: Partial<Marker>) => void;
  removeMarker: (id: string) => void;

  // ---- transitions ----
  addTransition: (clipId: string, edge: 'in' | 'out', type: string, duration?: number) => void;
  removeTransition: (clipId: string, edge: 'in' | 'out') => void;
  updateTransition: (clipId: string, edge: 'in' | 'out', patch: Partial<Transition>) => void;

  // ---- animatable properties / keyframes ----
  setPropValue: (clipId: string, target: PropTarget, value: number | number[], atTime?: number) => void;
  toggleAnimated: (clipId: string, target: PropTarget, atTime: number) => void;
  addKeyframe: (clipId: string, target: PropTarget, time: number) => void;
  removeKeyframe: (clipId: string, target: PropTarget, kfId: string) => void;
  moveKeyframe: (clipId: string, target: PropTarget, kfId: string, newTime: number, newValue?: number | number[]) => void;
  setKeyframeInterp: (clipId: string, target: PropTarget, kfId: string, interp: Interp) => void;

  // ---- effects ----
  addEffectToClips: (clipIds: string[], effectId: string) => void;
  removeEffect: (clipId: string, instanceId: string) => void;
  toggleEffect: (clipId: string, instanceId: string) => void;
  moveEffect: (clipId: string, from: number, to: number) => void;

  // ---- masks ----
  addMask: (clipId: string, type: 'rectangle' | 'ellipse') => void;
  removeMask: (clipId: string, maskId: string) => void;
  patchMask: (clipId: string, maskId: string, patch: Partial<MaskShape>) => void;

  // ---- text / graphics ----
  addGraphicClip: (start: number, text: string) => void;
  addTextLayer: (clipId: string, patch?: Partial<TextLayer>) => void;
  patchTextLayer: (clipId: string, layerId: string, patch: Partial<TextLayer>, label?: string) => void;
  removeTextLayer: (clipId: string, layerId: string) => void;

  // ---- captions ----
  addCaption: (start: number, end: number, text: string) => void;
  patchCaption: (id: string, patch: Partial<CaptionItem>) => void;
  removeCaption: (id: string) => void;
  setCaptionStyle: (patch: Partial<CaptionStyle>) => void;
  toggleCaptionsVisible: () => void;
  importCaptions: (items: { start: number; end: number; text: string }[]) => void;

  // ---- project panel ----
  importFiles: (files: FileList | File[]) => Promise<void>;
  createBin: (name: string, parentId: string | null) => void;
  renameAsset: (id: string, name: string) => void;
  renameBin: (id: string, name: string) => void;
  deleteAssets: (ids: string[]) => void;
  deleteBin: (id: string) => void;
  moveAssetToBin: (assetId: string, binId: string | null) => void;
  setAssetLabel: (ids: string[], label: LabelColor) => void;
  createSequence: (name: string, width: number, height: number, fps: number) => void;
  duplicateSequenceAsset: (assetId: string) => void;

  // ---- source monitor ----
  openInSource: (assetId: string) => void;
  setSourceTime: (t: number) => void;
  setSourcePlaying: (p: boolean) => void;
  setSourceIn: (t: number | null) => void;
  setSourceOut: (t: number | null) => void;
  sourceInsert: () => void;
  sourceOverwrite: () => void;

  // ---- project lifecycle ----
  resetToDemo: () => void;
  loadProject: (p: VideoProject, uiPatch?: Partial<UIState>) => void;
  renameProject: (name: string) => void;
}

// ============ helpers ============

const fps = 30;
const snap = (t: number) => snapToFrame(Math.max(0, t), fps);

function activeSeq(p: VideoProject, ui: UIState): Sequence {
  return getSequence(p, ui.activeSequenceId) ?? p.sequences[0];
}

function allTracks(seq: Sequence): Track[] {
  return [...seq.videoTracks, ...seq.audioTracks];
}

function sortTrack(track: Track): void {
  track.clips.sort((a, b) => a.start - b.start);
}

/** Remove/trim clips overlapping [from,to) on a track (overwrite semantics). */
function removeRange(track: Track, from: number, to: number, skipIds: Set<string> = new Set()): void {
  const result: TimelineClip[] = [];
  for (const c of track.clips) {
    if (skipIds.has(c.id) || c.end <= from + 1e-6 || c.start >= to - 1e-6) {
      result.push(c);
      continue;
    }
    const overlapsLeft = c.start < from;
    const overlapsRight = c.end > to;
    if (overlapsLeft && overlapsRight) {
      // split into two
      const right: TimelineClip = structuredClone(c);
      right.id = uid('clip');
      right.inPoint = c.inPoint + (to - c.start) * Math.abs(c.speed);
      right.start = to;
      shiftKeyframes(right, to - c.start);
      right.transitionIn = undefined;
      c.end = from;
      c.transitionOut = undefined;
      result.push(c, right);
    } else if (overlapsLeft) {
      c.end = from;
      c.transitionOut = undefined;
      result.push(c);
    } else if (overlapsRight) {
      c.inPoint = c.inPoint + (to - c.start) * Math.abs(c.speed);
      shiftKeyframes(c, to - c.start);
      c.start = to;
      c.transitionIn = undefined;
      result.push(c);
    }
    // fully covered → dropped
  }
  track.clips = result;
  sortTrack(track);
}

function eachProp(clip: TimelineClip, fn: (p: Prop) => void): void {
  fn(clip.position); fn(clip.scale); fn(clip.scaleWidth); fn(clip.rotation);
  fn(clip.anchor); fn(clip.opacity); fn(clip.volume); fn(clip.pan);
  for (const e of clip.effects) for (const p of Object.values(e.params)) fn(p);
  for (const m of clip.masks) { fn(m.cx); fn(m.cy); fn(m.rx); fn(m.ry); fn(m.feather); fn(m.opacity); }
}

/** Keep keyframes anchored to media when the clip's left edge moves by `delta` seconds. */
function shiftKeyframes(clip: TimelineClip, delta: number): void {
  eachProp(clip, (p) => {
    for (const k of p.keyframes) k.time -= delta;
  });
}

function shiftClipsAfter(track: Track, time: number, delta: number): void {
  for (const c of track.clips) {
    if (c.start >= time - 1e-6) {
      c.start += delta;
      c.end += delta;
    }
  }
  sortTrack(track);
}

function resolveProp(clip: TimelineClip, target: PropTarget): Prop | null {
  if (target.kind === 'intrinsic') return clip[target.key] as Prop;
  if (target.kind === 'effect') {
    const inst = clip.effects.find((e) => e.id === target.instanceId);
    return inst?.params[target.key] ?? null;
  }
  const mask = clip.masks.find((m) => m.id === target.maskId);
  return mask ? (mask[target.key] as Prop) : null;
}

function splitClipAt(track: Track, clip: TimelineClip, time: number): [TimelineClip, TimelineClip] | null {
  if (time <= clip.start + 1 / fps / 2 || time >= clip.end - 1 / fps / 2) return null;
  const right: TimelineClip = structuredClone(clip);
  right.id = uid('clip');
  right.inPoint = clip.inPoint + (time - clip.start) * Math.abs(clip.speed);
  right.start = time;
  right.transitionIn = undefined;
  shiftKeyframes(right, time - clip.start);
  right.linkedClipId = undefined;
  right.name = clip.name;
  clip.end = time;
  clip.transitionOut = undefined;
  track.clips.push(right);
  sortTrack(track);
  return [clip, right];
}

let importCounter = 0;

// ============ store ============

export const useStudio = create<StudioState>((set, get) => {
  const demo = buildDemoProject();

  const mutate: StudioState['mutate'] = (label, fn) => {
    const { project, past, transaction } = get();
    if (transaction) {
      // inside a drag transaction: mutate live without pushing history
      const draft = structuredClone(project);
      fn(draft);
      draft.revision++;
      set({ project: draft });
      return;
    }
    const base = structuredClone(project);
    const draft = structuredClone(project);
    fn(draft);
    draft.revision++;
    set({
      project: draft,
      past: [...past, { label, project: base }].slice(-100),
      future: [],
    });
  };

  const uiSet = (patch: Partial<UIState>) => set((s) => ({ ui: { ...s.ui, ...patch } }));

  const seqOf = () => {
    const s = get();
    return activeSeq(s.project, s.ui);
  };
  const playheadOf = () => {
    const s = get();
    return s.ui.playheads[s.ui.activeSequenceId] ?? 0;
  };

  /** Insert clip into track with overwrite semantics. */
  const placeClip = (track: Track, clip: TimelineClip) => {
    removeRange(track, clip.start, clip.end);
    track.clips.push(clip);
    sortTrack(track);
  };

  const doInsertOrOverwrite = (assetId: string, time: number, srcIn: number | undefined, srcOut: number | undefined, insert: boolean) => {
    const s = get();
    const p = s.project;
    const asset = getAsset(p, assetId);
    if (!asset) return;
    const inP = srcIn ?? 0;
    const outP = srcOut ?? asset.duration;
    const dur = Math.max(1 / fps, outP - inP);
    const t0 = snap(time);
    mutate(insert ? 'Insert' : 'Overwrite', (draft) => {
      const seq = activeSeq(draft, s.ui);
      const isAudio = asset.type === 'audio';
      const vTrack = isAudio ? null : (seq.videoTracks.find((t) => t.sourcePatch) ?? seq.videoTracks[0]);
      const aTrack = (isAudio || asset.hasAudio) ? (seq.audioTracks.find((t) => t.sourcePatch) ?? seq.audioTracks[0]) : null;
      if (insert) {
        for (const track of allTracks(seq)) {
          if (!track.syncLocked && track !== vTrack && track !== aTrack) continue;
          if (track.locked) continue;
          for (const c of [...track.clips]) {
            if (c.start < t0 && c.end > t0) splitClipAt(track, c, t0);
          }
          shiftClipsAfter(track, t0, dur);
        }
      }
      const mk = (track: Track) => {
        if (track.locked) return;
        const clip = makeClip(asset, t0, t0 + dur, inP);
        placeClip(track, clip);
      };
      if (vTrack) mk(vTrack);
      if (aTrack && isAudio) mk(aTrack);
    });
  };

  return {
    project: demo,
    ui: {
      activeSequenceId: demo.sequences[0].id,
      workspace: 'Editing',
      tool: 'selection',
      selection: [],
      selectedAssetIds: [],
      playheads: { [demo.sequences[0].id]: 0 },
      seqIn: {},
      seqOut: {},
      zoom: 24,
      scrollX: 0,
      source: { assetId: null, time: 0, inPoint: null, outPoint: null, playing: false },
      playing: false,
      loop: false,
      playbackResolution: 0.5,
      snapping: true,
      showSafeMargins: false,
      transparencyGrid: false,
      selectedEffectInstanceId: null,
      editingTextLayer: null,
      selectedTextLayerId: null,
      exportOpen: false,
      homeOpen: false,
      droppedFrames: 0,
      currentBinId: null,
      openBins: {},
      projectViewMode: 'list',
      clipboard: null,
      clipboardTrackIdx: {},
      lastSaveTime: 0,
      saving: false,
      statusMessage: null,
      openDialog: null,
      dialogPayload: null,
    },
    past: [],
    future: [],
    transaction: null,

    mutate,
    beginTransaction: (label) => {
      const { project, transaction } = get();
      if (transaction) return;
      set({ transaction: { label, base: structuredClone(project) } });
    },
    liveMutate: (fn) => {
      const draft = structuredClone(get().project);
      fn(draft);
      draft.revision++;
      set({ project: draft });
    },
    endTransaction: () => {
      const { transaction, past, project } = get();
      if (!transaction) return;
      set({
        transaction: null,
        past: [...past, { label: transaction.label, project: transaction.base }].slice(-100),
        future: [],
      });
      void (project);
    },
    cancelTransaction: () => {
      const { transaction } = get();
      if (!transaction) return;
      set({ transaction: null, project: transaction.base });
    },
    undo: () => {
      const { past, future, project } = get();
      if (past.length === 0) return;
      const entry = past[past.length - 1];
      set({
        project: entry.project,
        past: past.slice(0, -1),
        future: [{ label: entry.label, project }, ...future].slice(0, 100),
      });
    },
    redo: () => {
      const { past, future, project } = get();
      if (future.length === 0) return;
      const entry = future[0];
      set({
        project: entry.project,
        future: future.slice(1),
        past: [...past, { label: entry.label, project }].slice(-100),
      });
    },

    // ---- transport / view ----
    setTool: (tool) => uiSet({ tool }),
    setWorkspace: (workspace) => uiSet({ workspace }),
    setActiveSequence: (id) => {
      const s = get();
      if (!getSequence(s.project, id)) return;
      uiSet({ activeSequenceId: id, selection: [], playing: false });
    },
    setPlayhead: (t) => {
      const s = get();
      const seq = seqOf();
      const dur = Math.max(sequenceDuration(seq), 1);
      const clamped = Math.max(0, Math.min(t, dur + 10));
      uiSet({ playheads: { ...s.ui.playheads, [s.ui.activeSequenceId]: clamped } });
    },
    setPlaying: (playing) => {
      const s = get();
      if (!playing && s.ui.playing) {
        // Capture the audio-clock position synchronously so a manual seek
        // right after pausing is never clobbered by the playback loop.
        void import('../engine/audioEngine').then(({ audioEngine }) => {
          const t = audioEngine.time;
          if (t !== null) {
            const cur = get();
            uiSet({ playheads: { ...cur.ui.playheads, [cur.ui.activeSequenceId]: t } });
          }
        });
      }
      uiSet({ playing });
    },
    togglePlay: () => get().setPlaying(!get().ui.playing),
    stepFrames: (n) => {
      const s = get();
      s.setPlaying(false);
      s.setPlayhead(snap(playheadOf() + n / fps));
    },
    goToStart: () => { get().setPlaying(false); get().setPlayhead(0); },
    goToEnd: () => { get().setPlaying(false); get().setPlayhead(sequenceDuration(seqOf())); },
    setLoop: (loop) => uiSet({ loop }),
    setPlaybackResolution: (playbackResolution) => uiSet({ playbackResolution }),
    setZoom: (zoom) => uiSet({ zoom: Math.max(1.5, Math.min(400, zoom)) }),
    setScrollX: (scrollX) => uiSet({ scrollX: Math.max(0, scrollX) }),
    setSnapping: (snapping) => uiSet({ snapping }),
    setUi: (patch) => uiSet(patch),
    setSeqIn: (t) => {
      const s = get();
      uiSet({ seqIn: { ...s.ui.seqIn, [s.ui.activeSequenceId]: t } });
    },
    setSeqOut: (t) => {
      const s = get();
      uiSet({ seqOut: { ...s.ui.seqOut, [s.ui.activeSequenceId]: t } });
    },
    goToNextMarker: () => {
      const t = playheadOf();
      const next = seqOf().markers.filter((m) => m.time > t + 1e-3).sort((a, b) => a.time - b.time)[0];
      if (next) get().setPlayhead(next.time);
    },
    goToPrevMarker: () => {
      const t = playheadOf();
      const prev = seqOf().markers.filter((m) => m.time < t - 1e-3).sort((a, b) => b.time - a.time)[0];
      if (prev) get().setPlayhead(prev.time);
    },
    goToNextEdit: () => {
      const t = playheadOf();
      const edits = allTracks(seqOf()).flatMap((tr) => tr.clips.flatMap((c) => [c.start, c.end]));
      const next = edits.filter((e) => e > t + 1e-3).sort((a, b) => a - b)[0];
      if (next !== undefined) get().setPlayhead(next);
    },
    goToPrevEdit: () => {
      const t = playheadOf();
      const edits = allTracks(seqOf()).flatMap((tr) => tr.clips.flatMap((c) => [c.start, c.end]));
      const prev = edits.filter((e) => e < t - 1e-3).sort((a, b) => b - a)[0];
      if (prev !== undefined) get().setPlayhead(prev);
    },

    // ---- selection ----
    selectClip: (id, additive) => {
      const s = get();
      const seq = seqOf();
      const found = findClip(seq, id);
      const ids = new Set(additive ? s.ui.selection : []);
      if (additive && ids.has(id)) {
        ids.delete(id);
        if (found?.clip.linkedClipId) ids.delete(found.clip.linkedClipId);
      } else {
        ids.add(id);
        if (found?.clip.linkedClipId) ids.add(found.clip.linkedClipId);
        if (found?.clip.groupId) {
          for (const t of allTracks(seq)) for (const c of t.clips) if (c.groupId === found.clip.groupId) ids.add(c.id);
        }
      }
      uiSet({ selection: [...ids] });
    },
    setSelection: (selection) => uiSet({ selection }),
    clearSelection: () => uiSet({ selection: [], selectedTextLayerId: null }),
    selectAllClips: () => uiSet({ selection: allTracks(seqOf()).flatMap((t) => t.clips.map((c) => c.id)) }),
    selectTrackForward: (clipId, backward) => {
      const seq = seqOf();
      const found = findClip(seq, clipId);
      if (!found) return;
      const ids: string[] = [];
      for (const t of allTracks(seq)) {
        for (const c of t.clips) {
          if (backward ? c.start <= found.clip.start : c.end >= found.clip.start) ids.push(c.id);
        }
      }
      uiSet({ selection: ids });
    },

    // ---- clip editing ----
    moveClips: (ids, deltaTime, trackDelta) => {
      const s = get();
      mutate('Move', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const moving: { clip: TimelineClip; track: Track }[] = [];
        for (const id of ids) {
          const f = findClip(seq, id);
          if (f && !f.track.locked) moving.push(f);
        }
        if (moving.length === 0) return;
        let dt = snap(Math.min(...moving.map((m) => m.clip.start)) + deltaTime) - Math.min(...moving.map((m) => m.clip.start));
        if (Math.min(...moving.map((m) => m.clip.start)) + dt < 0) dt = -Math.min(...moving.map((m) => m.clip.start));
        // compute target tracks
        const moves: { clip: TimelineClip; from: Track; to: Track }[] = [];
        for (const { clip, track } of moving) {
          let to = track;
          if (trackDelta !== 0) {
            const list = track.type === 'video' ? seq.videoTracks : seq.audioTracks;
            const idx = list.indexOf(track);
            const nIdx = Math.max(0, Math.min(list.length - 1, idx + trackDelta));
            to = list[nIdx];
          }
          moves.push({ clip, from: track, to });
        }
        const movingIds = new Set(ids);
        for (const { clip, from } of moves) {
          from.clips = from.clips.filter((c) => c.id !== clip.id);
        }
        for (const { clip, to } of moves) {
          clip.start += dt;
          clip.end += dt;
          removeRange(to, clip.start, clip.end, movingIds);
          to.clips.push(clip);
          sortTrack(to);
        }
      });
    },

    trimClip: (clipId, edge, newTime, ripple) => {
      const s = get();
      mutate(ripple ? 'Ripple Trim' : 'Trim', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const f = findClip(seq, clipId);
        if (!f || f.track.locked) return;
        const { clip, track } = f;
        const asset = getAsset(draft, clip.assetId);
        const minDur = 1 / fps;
        const t = snap(newTime);
        if (edge === 'in') {
          const maxIn = clip.end - minDur;
          const sourceRoom = clip.speed === 0 ? Infinity : clip.inPoint / Math.abs(clip.speed || 1);
          const minIn = Math.max(0, clip.start - sourceRoom, track.clips.filter((c) => c.id !== clip.id && c.end <= clip.start + 1e-6).reduce((m, c) => Math.max(m, c.end), ripple ? 0 : 0));
          const nt = Math.max(ripple ? 0 : minIn, Math.min(t, maxIn));
          const delta = nt - clip.start;
          clip.inPoint = Math.max(0, clip.inPoint + delta * Math.abs(clip.speed));
          clip.start = nt;
          shiftKeyframes(clip, delta);
          if (ripple) {
            for (const tr of allTracks(seq)) {
              if (tr === track) shiftClipsAfter(tr, clip.start + 1e-6, -delta);
              else if (tr.syncLocked && !tr.locked) shiftClipsAfter(tr, clip.start + 1e-6, -delta);
            }
            clip.start -= delta;
            clip.end -= delta;
            shiftKeyframes(clip, 0);
            sortTrack(track);
          }
        } else {
          const minOut = clip.start + minDur;
          let maxOut = Infinity;
          if (asset && asset.type !== 'graphic' && asset.type !== 'adjustment' && asset.type !== 'image' && !asset.procedural) {
            const room = clip.speed === 0 ? Infinity : (asset.duration - clipSourceOut(clip)) / Math.abs(clip.speed || 1);
            maxOut = clip.end + room;
          }
          if (!ripple) {
            const nextClip = track.clips.find((c) => c.id !== clip.id && c.start >= clip.end - 1e-6);
            if (nextClip) maxOut = Math.min(maxOut, nextClip.start);
          }
          const nt = Math.max(minOut, Math.min(t, maxOut));
          const delta = nt - clip.end;
          clip.end = nt;
          if (ripple) {
            for (const tr of allTracks(seq)) {
              if (tr === track || (tr.syncLocked && !tr.locked)) shiftClipsAfter(tr, clip.end - delta + 1e-6, delta);
            }
            sortTrack(track);
          }
        }
      });
    },

    rollEdit: (clipId, edge, newTime) => {
      const s = get();
      mutate('Rolling Edit', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const f = findClip(seq, clipId);
        if (!f || f.track.locked) return;
        const { clip, track } = f;
        const t = snap(newTime);
        const minDur = 1 / fps;
        if (edge === 'out') {
          const next = track.clips.find((c) => Math.abs(c.start - clip.end) < 1e-3);
          if (!next) return;
          const nt = Math.max(clip.start + minDur, Math.min(t, next.end - minDur));
          const delta = nt - clip.end;
          clip.end = nt;
          next.inPoint += delta * Math.abs(next.speed);
          next.start = nt;
          shiftKeyframes(next, delta);
        } else {
          const prev = track.clips.find((c) => Math.abs(c.end - clip.start) < 1e-3);
          if (!prev) return;
          const nt = Math.max(prev.start + minDur, Math.min(t, clip.end - minDur));
          const delta = nt - clip.start;
          prev.end = nt;
          clip.inPoint += delta * Math.abs(clip.speed);
          clip.start = nt;
          shiftKeyframes(clip, delta);
        }
      });
    },

    slipClip: (clipId, delta) => {
      const s = get();
      mutate('Slip', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        const { clip } = f;
        const asset = getAsset(draft, clip.assetId);
        const speed = Math.abs(clip.speed) || 1;
        let nIn = clip.inPoint + delta * speed;
        nIn = Math.max(0, nIn);
        if (asset && !asset.procedural && asset.type === 'video') {
          const maxIn = asset.duration - (clip.end - clip.start) * speed;
          nIn = Math.min(nIn, Math.max(0, maxIn));
        }
        clip.inPoint = nIn;
      });
    },

    slideClip: (clipId, delta) => {
      const s = get();
      mutate('Slide', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const f = findClip(seq, clipId);
        if (!f) return;
        const { clip, track } = f;
        const prev = track.clips.find((c) => Math.abs(c.end - clip.start) < 1e-3);
        const next = track.clips.find((c) => Math.abs(c.start - clip.end) < 1e-3);
        if (!prev || !next) return;
        const minDur = 1 / fps;
        const d = Math.max(prev.start + minDur - prev.end, Math.min(snap(clip.start + delta) - clip.start, next.end - minDur - next.start));
        prev.end += d;
        next.start += d;
        next.inPoint += d * Math.abs(next.speed);
        shiftKeyframes(next, d);
        clip.start += d;
        clip.end += d;
        sortTrack(track);
      });
    },

    razorAtTime: (time, allTracksFlag) => {
      const s = get();
      const t = snap(time);
      mutate('Razor', (draft) => {
        const seq = activeSeq(draft, s.ui);
        for (const track of allTracks(seq)) {
          if (track.locked) continue;
          if (!allTracksFlag && !track.targeted) continue;
          for (const c of [...track.clips]) {
            if (t > c.start && t < c.end) splitClipAt(track, c, t);
          }
        }
      });
    },

    razorClip: (clipId, time) => {
      const s = get();
      const t = snap(time);
      mutate('Razor', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const f = findClip(seq, clipId);
        if (!f || f.track.locked) return;
        const linked = f.clip.linkedClipId ? findClip(seq, f.clip.linkedClipId) : null;
        const halves = splitClipAt(f.track, f.clip, t);
        if (linked && halves) {
          const lh = splitClipAt(linked.track, linked.clip, t);
          if (lh) {
            halves[0].linkedClipId = lh[0].id;
            lh[0].linkedClipId = halves[0].id;
            halves[1].linkedClipId = lh[1].id;
            lh[1].linkedClipId = halves[1].id;
          }
        }
      });
    },

    deleteClips: (ids, ripple) => {
      const s = get();
      if (ids.length === 0) return;
      mutate(ripple ? 'Ripple Delete' : 'Delete', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const gaps: { start: number; dur: number }[] = [];
        for (const track of allTracks(seq)) {
          if (track.locked) continue;
          const removed = track.clips.filter((c) => ids.includes(c.id));
          for (const r of removed) gaps.push({ start: r.start, dur: r.end - r.start });
          track.clips = track.clips.filter((c) => !ids.includes(c.id));
        }
        if (ripple && gaps.length > 0) {
          // Dedupe identical gaps (linked A/V pairs report the same range twice).
          const unique = [...new Map(gaps.map((g) => [`${g.start.toFixed(4)}:${g.dur.toFixed(4)}`, g])).values()];
          unique.sort((a, b) => b.start - a.start);
          for (const gap of unique) {
            for (const t of allTracks(seq)) {
              if (t.locked || !t.syncLocked) continue;
              // Extract semantics: spanning clips on other tracks are trimmed by the ripple.
              removeRange(t, gap.start, gap.start + gap.dur);
              shiftClipsAfter(t, gap.start, -gap.dur);
            }
          }
        }
      });
      uiSet({ selection: [] });
    },

    liftRange: () => {
      const s = get();
      const inT = s.ui.seqIn[s.ui.activeSequenceId];
      const outT = s.ui.seqOut[s.ui.activeSequenceId];
      if (inT == null || outT == null || outT <= inT) return;
      mutate('Lift', (draft) => {
        const seq = activeSeq(draft, s.ui);
        for (const track of allTracks(seq)) {
          if (!track.locked && track.targeted) removeRange(track, inT, outT);
        }
      });
    },

    extractRange: () => {
      const s = get();
      const inT = s.ui.seqIn[s.ui.activeSequenceId];
      const outT = s.ui.seqOut[s.ui.activeSequenceId];
      if (inT == null || outT == null || outT <= inT) return;
      mutate('Extract', (draft) => {
        const seq = activeSeq(draft, s.ui);
        for (const track of allTracks(seq)) {
          if (!track.locked) removeRange(track, inT, outT);
        }
        for (const track of allTracks(seq)) {
          if (!track.locked && track.syncLocked) shiftClipsAfter(track, inT + 1e-6, -(outT - inT));
        }
      });
    },

    closeGap: (trackId, gapStart) => {
      const s = get();
      mutate('Close Gap', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const track = allTracks(seq).find((t) => t.id === trackId);
        if (!track) return;
        const next = track.clips.filter((c) => c.start >= gapStart).sort((a, b) => a.start - b.start)[0];
        const prevEnd = track.clips.filter((c) => c.end <= gapStart + 1e-6).reduce((m, c) => Math.max(m, c.end), 0);
        if (!next) return;
        const gap = next.start - prevEnd;
        if (gap <= 0) return;
        const blocked = allTracks(seq).some((t) => t !== track &&
          t.clips.some((c) => c.start < next.start && c.end > prevEnd));
        for (const t of allTracks(seq)) {
          if (t === track || (t.syncLocked && !t.locked && !blocked)) shiftClipsAfter(t, next.start - 1e-6, -gap);
        }
      });
    },

    duplicateClips: (ids) => {
      const s = get();
      mutate('Duplicate', (draft) => {
        const seq = activeSeq(draft, s.ui);
        for (const id of ids) {
          const f = findClip(seq, id);
          if (!f) continue;
          const copy: TimelineClip = structuredClone(f.clip);
          copy.id = uid('clip');
          copy.linkedClipId = undefined;
          copy.groupId = undefined;
          const dur = copy.end - copy.start;
          const lastEnd = f.track.clips.reduce((m, c) => Math.max(m, c.end), 0);
          copy.start = lastEnd;
          copy.end = lastEnd + dur;
          f.track.clips.push(copy);
          sortTrack(f.track);
        }
      });
    },

    copyClips: (ids) => {
      const seq = seqOf();
      const clips: TimelineClip[] = [];
      const trackIdx: Record<string, { type: 'video' | 'audio'; idx: number }> = {};
      for (const id of ids) {
        const f = findClip(seq, id);
        if (!f) continue;
        clips.push(structuredClone(f.clip));
        const vIdx = seq.videoTracks.indexOf(f.track);
        trackIdx[f.clip.id] = vIdx >= 0
          ? { type: 'video', idx: vIdx }
          : { type: 'audio', idx: seq.audioTracks.indexOf(f.track) };
      }
      uiSet({ clipboard: clips, clipboardTrackIdx: trackIdx });
    },

    pasteClips: (atTime) => {
      const s = get();
      const clips = s.ui.clipboard;
      if (!clips || clips.length === 0) return;
      const t0 = snap(atTime ?? playheadOf());
      const minStart = Math.min(...clips.map((c) => c.start));
      mutate('Paste', (draft) => {
        const seq = activeSeq(draft, s.ui);
        for (const src of clips) {
          const meta = s.ui.clipboardTrackIdx[src.id];
          const list = meta?.type === 'audio' ? seq.audioTracks : seq.videoTracks;
          const track = list[Math.min(meta?.idx ?? 0, list.length - 1)];
          if (!track || track.locked) continue;
          const copy: TimelineClip = structuredClone(src);
          copy.id = uid('clip');
          copy.linkedClipId = undefined;
          const dur = copy.end - copy.start;
          copy.start = t0 + (src.start - minStart);
          copy.end = copy.start + dur;
          placeClip(track, copy);
        }
      });
    },

    setClipSpeed: (clipId, speed, ripple) => {
      const s = get();
      mutate('Speed/Duration', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const f = findClip(seq, clipId);
        if (!f) return;
        const { clip, track } = f;
        const srcDur = (clip.end - clip.start) * Math.abs(clip.speed || 1);
        const newDur = speed === 0 ? clip.end - clip.start : Math.max(1 / fps, srcDur / Math.abs(speed));
        const oldEnd = clip.end;
        clip.speed = speed;
        if (speed !== 0) clip.end = clip.start + newDur;
        const delta = clip.end - oldEnd;
        if (ripple && Math.abs(delta) > 1e-6) {
          for (const t of allTracks(seq)) {
            if (t === track) shiftClipsAfter(t, oldEnd + 1e-6, delta);
            else if (t.syncLocked && !t.locked) shiftClipsAfter(t, oldEnd + 1e-6, delta);
          }
        } else if (!ripple) {
          removeRange(track, clip.start, clip.end, new Set([clip.id]));
        }
      });
    },

    rateStretchTo: (clipId, newEnd) => {
      const s = get();
      mutate('Rate Stretch', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const f = findClip(seq, clipId);
        if (!f) return;
        const { clip, track } = f;
        const srcDur = (clip.end - clip.start) * Math.abs(clip.speed || 1);
        const t = snap(newEnd);
        const nd = Math.max(1 / fps, t - clip.start);
        const next = track.clips.find((c) => c.id !== clip.id && c.start >= clip.end - 1e-6);
        const maxEnd = next ? next.start : Infinity;
        clip.end = Math.min(clip.start + nd, maxEnd);
        clip.speed = srcDur / (clip.end - clip.start) * Math.sign(clip.speed || 1);
      });
    },

    toggleClipEnabled: (ids) => {
      const s = get();
      mutate('Enable/Disable', (draft) => {
        const seq = activeSeq(draft, s.ui);
        for (const id of ids) {
          const f = findClip(seq, id);
          if (f) f.clip.enabled = !f.clip.enabled;
        }
      });
    },

    patchClip: (clipId, patch, label = 'Modify Clip') => {
      const s = get();
      mutate(label, (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (f) Object.assign(f.clip, patch);
      });
    },

    linkClips: (aId, bId) => {
      const s = get();
      mutate('Link', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const a = findClip(seq, aId);
        const b = findClip(seq, bId);
        if (a && b) {
          a.clip.linkedClipId = b.clip.id;
          b.clip.linkedClipId = a.clip.id;
        }
      });
    },
    unlinkClip: (id) => {
      const s = get();
      mutate('Unlink', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const f = findClip(seq, id);
        if (!f) return;
        if (f.clip.linkedClipId) {
          const other = findClip(seq, f.clip.linkedClipId);
          if (other) other.clip.linkedClipId = undefined;
        }
        f.clip.linkedClipId = undefined;
      });
    },
    groupClips: (ids) => {
      const s = get();
      const gid = uid('grp');
      mutate('Group', (draft) => {
        const seq = activeSeq(draft, s.ui);
        for (const id of ids) {
          const f = findClip(seq, id);
          if (f) f.clip.groupId = gid;
        }
      });
    },
    ungroupClips: (ids) => {
      const s = get();
      mutate('Ungroup', (draft) => {
        const seq = activeSeq(draft, s.ui);
        for (const id of ids) {
          const f = findClip(seq, id);
          if (f) f.clip.groupId = undefined;
        }
      });
    },

    nestClips: (ids, name) => {
      const s = get();
      mutate('Nest', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const found = ids.map((id) => findClip(seq, id)).filter(Boolean) as { clip: TimelineClip; track: Track }[];
        if (found.length === 0) return;
        const minStart = Math.min(...found.map((f) => f.clip.start));
        const maxEnd = Math.max(...found.map((f) => f.clip.end));
        const nested: Sequence = {
          id: uid('seq'), name, width: seq.width, height: seq.height, frameRate: seq.frameRate,
          videoTracks: [], audioTracks: [], markers: [], captions: [], captionsVisible: true,
          audioSampleRate: 48000, captionStyle: structuredClone(seq.captionStyle),
        };
        // rebuild minimal track structure
        const vSrc = [...new Set(found.filter((f) => f.track.type === 'video').map((f) => seq.videoTracks.indexOf(f.track)))].sort();
        const aSrc = [...new Set(found.filter((f) => f.track.type === 'audio').map((f) => seq.audioTracks.indexOf(f.track)))].sort();
        vSrc.forEach((_, i) => nested.videoTracks.push(makeTrack('video', `V${i + 1}`)));
        aSrc.forEach((_, i) => nested.audioTracks.push(makeTrack('audio', `A${i + 1}`)));
        if (nested.videoTracks.length === 0) nested.videoTracks.push(makeTrack('video', 'V1'));
        if (nested.audioTracks.length === 0) nested.audioTracks.push(makeTrack('audio', 'A1'));
        for (const f of found) {
          const copy = structuredClone(f.clip);
          copy.start -= minStart;
          copy.end -= minStart;
          const list = f.track.type === 'video' ? vSrc : aSrc;
          const idx = list.indexOf(f.track.type === 'video' ? seq.videoTracks.indexOf(f.track) : seq.audioTracks.indexOf(f.track));
          const target = f.track.type === 'video' ? nested.videoTracks[idx] : nested.audioTracks[idx];
          target.clips.push(copy);
          sortTrack(target);
          f.track.clips = f.track.clips.filter((c) => c.id !== f.clip.id);
        }
        draft.sequences.push(nested);
        const asset: MediaAsset = {
          id: uid('asset'), name, type: 'sequence', sourcePath: '(sequence)', duration: maxEnd - minStart,
          width: seq.width, height: seq.height, frameRate: seq.frameRate, label: 'forest',
          binId: draft.bins.find((b) => b.name === '04_SEQUENCES')?.id ?? null, sequenceId: nested.id, metadata: {},
        };
        draft.assets.push(asset);
        const lowestV = found.filter((f) => f.track.type === 'video')
          .sort((a, b) => seq.videoTracks.indexOf(a.track) - seq.videoTracks.indexOf(b.track))[0];
        const targetTrack = lowestV?.track ?? seq.videoTracks[0];
        const nestClip = makeClip(asset, minStart, maxEnd, 0, { name });
        placeClip(targetTrack, nestClip);
      });
      uiSet({ selection: [] });
    },

    addClipFromAsset: (assetId, trackId, start, srcIn, srcOut) => {
      const s = get();
      const asset = getAsset(s.project, assetId);
      if (!asset) return;
      mutate('Add Clip', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const track = allTracks(seq).find((t) => t.id === trackId);
        if (!track || track.locked) return;
        const a = getAsset(draft, assetId)!;
        if ((a.type === 'audio') !== (track.type === 'audio')) return;
        const inP = srcIn ?? 0;
        const dur = Math.max(1 / fps, (srcOut ?? a.duration) - inP);
        const t0 = snap(start);
        const clip = makeClip(a, t0, t0 + dur, inP, a.textTemplate
          ? { textLayers: a.textTemplate.map((l) => ({ ...structuredClone(l), id: uid('layer') })) }
          : {});
        placeClip(track, clip);
      });
    },

    insertEdit: (assetId, time, srcIn, srcOut) => doInsertOrOverwrite(assetId, time, srcIn, srcOut, true),
    overwriteEdit: (assetId, time, srcIn, srcOut) => doInsertOrOverwrite(assetId, time, srcIn, srcOut, false),

    // ---- tracks ----
    addTrack: (type) => {
      const s = get();
      mutate('Add Track', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const list = type === 'video' ? seq.videoTracks : seq.audioTracks;
        list.push(makeTrack(type, `${type === 'video' ? 'V' : 'A'}${list.length + 1}`));
      });
    },
    deleteTrack: (trackId) => {
      const s = get();
      mutate('Delete Track', (draft) => {
        const seq = activeSeq(draft, s.ui);
        seq.videoTracks = seq.videoTracks.filter((t) => t.id !== trackId);
        seq.audioTracks = seq.audioTracks.filter((t) => t.id !== trackId);
        seq.videoTracks.forEach((t, i) => { t.name = `V${i + 1}`; });
        seq.audioTracks.forEach((t, i) => { t.name = `A${i + 1}`; });
      });
    },
    patchTrack: (trackId, patch, label = 'Modify Track', transient = false) => {
      const s = get();
      const apply = (draft: VideoProject) => {
        const seq = activeSeq(draft, s.ui);
        const track = allTracks(seq).find((t) => t.id === trackId);
        if (track) Object.assign(track, patch);
      };
      if (transient) get().liveMutate(apply);
      else mutate(label, apply);
    },

    // ---- markers ----
    addMarker: (time, patch) => {
      const s = get();
      const t = snap(time ?? playheadOf());
      mutate('Add Marker', (draft) => {
        const seq = activeSeq(draft, s.ui);
        seq.markers.push({ id: uid('mk'), time: t, duration: 0, name: '', comment: '', color: 'green', ...patch });
        seq.markers.sort((a, b) => a.time - b.time);
      });
    },
    updateMarker: (id, patch) => {
      const s = get();
      mutate('Edit Marker', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const m = seq.markers.find((m) => m.id === id);
        if (m) Object.assign(m, patch);
        seq.markers.sort((a, b) => a.time - b.time);
      });
    },
    removeMarker: (id) => {
      const s = get();
      mutate('Clear Marker', (draft) => {
        const seq = activeSeq(draft, s.ui);
        seq.markers = seq.markers.filter((m) => m.id !== id);
      });
    },

    // ---- transitions ----
    addTransition: (clipId, edge, type, duration = 1) => {
      const s = get();
      mutate('Apply Transition', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        const tr: Transition = { id: uid('tr'), type: type as Transition['type'], duration, alignment: 'center' };
        if (edge === 'in') f.clip.transitionIn = tr;
        else f.clip.transitionOut = tr;
      });
    },
    removeTransition: (clipId, edge) => {
      const s = get();
      mutate('Remove Transition', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        if (edge === 'in') f.clip.transitionIn = undefined;
        else f.clip.transitionOut = undefined;
      });
    },
    updateTransition: (clipId, edge, patch) => {
      const s = get();
      mutate('Modify Transition', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        const tr = edge === 'in' ? f.clip.transitionIn : f.clip.transitionOut;
        if (tr) Object.assign(tr, patch);
      });
    },

    // ---- properties / keyframes ----
    setPropValue: (clipId, target, value, atTime) => {
      const s = get();
      mutate('Set Property', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        const p = resolveProp(f.clip, target);
        if (!p) return;
        if (p.animated && atTime !== undefined) {
          upsertKeyframe(p, { id: uid('kf'), time: atTime, value, interpolation: 'linear' });
        } else {
          p.value = value;
        }
      });
    },
    toggleAnimated: (clipId, target, atTime) => {
      const s = get();
      mutate('Toggle Animation', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        const p = resolveProp(f.clip, target);
        if (!p) return;
        if (p.animated) {
          p.value = evalProp(p, atTime);
          p.animated = false;
          p.keyframes = [];
        } else {
          p.animated = true;
          upsertKeyframe(p, { id: uid('kf'), time: atTime, value: structuredClone(p.value), interpolation: 'linear' });
        }
      });
    },
    addKeyframe: (clipId, target, time) => {
      const s = get();
      mutate('Add Keyframe', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        const p = resolveProp(f.clip, target);
        if (!p) return;
        p.animated = true;
        upsertKeyframe(p, { id: uid('kf'), time, value: structuredClone(evalProp(p, time)), interpolation: 'linear' });
      });
    },
    removeKeyframe: (clipId, target, kfId) => {
      const s = get();
      mutate('Remove Keyframe', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        const p = resolveProp(f.clip, target);
        if (!p) return;
        p.keyframes = p.keyframes.filter((k) => k.id !== kfId);
        if (p.keyframes.length === 0) p.animated = false;
      });
    },
    moveKeyframe: (clipId, target, kfId, newTime, newValue) => {
      const s = get();
      mutate('Move Keyframe', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        const p = resolveProp(f.clip, target);
        if (!p) return;
        const k = p.keyframes.find((k) => k.id === kfId);
        if (!k) return;
        k.time = newTime;
        if (newValue !== undefined) k.value = newValue;
        p.keyframes.sort((a, b) => a.time - b.time);
      });
    },
    setKeyframeInterp: (clipId, target, kfId, interp) => {
      const s = get();
      mutate('Keyframe Interpolation', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        const p = resolveProp(f.clip, target);
        const k = p?.keyframes.find((k) => k.id === kfId);
        if (k) k.interpolation = interp;
      });
    },

    // ---- effects ----
    addEffectToClips: (clipIds, effectId) => {
      const s = get();
      const def = getEffectDef(effectId);
      if (!def) return;
      mutate(`Apply ${def.name}`, (draft) => {
        const seq = activeSeq(draft, s.ui);
        for (const id of clipIds) {
          const f = findClip(seq, id);
          if (!f) continue;
          if (def.category === 'audio' && f.track.type !== 'audio') continue;
          if (def.category === 'video' && f.track.type !== 'video') continue;
          f.clip.effects.push(createEffectInstance(effectId));
        }
      });
    },
    removeEffect: (clipId, instanceId) => {
      const s = get();
      mutate('Remove Effect', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (f) f.clip.effects = f.clip.effects.filter((e) => e.id !== instanceId);
      });
    },
    toggleEffect: (clipId, instanceId) => {
      const s = get();
      mutate('Toggle Effect', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        const e = f?.clip.effects.find((e) => e.id === instanceId);
        if (e) e.enabled = !e.enabled;
      });
    },
    moveEffect: (clipId, from, to) => {
      const s = get();
      mutate('Reorder Effects', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        const fx = f.clip.effects;
        if (from < 0 || from >= fx.length || to < 0 || to >= fx.length) return;
        const [item] = fx.splice(from, 1);
        fx.splice(to, 0, item);
      });
    },

    // ---- masks ----
    addMask: (clipId, type) => {
      const s = get();
      mutate('Add Mask', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        f.clip.masks.push({
          id: uid('mask'), type,
          cx: prop(0.5), cy: prop(0.5), rx: prop(0.25), ry: prop(0.25),
          feather: prop(20), opacity: prop(100), inverted: false,
        });
      });
    },
    removeMask: (clipId, maskId) => {
      const s = get();
      mutate('Remove Mask', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (f) f.clip.masks = f.clip.masks.filter((m) => m.id !== maskId);
      });
    },
    patchMask: (clipId, maskId, patch) => {
      const s = get();
      mutate('Modify Mask', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        const m = f?.clip.masks.find((m) => m.id === maskId);
        if (m) Object.assign(m, patch);
      });
    },

    // ---- text ----
    addGraphicClip: (start, text) => {
      const s = get();
      mutate('New Text', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const track = seq.videoTracks[seq.videoTracks.length - 1] ?? seq.videoTracks[0];
        let asset = draft.assets.find((a) => a.type === 'graphic' && a.name === 'Graphic');
        if (!asset) {
          asset = {
            id: uid('asset'), name: 'Graphic', type: 'graphic', sourcePath: '(graphic)', duration: 5,
            width: seq.width, height: seq.height, label: 'rose',
            binId: draft.bins.find((b) => b.name === '03_GRAPHICS')?.id ?? null, metadata: {},
          };
          draft.assets.push(asset);
        }
        const t0 = snap(start);
        const clip = makeClip(asset, t0, t0 + 5, 0, {
          name: text,
          textLayers: [defaultTextLayer({ text, name: text.slice(0, 24) })],
        });
        placeClip(track, clip);
      });
    },
    addTextLayer: (clipId, patch) => {
      const s = get();
      mutate('Add Text Layer', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (!f) return;
        if (!f.clip.textLayers) f.clip.textLayers = [];
        f.clip.textLayers.push(defaultTextLayer(patch));
      });
    },
    patchTextLayer: (clipId, layerId, patch, label = 'Edit Text') => {
      const s = get();
      mutate(label, (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        const l = f?.clip.textLayers?.find((l) => l.id === layerId);
        if (l) Object.assign(l, patch);
      });
    },
    removeTextLayer: (clipId, layerId) => {
      const s = get();
      mutate('Delete Text Layer', (draft) => {
        const f = findClip(activeSeq(draft, s.ui), clipId);
        if (f?.clip.textLayers) f.clip.textLayers = f.clip.textLayers.filter((l) => l.id !== layerId);
      });
    },

    // ---- captions ----
    addCaption: (start, end, text) => {
      const s = get();
      mutate('Add Caption', (draft) => {
        const seq = activeSeq(draft, s.ui);
        seq.captions.push({ id: uid('cap'), start: snap(start), end: snap(end), text });
        seq.captions.sort((a, b) => a.start - b.start);
      });
    },
    patchCaption: (id, patch) => {
      const s = get();
      mutate('Edit Caption', (draft) => {
        const seq = activeSeq(draft, s.ui);
        const c = seq.captions.find((c) => c.id === id);
        if (c) Object.assign(c, patch);
        seq.captions.sort((a, b) => a.start - b.start);
      });
    },
    removeCaption: (id) => {
      const s = get();
      mutate('Delete Caption', (draft) => {
        const seq = activeSeq(draft, s.ui);
        seq.captions = seq.captions.filter((c) => c.id !== id);
      });
    },
    setCaptionStyle: (patch) => {
      const s = get();
      mutate('Caption Style', (draft) => {
        const seq = activeSeq(draft, s.ui);
        Object.assign(seq.captionStyle, patch);
      });
    },
    toggleCaptionsVisible: () => {
      const s = get();
      mutate('Toggle Captions', (draft) => {
        const seq = activeSeq(draft, s.ui);
        seq.captionsVisible = !seq.captionsVisible;
      });
    },
    importCaptions: (items) => {
      const s = get();
      mutate('Import Captions', (draft) => {
        const seq = activeSeq(draft, s.ui);
        for (const it of items) seq.captions.push({ id: uid('cap'), ...it });
        seq.captions.sort((a, b) => a.start - b.start);
      });
    },

    // ---- project panel ----
    importFiles: async (files) => {
      const list = Array.from(files);
      const assets: MediaAsset[] = [];
      for (const file of list) {
        const fileId = `file_${Date.now()}_${importCounter++}`;
        registerBlob(fileId, file);
        const { saveMediaBlob } = await import('./persistence');
        void saveMediaBlob(fileId, file);
        const base: Omit<MediaAsset, 'type' | 'duration'> = {
          id: uid('asset'), name: file.name, sourcePath: file.name, label: 'cerulean',
          binId: get().ui.currentBinId, fileId, metadata: { 'File Size': `${(file.size / 1e6).toFixed(1)} MB` },
        };
        if (file.type.startsWith('video/')) {
          const meta = await probeVideo(file);
          assets.push({
            ...base, type: 'video', duration: meta.duration, width: meta.width, height: meta.height,
            frameRate: 30, hasAudio: true, codec: file.type,
          });
        } else if (file.type.startsWith('audio/')) {
          const dur = await probeAudio(file);
          assets.push({ ...base, type: 'audio', duration: dur, sampleRate: 48000, channels: 2, codec: file.type });
        } else if (file.type.startsWith('image/')) {
          const meta = await probeImage(file);
          assets.push({ ...base, type: 'image', duration: 5, width: meta.width, height: meta.height, codec: file.type });
        } else if (file.name.endsWith('.srt') || file.name.endsWith('.vtt')) {
          const text = await file.text();
          const items = parseSubtitles(text);
          if (items.length > 0) get().importCaptions(items);
          continue;
        } else if (file.name.endsWith('.json')) {
          try {
            const json = JSON.parse(await file.text());
            if (json && json.sequences && json.assets) {
              get().loadProject(json as VideoProject);
              return;
            }
          } catch { /* not a project */ }
          continue;
        } else {
          continue;
        }
      }
      if (assets.length > 0) {
        get().mutate('Import Media', (draft) => {
          draft.assets.push(...assets);
        });
      }
    },
    createBin: (name, parentId) => {
      get().mutate('New Bin', (draft) => {
        draft.bins.push({ id: uid('bin'), name, parentId });
      });
    },
    renameAsset: (id, name) => {
      get().mutate('Rename', (draft) => {
        const a = draft.assets.find((a) => a.id === id);
        if (a) a.name = name;
      });
    },
    renameBin: (id, name) => {
      get().mutate('Rename Bin', (draft) => {
        const b = draft.bins.find((b) => b.id === id);
        if (b) b.name = name;
      });
    },
    deleteAssets: (ids) => {
      get().mutate('Delete', (draft) => {
        draft.assets = draft.assets.filter((a) => !ids.includes(a.id));
        for (const seq of draft.sequences) {
          for (const track of [...seq.videoTracks, ...seq.audioTracks]) {
            track.clips = track.clips.filter((c) => !ids.includes(c.assetId));
          }
        }
      });
    },
    deleteBin: (id) => {
      get().mutate('Delete Bin', (draft) => {
        const collect = (binId: string): string[] =>
          [binId, ...draft.bins.filter((b) => b.parentId === binId).flatMap((b) => collect(b.id))];
        const all = collect(id);
        draft.bins = draft.bins.filter((b) => !all.includes(b.id));
        for (const a of draft.assets) if (a.binId && all.includes(a.binId)) a.binId = null;
      });
    },
    moveAssetToBin: (assetId, binId) => {
      get().mutate('Move to Bin', (draft) => {
        const a = draft.assets.find((a) => a.id === assetId);
        if (a) a.binId = binId;
      });
    },
    setAssetLabel: (ids, label) => {
      get().mutate('Label', (draft) => {
        for (const a of draft.assets) if (ids.includes(a.id)) a.label = label;
      });
    },
    createSequence: (name, width, height, fpsIn) => {
      const s = get();
      const seqId = uid('seq');
      s.mutate('New Sequence', (draft) => {
        const seq: Sequence = {
          id: seqId, name, width, height, frameRate: fpsIn,
          videoTracks: [makeTrack('video', 'V1'), makeTrack('video', 'V2'), makeTrack('video', 'V3')],
          audioTracks: [makeTrack('audio', 'A1'), makeTrack('audio', 'A2'), makeTrack('audio', 'A3')],
          markers: [], captions: [], captionsVisible: true, audioSampleRate: 48000,
          captionStyle: structuredClone(activeSeq(draft, s.ui).captionStyle),
        };
        draft.sequences.push(seq);
        draft.assets.push({
          id: uid('asset'), name, type: 'sequence', sourcePath: '(sequence)', duration: 0,
          width, height, frameRate: fpsIn, label: 'forest',
          binId: draft.bins.find((b) => b.name === '04_SEQUENCES')?.id ?? null, sequenceId: seqId, metadata: {},
        });
      });
      get().setActiveSequence(seqId);
    },
    duplicateSequenceAsset: (assetId) => {
      const s = get();
      s.mutate('Duplicate', (draft) => {
        const a = draft.assets.find((a) => a.id === assetId);
        if (!a) return;
        const copy = structuredClone(a);
        copy.id = uid('asset');
        copy.name = `${a.name} Copy`;
        if (a.type === 'sequence' && a.sequenceId) {
          const seq = draft.sequences.find((sq) => sq.id === a.sequenceId);
          if (seq) {
            const seqCopy = structuredClone(seq);
            seqCopy.id = uid('seq');
            seqCopy.name = copy.name;
            for (const t of [...seqCopy.videoTracks, ...seqCopy.audioTracks]) {
              t.id = uid('track');
              for (const c of t.clips) c.id = uid('clip');
            }
            draft.sequences.push(seqCopy);
            copy.sequenceId = seqCopy.id;
          }
        }
        draft.assets.push(copy);
      });
    },

    // ---- source monitor ----
    openInSource: (assetId) => {
      const s = get();
      uiSet({ source: { ...s.ui.source, assetId, time: 0, inPoint: null, outPoint: null, playing: false } });
    },
    setSourceTime: (t) => {
      const s = get();
      const asset = s.ui.source.assetId ? getAsset(s.project, s.ui.source.assetId) : null;
      const max = asset?.duration ?? 0;
      uiSet({ source: { ...s.ui.source, time: Math.max(0, Math.min(t, max)) } });
    },
    setSourcePlaying: (p) => {
      const s = get();
      uiSet({ source: { ...s.ui.source, playing: p } });
    },
    setSourceIn: (t) => {
      const s = get();
      uiSet({ source: { ...s.ui.source, inPoint: t } });
    },
    setSourceOut: (t) => {
      const s = get();
      uiSet({ source: { ...s.ui.source, outPoint: t } });
    },
    sourceInsert: () => {
      const s = get();
      const src = s.ui.source;
      if (!src.assetId) return;
      s.insertEdit(src.assetId, s.ui.playheads[s.ui.activeSequenceId] ?? 0, src.inPoint ?? undefined, src.outPoint ?? undefined);
    },
    sourceOverwrite: () => {
      const s = get();
      const src = s.ui.source;
      if (!src.assetId) return;
      s.overwriteEdit(src.assetId, s.ui.playheads[s.ui.activeSequenceId] ?? 0, src.inPoint ?? undefined, src.outPoint ?? undefined);
    },

    // ---- lifecycle ----
    resetToDemo: () => {
      const fresh = buildDemoProject();
      set({
        project: fresh,
        past: [],
        future: [],
        transaction: null,
      });
      uiSet({
        activeSequenceId: fresh.sequences[0].id,
        playheads: { [fresh.sequences[0].id]: 0 },
        selection: [],
        playing: false,
      });
    },
    loadProject: (p, uiPatch) => {
      set({ project: p, past: [], future: [], transaction: null });
      const first = p.sequences[0];
      uiSet({
        activeSequenceId: first?.id ?? '',
        playheads: Object.fromEntries(p.sequences.map((sq) => [sq.id, 0])),
        selection: [],
        playing: false,
        ...uiPatch,
      });
    },
    renameProject: (name) => {
      get().mutate('Rename Project', (draft) => { draft.name = name; });
    },
  };
});

// ============ probing helpers ============

function probeVideo(file: File): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      res({ duration: v.duration || 10, width: v.videoWidth || 1920, height: v.videoHeight || 1080 });
      URL.revokeObjectURL(url);
    };
    v.onerror = () => { res({ duration: 10, width: 1920, height: 1080 }); URL.revokeObjectURL(url); };
    v.src = url;
  });
}

function probeAudio(file: File): Promise<number> {
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    a.preload = 'metadata';
    a.onloadedmetadata = () => { res(a.duration || 10); URL.revokeObjectURL(url); };
    a.onerror = () => { res(10); URL.revokeObjectURL(url); };
    a.src = url;
  });
}

function probeImage(file: File): Promise<{ width: number; height: number }> {
  return new Promise((res) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { res({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(url); };
    img.onerror = () => { res({ width: 1920, height: 1080 }); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

/** Parse SRT / VTT into caption items. */
export function parseSubtitles(text: string): { start: number; end: number; text: string }[] {
  const items: { start: number; end: number; text: string }[] = [];
  const timeRe = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
  const blocks = text.replace(/\r/g, '').split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n').filter((l) => l.trim() !== '' && l.trim() !== 'WEBVTT');
    const timeIdx = lines.findIndex((l) => timeRe.test(l));
    if (timeIdx < 0) continue;
    const m = lines[timeIdx].match(timeRe)!;
    const start = +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
    const end = +m[5] * 3600 + +m[6] * 60 + +m[7] + +m[8] / 1000;
    const content = lines.slice(timeIdx + 1).join('\n');
    if (content) items.push({ start, end, text: content });
  }
  return items;
}

// selector helpers
export const useActiveSequence = (): Sequence => useStudio((s) => activeSeq(s.project, s.ui));
export const usePlayhead = (): number => useStudio((s) => s.ui.playheads[s.ui.activeSequenceId] ?? 0);
export const getActiveSequence = (s: StudioState): Sequence => activeSeq(s.project, s.ui);
export const getPlayhead = (s: StudioState): number => s.ui.playheads[s.ui.activeSequenceId] ?? 0;
