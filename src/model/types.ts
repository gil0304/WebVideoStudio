// ============================================================
// Web Video Studio — core data model
// All times are in seconds. Editing operations snap to frame
// boundaries (1/frameRate) at the UI layer.
// ============================================================

export type AssetType = 'video' | 'audio' | 'image' | 'sequence' | 'graphic' | 'adjustment';

export type LabelColor =
  | 'violet' | 'iris' | 'caribbean' | 'lavender' | 'cerulean'
  | 'forest' | 'rose' | 'mango' | 'purple' | 'blue' | 'teal' | 'brown' | 'yellow';

export const LABEL_COLORS: Record<LabelColor, string> = {
  violet: '#736db1', iris: '#5c7cbe', caribbean: '#2e9d9a', lavender: '#8d7ab5',
  cerulean: '#3f7fae', forest: '#3a8a5f', rose: '#c25c85', mango: '#d78d3c',
  purple: '#9a57b5', blue: '#4c78c7', teal: '#3aa0a8', brown: '#8a6f4d', yellow: '#c7b45a',
};

/** Display names for label colors (Japanese UI). */
export const LABEL_NAMES_JA: Record<LabelColor, string> = {
  violet: 'バイオレット', iris: 'アイリス', caribbean: 'カリビアン', lavender: 'ラベンダー',
  cerulean: 'セルリアン', forest: 'フォレスト', rose: 'ローズ', mango: 'マンゴー',
  purple: 'パープル', blue: 'ブルー', teal: 'ティール', brown: 'ブラウン', yellow: 'イエロー',
};

/** Display names for asset types (Japanese UI). */
export const ASSET_TYPE_NAMES_JA: Record<AssetType, string> = {
  video: 'ビデオ', audio: 'オーディオ', image: '静止画',
  sequence: 'シーケンス', graphic: 'グラフィック', adjustment: '調整レイヤー',
};

export interface MediaAsset {
  id: string;
  name: string;
  type: AssetType;
  sourcePath: string;
  /** Intrinsic duration in seconds. Images/graphics use a default still duration. */
  duration: number;
  width?: number;
  height?: number;
  frameRate?: number;
  sampleRate?: number;
  channels?: number;
  codec?: string;
  label: LabelColor;
  binId: string | null;
  /** Procedural generator kind for built-in demo footage/audio (deterministic). */
  procedural?: string;
  /** Seed / variant for procedural generators. */
  seed?: number;
  /** IndexedDB blob key for user-imported media. */
  fileId?: string;
  /** For type === 'sequence' (nesting). */
  sequenceId?: string;
  /** Whether the asset also carries audio (video files with sound). */
  hasAudio?: boolean;
  offline?: boolean;
  proxyEnabled?: boolean;
  /** Template layers for graphic assets (copied onto new clips). */
  textTemplate?: TextLayer[];
  metadata: Record<string, string>;
}

export interface Bin {
  id: string;
  name: string;
  parentId: string | null;
}

// ---------------- Keyframes / animatable properties ----------------

export type Interp = 'linear' | 'bezier' | 'hold' | 'easeIn' | 'easeOut' | 'easeInOut';

export interface Keyframe {
  id: string;
  /** Time relative to clip start (clip-local sequence time, seconds). */
  time: number;
  value: number | number[];
  interpolation: Interp;
}

/** Animatable property. When `animated` is false, `value` is used directly. */
export interface Prop {
  value: number | number[];
  animated: boolean;
  keyframes: Keyframe[];
}

export const prop = (value: number | number[]): Prop => ({ value, animated: false, keyframes: [] });

// ---------------- Effects ----------------

export type EffectParamType = 'number' | 'point' | 'color' | 'select' | 'checkbox' | 'angle';

export interface EffectParamDef {
  key: string;
  name: string;
  type: EffectParamType;
  min?: number;
  max?: number;
  step?: number;
  default: number | number[];
  /** For color params the number[] is [r,g,b] 0-255. For select, index into options. */
  options?: string[];
  unit?: string;
}

export interface EffectDef {
  id: string;
  name: string;
  category: 'video' | 'audio';
  group: string; // e.g. "Blur & Sharpen", "Color Correction"
  params: EffectParamDef[];
}

export interface EffectInstance {
  id: string;
  effectId: string;
  enabled: boolean;
  params: Record<string, Prop>;
}

// ---------------- Masks ----------------

export interface MaskShape {
  id: string;
  type: 'rectangle' | 'ellipse';
  /** Center position, normalized 0..1 of frame. */
  cx: Prop;
  cy: Prop;
  /** Half extents, normalized. */
  rx: Prop;
  ry: Prop;
  feather: Prop;    // px at sequence resolution
  opacity: Prop;    // 0..100
  inverted: boolean;
}

// ---------------- Text / Graphics ----------------

export type TextLayerKind = 'text' | 'rect' | 'ellipse' | 'line';

export interface TextLayer {
  id: string;
  kind: TextLayerKind;
  name: string;
  visible: boolean;
  text?: string;
  fontFamily: string;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  fontSize: number;
  letterSpacing: number; // px
  lineHeight: number;    // multiplier
  align: 'left' | 'center' | 'right';
  fill: string;
  strokeColor: string;
  strokeWidth: number;
  shadow: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  bgEnabled: boolean;
  bgColor: string;
  bgPadding: number;
  /** Position of layer anchor (center) in sequence pixels. */
  x: number;
  y: number;
  /** Shape dimensions in sequence pixels. */
  width: number;
  height: number;
  opacity: number; // 0..100
}

// ---------------- Transitions ----------------

export type VideoTransitionType =
  | 'cross-dissolve' | 'dip-to-black' | 'dip-to-white' | 'wipe' | 'slide'
  | 'push' | 'zoom' | 'iris' | 'blur-dissolve';
export type AudioTransitionType = 'constant-gain' | 'constant-power' | 'exponential-fade';

export interface Transition {
  id: string;
  type: VideoTransitionType | AudioTransitionType;
  duration: number;
  alignment: 'start' | 'center' | 'end';
}

// ---------------- Timeline ----------------

export interface TimelineClip {
  id: string;
  name: string;
  assetId: string;
  /** Sequence-time span. */
  start: number;
  end: number;
  /** Source in-point in asset seconds (at 1x). Source out is derived: inPoint + (end-start)*speed. */
  inPoint: number;
  /** Playback speed. 0 = freeze frame at inPoint. */
  speed: number;
  reversed: boolean;
  enabled: boolean;
  label: LabelColor;

  // Intrinsic video params (Motion / Opacity)
  position: Prop;    // [x, y] in sequence px, default center
  scale: Prop;       // percent, 100 = fit-native
  scaleWidth: Prop;  // percent, used when uniformScale false
  uniformScale: boolean;
  rotation: Prop;    // degrees
  anchor: Prop;      // [x, y] px relative to source center
  opacity: Prop;     // 0..100
  blendMode: BlendMode;
  masks: MaskShape[];

  effects: EffectInstance[];

  // Audio params
  volume: Prop;      // dB, -inf(-60)..+6
  pan: Prop;         // -100..100

  linkedClipId?: string;
  groupId?: string;
  transitionIn?: Transition;
  transitionOut?: Transition;
  /** For graphic clips. */
  textLayers?: TextLayer[];
}

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'soft-light' | 'hard-light'
  | 'lighten' | 'darken' | 'color-dodge' | 'color-burn' | 'difference' | 'exclusion' | 'hue' | 'color' | 'luminosity';

export interface Track {
  id: string;
  type: 'video' | 'audio';
  name: string;        // "V1", "A1", ...
  clips: TimelineClip[]; // kept sorted by start, non-overlapping
  /** Video: track output toggle (eye). */
  enabled: boolean;
  locked: boolean;
  syncLocked: boolean;
  muted: boolean;      // audio
  solo: boolean;       // audio
  targeted: boolean;   // track targeting (V1/A1 highlight)
  sourcePatch: boolean;
  height: number;      // px in timeline
  volume: number;      // track gain dB (audio)
  pan: number;
}

export interface Marker {
  id: string;
  time: number;
  duration: number;
  name: string;
  comment: string;
  color: 'green' | 'red' | 'purple' | 'orange' | 'yellow' | 'white' | 'blue' | 'cyan';
}

// ---------------- Captions ----------------

export interface CaptionItem {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  color: string;
  bgColor: string;
  bgOpacity: number;   // 0..1
  position: 'top' | 'bottom';
  edge: 'none' | 'shadow' | 'outline';
}

// ---------------- Sequence / Project ----------------

export interface Sequence {
  id: string;
  name: string;
  width: number;
  height: number;
  frameRate: number;
  /** Tracks ordered V1..Vn (index 0 = V1). */
  videoTracks: Track[];
  /** Tracks ordered A1..An. */
  audioTracks: Track[];
  markers: Marker[];
  captions: CaptionItem[];
  captionStyle: CaptionStyle;
  captionsVisible: boolean;
  audioSampleRate: number;
}

export interface ProjectSettings {
  autoSaveIntervalSec: number;
  autoSaveEnabled: boolean;
  renderer: string;
  scratchDisk: string;
  location: string;
}

export interface VideoProject {
  id: string;
  name: string;
  assets: MediaAsset[];
  bins: Bin[];
  sequences: Sequence[];
  settings: ProjectSettings;
  /** Monotonic revision, bumped on every mutation (for autosave/dirty tracking). */
  revision: number;
}

// ---------------- Helpers ----------------

export const clipDuration = (c: TimelineClip) => c.end - c.start;
/** Source-side out point (seconds in asset time). */
export const clipSourceOut = (c: TimelineClip) =>
  c.inPoint + Math.max(0, c.end - c.start) * (c.speed === 0 ? 0 : Math.abs(c.speed));

export const sequenceDuration = (seq: Sequence): number => {
  let d = 0;
  for (const t of [...seq.videoTracks, ...seq.audioTracks])
    for (const c of t.clips) d = Math.max(d, c.end);
  for (const cap of seq.captions) d = Math.max(d, cap.end);
  return d;
};

export const findClip = (seq: Sequence, clipId: string): { clip: TimelineClip; track: Track } | null => {
  for (const t of [...seq.videoTracks, ...seq.audioTracks]) {
    const c = t.clips.find((c) => c.id === clipId);
    if (c) return { clip: c, track: t };
  }
  return null;
};

export const clipAt = (track: Track, time: number): TimelineClip | undefined =>
  track.clips.find((c) => time >= c.start && time < c.end);

export const getAsset = (p: VideoProject, id: string): MediaAsset | undefined =>
  p.assets.find((a) => a.id === id);

export const getSequence = (p: VideoProject, id: string): Sequence | undefined =>
  p.sequences.find((s) => s.id === id);
