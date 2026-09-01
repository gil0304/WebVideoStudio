import type { MediaAsset, TextLayer, TimelineClip, Track } from './types';
import { prop } from './types';
import { uid } from './ids';

export function makeClip(asset: MediaAsset, start: number, end: number, inPoint = 0, overrides: Partial<TimelineClip> = {}): TimelineClip {
  return {
    id: uid('clip'),
    name: asset.name,
    assetId: asset.id,
    start,
    end,
    inPoint,
    speed: 1,
    reversed: false,
    enabled: true,
    label: asset.label,
    position: prop([960, 540]),
    scale: prop(100),
    scaleWidth: prop(100),
    uniformScale: true,
    rotation: prop(0),
    anchor: prop([0, 0]),
    opacity: prop(100),
    blendMode: 'normal',
    masks: [],
    effects: [],
    volume: prop(0),
    pan: prop(0),
    ...overrides,
  };
}

export function defaultTextLayer(overrides: Partial<TextLayer> = {}): TextLayer {
  return {
    id: uid('layer'),
    kind: 'text',
    name: overrides.text?.slice(0, 20) ?? 'Text',
    visible: true,
    text: 'Text',
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    fontWeight: 700,
    fontStyle: 'normal',
    fontSize: 64,
    letterSpacing: 0,
    lineHeight: 1.2,
    align: 'center',
    fill: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadow: false,
    shadowColor: 'rgba(0,0,0,0.75)',
    shadowBlur: 12,
    shadowOffsetX: 0,
    shadowOffsetY: 4,
    bgEnabled: false,
    bgColor: 'rgba(10,12,20,0.75)',
    bgPadding: 16,
    x: 960,
    y: 540,
    width: 400,
    height: 200,
    opacity: 100,
    ...overrides,
  };
}

export function makeTrack(type: 'video' | 'audio', name: string, overrides: Partial<Track> = {}): Track {
  const base: Track = {
    id: uid('track'),
    type,
    name,
    clips: [],
    enabled: true,
    locked: false,
    syncLocked: true,
    muted: false,
    solo: false,
    targeted: name === 'V1' || name === 'A1',
    sourcePatch: name === 'V1' || name === 'A1',
    height: type === 'video' ? 64 : 52,
    volume: 0,
    pan: 0,
  };
  return { ...base, ...overrides };
}
