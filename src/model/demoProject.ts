// ============================================================
// CITY PULSE — Tokyo Night Promo
// The finished 45s demo project that opens on launch.
// Every clip references procedural (self-made) sources; all
// grading, keyframes, transitions and captions are real data
// evaluated by the render/audio engines.
// ============================================================

import type {
  Bin, Keyframe, Marker, MediaAsset, Prop, Sequence, VideoProject,
} from './types';
import { prop } from './types';
import { uid } from './ids';
import { defaultTextLayer, makeClip, makeTrack } from './clipFactory';
import { createEffectInstance } from '../engine/effects';

const kf = (time: number, value: number | number[], interpolation: Keyframe['interpolation'] = 'linear'): Keyframe =>
  ({ id: uid('kf'), time, value, interpolation });

const animated = (value: number | number[], keyframes: Keyframe[]): Prop =>
  ({ value, animated: true, keyframes });

function fx(effectId: string, params: Record<string, number | number[] | Prop>) {
  const inst = createEffectInstance(effectId);
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'object' && !Array.isArray(v)) inst.params[k] = v as Prop;
    else inst.params[k] = prop(v as number | number[]);
  }
  return inst;
}

export function buildDemoProject(): VideoProject {
  // ---------------- bins ----------------
  const binIds = {
    footage: uid('bin'), aCam: uid('bin'), bCam: uid('bin'), drone: uid('bin'), slow: uid('bin'),
    audio: uid('bin'), music: uid('bin'), ambience: uid('bin'), sfx: uid('bin'), voice: uid('bin'),
    graphics: uid('bin'), logo: uid('bin'), titles: uid('bin'), overlays: uid('bin'),
    sequences: uid('bin'), adjustment: uid('bin'), captions: uid('bin'), exports: uid('bin'),
  };
  const bins: Bin[] = [
    { id: binIds.footage, name: '01_FOOTAGE', parentId: null },
    { id: binIds.aCam, name: 'A_CAM', parentId: binIds.footage },
    { id: binIds.bCam, name: 'B_CAM', parentId: binIds.footage },
    { id: binIds.drone, name: 'DRONE', parentId: binIds.footage },
    { id: binIds.slow, name: 'SLOW_MOTION', parentId: binIds.footage },
    { id: binIds.audio, name: '02_AUDIO', parentId: null },
    { id: binIds.music, name: 'MUSIC', parentId: binIds.audio },
    { id: binIds.ambience, name: 'AMBIENCE', parentId: binIds.audio },
    { id: binIds.sfx, name: 'SFX', parentId: binIds.audio },
    { id: binIds.voice, name: 'VOICE', parentId: binIds.audio },
    { id: binIds.graphics, name: '03_GRAPHICS', parentId: null },
    { id: binIds.logo, name: 'LOGO', parentId: binIds.graphics },
    { id: binIds.titles, name: 'TITLES', parentId: binIds.graphics },
    { id: binIds.overlays, name: 'OVERLAYS', parentId: binIds.graphics },
    { id: binIds.sequences, name: '04_SEQUENCES', parentId: null },
    { id: binIds.adjustment, name: '05_ADJUSTMENT', parentId: null },
    { id: binIds.captions, name: '06_CAPTIONS', parentId: null },
    { id: binIds.exports, name: '07_EXPORTS', parentId: null },
  ];

  // ---------------- assets ----------------
  const video = (name: string, procedural: string, binId: string, seed = 1, duration = 60): MediaAsset => ({
    id: uid('asset'), name, type: 'video', sourcePath: `/footage/${name}.mp4`, duration,
    width: 1920, height: 1080, frameRate: 30, codec: 'Procedural/RGBA', label: 'iris',
    binId, procedural, seed, metadata: { Camera: seed === 1 ? 'A-CAM' : `CAM-${seed}`, Location: 'Tokyo' },
  });
  const audio = (name: string, procedural: string, binId: string, duration: number): MediaAsset => ({
    id: uid('asset'), name, type: 'audio', sourcePath: `/audio/${name}.wav`, duration,
    sampleRate: 48000, channels: 2, codec: 'PCM 32f', label: 'caribbean',
    binId, procedural, metadata: {},
  });

  const aBokeh = video('A000_bokeh_night', 'title_bg', binIds.aCam, 1);
  const aSkyline = video('A010_skyline_pan', 'skyline', binIds.aCam, 1);
  const aCross = video('A020_crossing', 'crosswalk', binIds.aCam, 1);
  const aNeon = video('A030_neon_wall', 'neon', binIds.aCam, 1);
  const aCrowd = video('A040_station_flow', 'crowd', binIds.aCam, 1);
  const aAlley = video('A050_izakaya_alley', 'alley', binIds.aCam, 1);
  const bCross = video('B010_crossing_b', 'crosswalk', binIds.bCam, 2);
  const bCrowd = video('B020_station_b', 'crowd', binIds.bCam, 2);
  const bNeon = video('B030_neon_b', 'neon', binIds.bCam, 3);
  const dAerial = video('D010_aerial_grid', 'drone', binIds.drone, 1);
  const dAerial2 = video('D020_aerial_dusk', 'drone', binIds.drone, 2);
  const dTowers = video('D030_towers_up', 'buildings', binIds.drone, 1);
  const sTaxi = video('S010_taxi_trails', 'taxi_lights', binIds.slow, 1);
  const sTrain = video('S020_last_train', 'train', binIds.slow, 1);

  const mMusic = audio('MUS_city_pulse_120bpm', 'music_main', binIds.music, 45);
  const mAmb = audio('AMB_tokyo_night_air', 'ambience_city', binIds.ambience, 45);
  const sWhoosh = audio('SFX_whoosh_pass', 'sfx_whoosh', binIds.sfx, 1.1);
  const sImpact = audio('SFX_impact_deep', 'sfx_impact', binIds.sfx, 1.6);
  const sRiser = audio('SFX_riser_build', 'sfx_riser', binIds.sfx, 3.2);
  const vTag = audio('VO_city_whisper', 'vo_tag', binIds.voice, 2.4);

  const gTitle: MediaAsset = {
    id: uid('asset'), name: 'GFX_main_title', type: 'graphic', sourcePath: '(graphic)', duration: 5,
    width: 1920, height: 1080, label: 'rose', binId: binIds.titles, metadata: {},
    textTemplate: [
      defaultTextLayer({ name: 'Main Title', text: 'CITY PULSE', fontSize: 148, fontWeight: 800, letterSpacing: 26, y: 500, fill: '#ffffff', shadow: true, shadowBlur: 34, shadowColor: 'rgba(0,229,255,0.55)' }),
      defaultTextLayer({ name: 'Subtitle', text: 'TOKYO NIGHT PROMO', fontSize: 34, fontWeight: 500, letterSpacing: 14, y: 620, fill: '#9fd8ff' }),
      defaultTextLayer({ kind: 'rect', name: 'Accent Line', text: undefined, y: 572, x: 960, width: 420, height: 3, fill: '#ff2d78' }),
    ],
  };
  const gLower: MediaAsset = {
    id: uid('asset'), name: 'GFX_lower_third', type: 'graphic', sourcePath: '(graphic)', duration: 5,
    width: 1920, height: 1080, label: 'rose', binId: binIds.titles, metadata: {},
    textTemplate: [
      defaultTextLayer({ kind: 'rect', name: 'Background Rectangle', y: 920, x: 430, width: 560, height: 92, fill: 'rgba(8,10,18,0.72)' }),
      defaultTextLayer({ name: 'Place', text: 'SHINJUKU', fontSize: 44, fontWeight: 700, letterSpacing: 8, align: 'left', x: 320, y: 902, fill: '#ffffff' }),
      defaultTextLayer({ name: 'Time', text: '23:47', fontSize: 26, fontWeight: 400, letterSpacing: 6, align: 'left', x: 320, y: 944, fill: '#00e5ff' }),
      defaultTextLayer({ kind: 'rect', name: 'Accent', y: 920, x: 176, width: 6, height: 92, fill: '#ff2d78' }),
    ],
  };
  const gCenter: MediaAsset = {
    id: uid('asset'), name: 'GFX_statement', type: 'graphic', sourcePath: '(graphic)', duration: 5,
    width: 1920, height: 1080, label: 'rose', binId: binIds.titles, metadata: {},
    textTemplate: [
      defaultTextLayer({ name: 'Statement', text: 'THE CITY NEVER SLEEPS', fontSize: 72, fontWeight: 800, letterSpacing: 10, y: 540, fill: '#ffffff', strokeWidth: 0, shadow: true, shadowBlur: 26, shadowColor: 'rgba(255,45,120,0.6)' }),
    ],
  };
  const gLogo: MediaAsset = {
    id: uid('asset'), name: 'GFX_logo_end', type: 'graphic', sourcePath: '(graphic)', duration: 5,
    width: 1920, height: 1080, label: 'mango', binId: binIds.logo, metadata: {},
    textTemplate: [
      defaultTextLayer({ name: 'Logo', text: 'CITY PULSE', fontSize: 120, fontWeight: 800, letterSpacing: 22, y: 512, fill: '#ffffff', shadow: true, shadowBlur: 40, shadowColor: 'rgba(0,229,255,0.5)' }),
      defaultTextLayer({ name: 'Tagline', text: 'TOKYO NEVER SLEEPS', fontSize: 32, fontWeight: 500, letterSpacing: 16, y: 610, fill: '#ff2d78' }),
      defaultTextLayer({ kind: 'ellipse', name: 'Pulse Ring', y: 540, x: 960, width: 700, height: 700, fill: 'rgba(0,0,0,0)', strokeColor: 'rgba(0,229,255,0.4)', strokeWidth: 2 }),
    ],
  };
  const adjAsset: MediaAsset = {
    id: uid('asset'), name: 'Adjustment Layer', type: 'adjustment', sourcePath: '(adjustment)', duration: 60,
    width: 1920, height: 1080, label: 'purple', binId: binIds.adjustment, metadata: {},
  };
  const grainAsset: MediaAsset = {
    id: uid('asset'), name: 'OVL_film_grain', type: 'adjustment', sourcePath: '(adjustment)', duration: 60,
    width: 1920, height: 1080, label: 'purple', binId: binIds.overlays, metadata: {},
  };

  // ---------------- NESTED_MONTAGE sequence ----------------
  const montage: Sequence = {
    id: uid('seq'), name: 'NESTED_MONTAGE', width: 1920, height: 1080, frameRate: 30,
    videoTracks: [makeTrack('video', 'V1')], audioTracks: [makeTrack('audio', 'A1')],
    markers: [], captions: [], captionsVisible: true, audioSampleRate: 48000,
    captionStyle: defaultCaptionStyle(),
  };
  {
    const beatSrc: [MediaAsset, number][] = [
      [aSkyline, 3], [aNeon, 5], [aCross, 7], [sTrain, 2], [aCrowd, 9], [dAerial, 4],
      [sTaxi, 6], [aAlley, 3], [bNeon, 8], [aSkyline, 11], [bCross, 5], [dTowers, 2],
    ];
    beatSrc.forEach(([asset, inPt], i) => {
      const c = makeClip(asset, i * 0.5, (i + 1) * 0.5, inPt, {
        scale: i % 3 === 0 ? animated(104, [kf(0, 104), kf(0.5, 110)]) : prop(104),
      });
      montage.videoTracks[0].clips.push(c);
    });
  }
  const montageAsset: MediaAsset = {
    id: uid('asset'), name: 'NESTED_MONTAGE', type: 'sequence', sourcePath: '(sequence)', duration: 6,
    width: 1920, height: 1080, frameRate: 30, label: 'forest', binId: binIds.sequences,
    sequenceId: montage.id, metadata: {},
  };

  // ---------------- main sequence ----------------
  const main: Sequence = {
    id: uid('seq'), name: 'CITY_PULSE_MAIN', width: 1920, height: 1080, frameRate: 30,
    videoTracks: [
      makeTrack('video', 'V1'),
      makeTrack('video', 'V2'),
      makeTrack('video', 'V3'),
      makeTrack('video', 'V4'),
      makeTrack('video', 'V5'),
    ],
    audioTracks: [
      makeTrack('audio', 'A1'),
      makeTrack('audio', 'A2'),
      makeTrack('audio', 'A3'),
      makeTrack('audio', 'A4'),
    ],
    markers: [], captions: [], captionsVisible: true, audioSampleRate: 48000,
    captionStyle: defaultCaptionStyle(),
  };
  const [V1, V2, V3, V4, V5] = main.videoTracks;
  const [A1, A2, A3, A4] = main.audioTracks;

  const tr = (type: string, duration: number, alignment: 'start' | 'center' | 'end' = 'center') =>
    ({ id: uid('tr'), type: type as never, duration, alignment });

  // ----- V1 main footage -----
  V1.clips.push(
    makeClip(aBokeh, 0, 4, 0, {
      name: 'A000_bokeh_night',
      transitionIn: tr('dip-to-black', 0.8, 'start'),
    }),
    makeClip(aSkyline, 4, 8, 2, {
      transitionIn: tr('cross-dissolve', 1.0),
      scale: animated(100, [kf(0, 100), kf(4, 108, 'easeInOut')]),
    }),
    makeClip(sTrain, 8, 12, 1, {
      scale: animated(102, [kf(0, 102), kf(4, 106)]),
    }),
    makeClip(aCross, 12, 16, 3, {}),
    makeClip(aNeon, 16, 20, 2, {
      transitionIn: tr('cross-dissolve', 0.6),
      scale: animated(100, [kf(0, 100), kf(4, 107, 'easeIn')]),
    }),
    makeClip(aCrowd, 20, 24, 4, {}),
    makeClip(montageAsset, 24, 30, 0, { name: 'NESTED_MONTAGE' }),
    makeClip(sTaxi, 30, 34, 2, {
      name: 'S010_taxi_trails ×0.5',
      speed: 0.5,
      transitionIn: tr('blur-dissolve', 0.5),
    }),
    makeClip(dTowers, 34, 38, 1, {
      // split screen left half
      effects: [fx('crop', { right: 50, feather: 0 })],
      position: prop([960, 540]),
    }),
    makeClip(bCross, 38, 40.5, 0, { transitionIn: tr('push', 0.4) }),
    makeClip(bCross, 40.5, 41.2, 2.5, { name: 'B010_crossing_b [Freeze]', speed: 0 }),
    makeClip(dAerial, 41.2, 45, 6, {
      scale: animated(115, [kf(0, 115), kf(3.8, 100, 'easeOut')]),
      transitionOut: tr('dip-to-black', 1.2, 'end'),
    }),
  );

  // ----- V2 b-roll / overlays / split -----
  V2.clips.push(
    makeClip(bNeon, 6, 8, 5, {
      name: 'B030_neon_b [Overlay]',
      blendMode: 'screen',
      opacity: animated(35, [kf(0, 0), kf(0.5, 35), kf(1.5, 35), kf(2, 0)]),
    }),
    makeClip(bCrowd, 17, 19, 6, {
      name: 'B020_station_b [PiP]',
      scale: prop(28),
      position: animated([1520, 270], [kf(0, [1620, 270]), kf(0.4, [1520, 270], 'easeOut')]),
      opacity: animated(100, [kf(0, 0), kf(0.35, 100)]),
      effects: [fx('drop-shadow', { distance: 18, softness: 40, opacity: 70 })],
    }),
    makeClip(dAerial2, 34, 38, 3, {
      name: 'D020_aerial_dusk [Split R]',
      effects: [fx('crop', { left: 50, feather: 0 })],
    }),
  );

  // ----- V3 adjustment layers -----
  V3.clips.push(
    makeClip(adjAsset, 4, 44, 0, {
      name: 'City Grade',
      effects: [
        fx('lumetri', { temperature: -10, tint: 4, contrast: 12, saturation: 118, shadows: -6, highlights: -4 }),
        fx('vignette', { amount: -38, midpoint: 55, feather: 70 }),
      ],
    }),
  );

  // ----- V4 overlays -----
  // The demo film is deliberately text-free: titles, lower thirds and the end
  // logo live in 03_GRAPHICS as templates the user can drop in, not on the
  // timeline. V4 carries a grain overlay for the montage section instead.
  V4.clips.push(
    makeClip(grainAsset, 24, 30, 0, {
      name: 'Grain Boost',
      effects: [fx('grain', { amount: 30, size: 2 })],
    }),
  );

  // ----- V5 light leak accent -----
  V5.clips.push(
    makeClip(bNeon, 41, 45, 4, {
      name: 'Light Leak',
      blendMode: 'screen',
      scale: prop(140),
      opacity: animated(0, [kf(0, 0), kf(1.2, 26), kf(3.2, 26), kf(4, 0)]),
      effects: [fx('gaussian-blur', { amount: 60 })],
    }),
  );

  // ----- audio -----
  A1.clips.push(
    makeClip(mMusic, 0, 45, 0, {
      name: 'MUS_city_pulse_120bpm',
      volume: animated(0, [kf(41.8, 0), kf(44.8, -60)]),
      transitionIn: tr('constant-power', 0.4, 'start'),
    }),
  );
  A2.clips.push(
    makeClip(mAmb, 0, 45, 0, {
      name: 'AMB_tokyo_night_air',
      volume: animated(-16, [kf(0, -60), kf(2, -16), kf(43, -16), kf(45, -60)]),
    }),
  );
  const sfxAt = (asset: MediaAsset, t: number, vol = -6) =>
    makeClip(asset, t, t + asset.duration, 0, { volume: prop(vol) });
  A3.clips.push(
    sfxAt(sWhoosh, 3.5),
    sfxAt(sImpact, 8.0, -8),
    sfxAt(sImpact, 12.0, -9),
    sfxAt(sWhoosh, 15.6, -7),
    sfxAt(sRiser, 20.8, -6),
    sfxAt(sImpact, 24.0, -4),
    sfxAt(sWhoosh, 29.6, -7),
    sfxAt(sImpact, 34.0, -8),
    sfxAt(sWhoosh, 37.7, -8),
    sfxAt(sImpact, 41.2, -6),
  );
  A4.clips.push(
    makeClip(vTag, 41.5, 43.9, 0, { volume: prop(-10) }),
  );

  // ----- markers -----
  const markers: Marker[] = [];
  for (let b = 24; b <= 30; b += 0.5) {
    markers.push({ id: uid('mk'), time: b, duration: 0, name: 'Beat', comment: '', color: 'cyan' });
  }
  const sections: [number, string][] = [
    [0, 'オープニング'], [4, '夜景'], [8, '終電'], [12, '交差点'],
    [16, 'ネオン'], [20, '人の流れ'], [24, 'モンタージュ(ネスト)'], [30, 'スローモーション'],
    [34, '分割画面'], [38, 'Bカメラ+フリーズ'], [41, 'アウトロ'],
  ];
  for (const [t, name] of sections) {
    markers.push({ id: uid('mk'), time: t, duration: 0, name, comment: '', color: 'green' });
  }
  main.markers = markers.sort((a, b) => a.time - b.time);

  // ----- captions -----
  // Intentionally empty: the demo film carries no on-screen text. The caption
  // panel, SRT/VTT import-export and burn-in all stay fully functional.
  main.captions = [];

  // ---------------- social cut ----------------
  const social: Sequence = {
    id: uid('seq'), name: 'CITY_PULSE_SOCIAL', width: 1080, height: 1920, frameRate: 30,
    videoTracks: [makeTrack('video', 'V1'), makeTrack('video', 'V2')],
    audioTracks: [makeTrack('audio', 'A1')],
    markers: [], captions: [],
    captionsVisible: true, audioSampleRate: 48000, captionStyle: defaultCaptionStyle(),
  };
  social.videoTracks[0].clips.push(
    makeClip(aCross, 0, 5, 4, { scale: prop(180) }),
    makeClip(aNeon, 5, 10, 6, { scale: prop(180), transitionIn: tr('cross-dissolve', 0.6) }),
    makeClip(dAerial, 10, 15, 8, { scale: prop(180), transitionOut: tr('dip-to-black', 0.8, 'end') }),
  );
  social.audioTracks[0].clips.push(
    makeClip(mMusic, 0, 15, 20, { volume: animated(0, [kf(13, 0), kf(15, -60)]) }),
  );

  const mainAsset: MediaAsset = {
    id: uid('asset'), name: 'CITY_PULSE_MAIN', type: 'sequence', sourcePath: '(sequence)', duration: 45,
    width: 1920, height: 1080, frameRate: 30, label: 'forest', binId: binIds.sequences,
    sequenceId: main.id, metadata: {},
  };
  const socialAsset: MediaAsset = {
    id: uid('asset'), name: 'CITY_PULSE_SOCIAL', type: 'sequence', sourcePath: '(sequence)', duration: 15,
    width: 1080, height: 1920, frameRate: 30, label: 'forest', binId: binIds.sequences,
    sequenceId: social.id, metadata: {},
  };

  return {
    id: uid('proj'),
    name: 'CITY PULSE — Tokyo Night Promo',
    assets: [
      aBokeh, aSkyline, aCross, aNeon, aCrowd, aAlley, bCross, bCrowd, bNeon,
      dAerial, dAerial2, dTowers, sTaxi, sTrain,
      mMusic, mAmb, sWhoosh, sImpact, sRiser, vTag,
      gTitle, gLower, gCenter, gLogo, adjAsset, grainAsset,
      mainAsset, socialAsset, montageAsset,
    ],
    bins,
    sequences: [main, montage, social],
    settings: {
      autoSaveIntervalSec: 30,
      autoSaveEnabled: true,
      renderer: 'Canvas 2D (GPU compositing)',
      scratchDisk: 'Browser Storage (IndexedDB)',
      location: 'Local Project',
    },
    revision: 0,
  };
}

function defaultCaptionStyle() {
  return {
    fontFamily: '"Hiragino Sans", "Helvetica Neue", sans-serif',
    fontSize: 44,
    color: '#ffffff',
    bgColor: '#000000',
    bgOpacity: 0.55,
    position: 'bottom' as const,
    edge: 'shadow' as const,
  };
}
