// ============================================================
// Effect registry + real pixel processing.
// Every video effect operates on actual frame pixels of a
// scratch canvas; audio effect defs are realized as WebAudio
// nodes by the audio engine.
// ============================================================

import type { EffectDef, EffectInstance, Prop } from '../model/types';
import { prop } from '../model/types';
import { uid } from '../model/ids';
import { evalNum, evalVec } from './keyframes';

// ---------------- definitions ----------------

export const VIDEO_EFFECT_DEFS: EffectDef[] = [
  {
    id: 'lumetri', name: 'Lumetriカラー', category: 'video', group: 'カラー補正',
    params: [
      { key: 'look', name: 'クリエイティブルック', type: 'select', options: ['なし', 'ティール&オレンジ', 'ノワール', 'ビビッド', 'フェードフィルム'], default: 0 },
      { key: 'temperature', name: '色温度', type: 'number', min: -100, max: 100, default: 0 },
      { key: 'tint', name: '色かぶり補正', type: 'number', min: -100, max: 100, default: 0 },
      { key: 'exposure', name: '露光量', type: 'number', min: -3, max: 3, step: 0.05, default: 0 },
      { key: 'contrast', name: 'コントラスト', type: 'number', min: -100, max: 100, default: 0 },
      { key: 'highlights', name: 'ハイライト', type: 'number', min: -100, max: 100, default: 0 },
      { key: 'shadows', name: 'シャドウ', type: 'number', min: -100, max: 100, default: 0 },
      { key: 'whites', name: '白レベル', type: 'number', min: -100, max: 100, default: 0 },
      { key: 'blacks', name: '黒レベル', type: 'number', min: -100, max: 100, default: 0 },
      { key: 'saturation', name: '彩度', type: 'number', min: 0, max: 200, default: 100 },
      { key: 'vibrance', name: '自然な彩度', type: 'number', min: -100, max: 100, default: 0 },
    ],
  },
  {
    id: 'gaussian-blur', name: 'ブラー(ガウス)', category: 'video', group: 'ブラー&シャープ',
    params: [{ key: 'amount', name: 'ブラー', type: 'number', min: 0, max: 100, default: 10 }],
  },
  {
    id: 'directional-blur', name: 'ブラー(方向)', category: 'video', group: 'ブラー&シャープ',
    params: [
      { key: 'angle', name: '方向', type: 'angle', min: 0, max: 360, default: 0 },
      { key: 'length', name: 'ブラーの長さ', type: 'number', min: 0, max: 100, default: 10 },
    ],
  },
  {
    id: 'sharpen', name: 'シャープ', category: 'video', group: 'ブラー&シャープ',
    params: [{ key: 'amount', name: 'シャープ量', type: 'number', min: 0, max: 100, default: 25 }],
  },
  {
    id: 'noise', name: 'ノイズ', category: 'video', group: 'ノイズ&グレイン',
    params: [{ key: 'amount', name: 'ノイズ量', type: 'number', min: 0, max: 100, default: 20 }],
  },
  {
    id: 'grain', name: 'フィルムグレイン', category: 'video', group: 'ノイズ&グレイン',
    params: [
      { key: 'amount', name: '強さ', type: 'number', min: 0, max: 100, default: 25 },
      { key: 'size', name: 'グレインサイズ', type: 'number', min: 1, max: 8, default: 2 },
    ],
  },
  {
    id: 'crop', name: 'クロップ', category: 'video', group: 'トランスフォーム',
    params: [
      { key: 'left', name: '左', type: 'number', min: 0, max: 100, default: 0, unit: '%' },
      { key: 'top', name: '上', type: 'number', min: 0, max: 100, default: 0, unit: '%' },
      { key: 'right', name: '右', type: 'number', min: 0, max: 100, default: 0, unit: '%' },
      { key: 'bottom', name: '下', type: 'number', min: 0, max: 100, default: 0, unit: '%' },
      { key: 'feather', name: '境界のぼかし', type: 'number', min: 0, max: 100, default: 0 },
    ],
  },
  {
    id: 'flip-horizontal', name: '水平方向に反転', category: 'video', group: 'トランスフォーム', params: [],
  },
  {
    id: 'flip-vertical', name: '垂直方向に反転', category: 'video', group: 'トランスフォーム', params: [],
  },
  {
    id: 'mirror', name: 'ミラー', category: 'video', group: 'ディストーション',
    params: [{ key: 'center', name: '反射の中心', type: 'number', min: 0, max: 100, default: 50 }],
  },
  {
    id: 'mosaic', name: 'モザイク', category: 'video', group: 'スタイライズ',
    params: [
      { key: 'blocksH', name: '水平ブロック', type: 'number', min: 2, max: 200, default: 40 },
      { key: 'blocksV', name: '垂直ブロック', type: 'number', min: 2, max: 200, default: 24 },
    ],
  },
  {
    id: 'posterize', name: 'ポスタリゼーション', category: 'video', group: 'スタイライズ',
    params: [{ key: 'levels', name: 'レベル', type: 'number', min: 2, max: 32, default: 6 }],
  },
  {
    id: 'black-white', name: '白黒', category: 'video', group: 'イメージコントロール', params: [],
  },
  {
    id: 'invert', name: '反転', category: 'video', group: 'チャンネル', params: [],
  },
  {
    id: 'tint', name: '色合い', category: 'video', group: 'カラー補正',
    params: [
      { key: 'blackTo', name: '黒をマップ', type: 'color', default: [10, 15, 40] },
      { key: 'whiteTo', name: '白をマップ', type: 'color', default: [255, 220, 180] },
      { key: 'amount', name: '着色量', type: 'number', min: 0, max: 100, default: 100 },
    ],
  },
  {
    id: 'chroma-key', name: 'Ultraキー', category: 'video', group: 'キーイング',
    params: [
      { key: 'keyColor', name: 'キーカラー', type: 'color', default: [0, 255, 0] },
      { key: 'tolerance', name: '許容量', type: 'number', min: 0, max: 100, default: 30 },
      { key: 'softness', name: '柔らかさ', type: 'number', min: 0, max: 100, default: 10 },
    ],
  },
  {
    id: 'luma-key', name: 'ルミナンスキー', category: 'video', group: 'キーイング',
    params: [
      { key: 'threshold', name: 'しきい値', type: 'number', min: 0, max: 100, default: 20 },
      { key: 'cutoff', name: 'カットオフ', type: 'number', min: 0, max: 100, default: 50 },
    ],
  },
  {
    id: 'drop-shadow', name: 'ドロップシャドウ', category: 'video', group: 'パース',
    params: [
      { key: 'distance', name: '距離', type: 'number', min: 0, max: 200, default: 12 },
      { key: 'angle', name: '方向', type: 'angle', min: 0, max: 360, default: 135 },
      { key: 'softness', name: '柔らかさ', type: 'number', min: 0, max: 100, default: 20 },
      { key: 'opacity', name: '不透明度', type: 'number', min: 0, max: 100, default: 60 },
    ],
  },
  {
    id: 'glow', name: 'グロー', category: 'video', group: 'スタイライズ',
    params: [
      { key: 'radius', name: 'グローの半径', type: 'number', min: 0, max: 100, default: 20 },
      { key: 'intensity', name: 'グローの強さ', type: 'number', min: 0, max: 200, default: 80 },
    ],
  },
  {
    id: 'vignette', name: 'ビネット', category: 'video', group: 'スタイライズ',
    params: [
      { key: 'amount', name: '適用量', type: 'number', min: -100, max: 100, default: -40 },
      { key: 'midpoint', name: '中間点', type: 'number', min: 0, max: 100, default: 50 },
      { key: 'feather', name: 'ぼかし', type: 'number', min: 0, max: 100, default: 60 },
    ],
  },
  {
    id: 'timecode', name: 'タイムコード', category: 'video', group: 'ビデオ',
    params: [{ key: 'size', name: 'サイズ', type: 'number', min: 10, max: 200, default: 60 }],
  },
];

export const AUDIO_EFFECT_DEFS: EffectDef[] = [
  {
    id: 'a-gain', name: 'ゲイン', category: 'audio', group: '振幅',
    params: [{ key: 'gain', name: 'ゲイン', type: 'number', min: -24, max: 24, default: 0, unit: 'dB' }],
  },
  {
    id: 'a-eq', name: 'パラメトリックイコライザー', category: 'audio', group: 'フィルターとEQ',
    params: [
      { key: 'low', name: '低域ゲイン', type: 'number', min: -18, max: 18, default: 0, unit: 'dB' },
      { key: 'mid', name: '中域ゲイン', type: 'number', min: -18, max: 18, default: 0, unit: 'dB' },
      { key: 'high', name: '高域ゲイン', type: 'number', min: -18, max: 18, default: 0, unit: 'dB' },
    ],
  },
  {
    id: 'a-highpass', name: 'ハイパス', category: 'audio', group: 'フィルターとEQ',
    params: [{ key: 'freq', name: 'カットオフ', type: 'number', min: 20, max: 4000, default: 120, unit: 'Hz' }],
  },
  {
    id: 'a-lowpass', name: 'ローパス', category: 'audio', group: 'フィルターとEQ',
    params: [{ key: 'freq', name: 'カットオフ', type: 'number', min: 200, max: 20000, default: 8000, unit: 'Hz' }],
  },
  {
    id: 'a-compressor', name: 'コンプレッサー', category: 'audio', group: 'ダイナミック',
    params: [
      { key: 'threshold', name: 'しきい値', type: 'number', min: -60, max: 0, default: -18, unit: 'dB' },
      { key: 'ratio', name: 'レシオ', type: 'number', min: 1, max: 20, default: 4 },
      { key: 'attack', name: 'アタック', type: 'number', min: 0, max: 1, step: 0.005, default: 0.01, unit: 's' },
      { key: 'release', name: 'リリース', type: 'number', min: 0.01, max: 1, step: 0.01, default: 0.2, unit: 's' },
    ],
  },
  {
    id: 'a-limiter', name: 'ハードリミッター', category: 'audio', group: 'ダイナミック',
    params: [{ key: 'ceiling', name: '最大振幅', type: 'number', min: -24, max: 0, default: -1, unit: 'dB' }],
  },
  {
    id: 'a-delay', name: 'ディレイ', category: 'audio', group: 'ディレイとエコー',
    params: [
      { key: 'time', name: 'ディレイタイム', type: 'number', min: 0.02, max: 2, step: 0.01, default: 0.35, unit: 's' },
      { key: 'feedback', name: 'フィードバック', type: 'number', min: 0, max: 95, default: 35, unit: '%' },
      { key: 'mix', name: 'ミックス', type: 'number', min: 0, max: 100, default: 30, unit: '%' },
    ],
  },
  {
    id: 'a-reverb', name: 'スタジオリバーブ', category: 'audio', group: 'リバーブ',
    params: [
      { key: 'size', name: 'ルームサイズ', type: 'number', min: 0, max: 100, default: 40 },
      { key: 'mix', name: 'ミックス', type: 'number', min: 0, max: 100, default: 25, unit: '%' },
    ],
  },
];

export const ALL_EFFECT_DEFS = [...VIDEO_EFFECT_DEFS, ...AUDIO_EFFECT_DEFS];

export const getEffectDef = (id: string): EffectDef | undefined =>
  ALL_EFFECT_DEFS.find((d) => d.id === id);

export function createEffectInstance(effectId: string): EffectInstance {
  const def = getEffectDef(effectId);
  const params: Record<string, Prop> = {};
  if (def) for (const p of def.params) params[p.key] = prop(p.default);
  return { id: uid('fx'), effectId, enabled: true, params };
}

// ---------------- canvas pool ----------------

export class CanvasPool {
  private free: HTMLCanvasElement[] = [];
  acquire(w: number, h: number): HTMLCanvasElement {
    const c = this.free.pop() ?? document.createElement('canvas');
    if (c.width !== w) c.width = w;
    if (c.height !== h) c.height = h;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, w, h);
    return c;
  }
  release(c: HTMLCanvasElement) {
    if (this.free.length < 12) this.free.push(c);
  }
}

// ---------------- SVG color-matrix filter (Lumetri core) ----------------

let svgRoot: SVGSVGElement | null = null;
const svgFilters = new Map<string, { el: SVGFilterElement; matrix: SVGFEColorMatrixElement; sat: SVGFEColorMatrixElement; gammaFuncs: SVGFEFuncRElement[] }>();

function ensureSvgRoot(): SVGSVGElement {
  if (svgRoot && document.body.contains(svgRoot)) return svgRoot;
  const NS = 'http://www.w3.org/2000/svg';
  svgRoot = document.createElementNS(NS, 'svg');
  svgRoot.setAttribute('width', '0');
  svgRoot.setAttribute('height', '0');
  svgRoot.style.position = 'absolute';
  svgRoot.style.pointerEvents = 'none';
  document.body.appendChild(svgRoot);
  return svgRoot;
}

function getSvgFilter(key: string) {
  let f = svgFilters.get(key);
  if (f && svgRoot?.contains(f.el)) return f;
  const NS = 'http://www.w3.org/2000/svg';
  const root = ensureSvgRoot();
  const el = document.createElementNS(NS, 'filter');
  el.setAttribute('id', key);
  el.setAttribute('color-interpolation-filters', 'sRGB');
  el.setAttribute('x', '0%');
  el.setAttribute('y', '0%');
  el.setAttribute('width', '100%');
  el.setAttribute('height', '100%');
  // gamma (shadows/highlights) → matrix (temp/tint/exposure/contrast) → saturate
  const gamma = document.createElementNS(NS, 'feComponentTransfer');
  const gammaFuncs: SVGFEFuncRElement[] = [];
  for (const tag of ['feFuncR', 'feFuncG', 'feFuncB'] as const) {
    const fn = document.createElementNS(NS, tag) as SVGFEFuncRElement;
    fn.setAttribute('type', 'gamma');
    fn.setAttribute('amplitude', '1');
    fn.setAttribute('exponent', '1');
    fn.setAttribute('offset', '0');
    gamma.appendChild(fn);
    gammaFuncs.push(fn);
  }
  const matrix = document.createElementNS(NS, 'feColorMatrix');
  matrix.setAttribute('type', 'matrix');
  matrix.setAttribute('values', '1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0');
  const sat = document.createElementNS(NS, 'feColorMatrix');
  sat.setAttribute('type', 'saturate');
  sat.setAttribute('values', '1');
  el.appendChild(gamma);
  el.appendChild(matrix);
  el.appendChild(sat);
  root.appendChild(el);
  f = { el, matrix, sat, gammaFuncs };
  svgFilters.set(key, f);
  return f;
}

let svgFilterSupported: boolean | null = null;
/** Chrome supports ctx.filter = 'url(#id)'; verify once at runtime. */
export function checkSvgFilterSupport(): boolean {
  if (svgFilterSupported !== null) return svgFilterSupported;
  try {
    const f = getSvgFilter('wvs_support_check');
    f.matrix.setAttribute('values', '0 0 0 0 1  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0'); // force red
    const c = document.createElement('canvas');
    c.width = c.height = 4;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.filter = 'url(#wvs_support_check)';
    ctx.fillStyle = '#00ff00';
    ctx.fillRect(0, 0, 4, 4);
    const px = ctx.getImageData(1, 1, 1, 1).data;
    svgFilterSupported = px[0] > 200 && px[1] < 50;
  } catch {
    svgFilterSupported = false;
  }
  return svgFilterSupported;
}

export interface LumetriValues {
  temperature: number; tint: number; exposure: number; contrast: number;
  highlights: number; shadows: number; whites: number; blacks: number;
  saturation: number; vibrance: number; look: number;
}

const LOOKS: Record<number, Partial<LumetriValues>> = {
  1: { temperature: 18, tint: -6, contrast: 18, saturation: 118 },   // Teal & Orange (warm push + contrast; shadows cooled below)
  2: { saturation: 0, contrast: 30, blacks: -20 },                   // Noir
  3: { saturation: 140, contrast: 15, vibrance: 30 },                // Vivid
  4: { contrast: -20, blacks: 25, saturation: 80 },                  // Faded Film
};

/** Apply Lumetri-style grade to a canvas in place (GPU via SVG color matrix). */
export function applyLumetri(canvas: HTMLCanvasElement, v: LumetriValues, pool: CanvasPool, filterKey: string): HTMLCanvasElement {
  const look = LOOKS[v.look];
  if (look) {
    v = { ...v };
    for (const [k, add] of Object.entries(look)) {
      const key = k as keyof LumetriValues;
      if (key === 'saturation') v.saturation = (v.saturation * (add as number)) / 100;
      else (v as unknown as Record<string, number>)[key] += add as number;
    }
  }
  const useSvg = checkSvgFilterSupport();
  const exposureMul = Math.pow(2, v.exposure);
  const contrast = 1 + v.contrast / 100;
  const satMul = Math.max(0, v.saturation / 100 + v.vibrance / 200);
  const tempOff = (v.temperature / 100) * 0.13;
  const tintOff = (v.tint / 100) * 0.1;
  // whites: gain on top end; blacks: offset lift
  const whiteGain = 1 + v.whites / 300;
  const blackOff = v.blacks / 500;

  const w = canvas.width, h = canvas.height;
  const out = pool.acquire(w, h);
  const octx = out.getContext('2d')!;

  if (useSvg) {
    const f = getSvgFilter(filterKey);
    // gamma from shadows/highlights: exponent <1 lifts shadows; amplitude scales highlights
    const exponent = Math.pow(2, -v.shadows / 200) * Math.pow(2, v.highlights / 400);
    const amplitude = Math.pow(2, v.highlights / 300);
    for (const fn of f.gammaFuncs) {
      fn.setAttribute('exponent', exponent.toFixed(4));
      fn.setAttribute('amplitude', amplitude.toFixed(4));
    }
    const m = exposureMul * contrast * whiteGain;
    const off = 0.5 - 0.5 * contrast * exposureMul * whiteGain + blackOff;
    const vals = [
      m, 0, 0, 0, off + tempOff,
      0, m, 0, 0, off - tintOff,
      0, 0, m, 0, off - tempOff,
      0, 0, 0, 1, 0,
    ].map((n) => n.toFixed(4)).join(' ');
    f.matrix.setAttribute('values', vals);
    f.sat.setAttribute('values', satMul.toFixed(3));
    octx.filter = `url(#${filterKey})`;
    octx.drawImage(canvas, 0, 0);
    octx.filter = 'none';
  } else {
    // fallback: CSS filter approximation + additive/multiplicative temp overlay
    octx.filter = `brightness(${exposureMul}) contrast(${contrast}) saturate(${satMul})`;
    octx.drawImage(canvas, 0, 0);
    octx.filter = 'none';
    if (Math.abs(tempOff) > 0.001 || Math.abs(tintOff) > 0.001) {
      const rOff = Math.round(Math.max(0, tempOff) * 255);
      const bOff = Math.round(Math.max(0, -tempOff) * 255);
      const gOff = Math.round(Math.max(0, -tintOff) * 255);
      octx.globalCompositeOperation = 'lighter';
      octx.fillStyle = `rgb(${rOff},${gOff},${bOff})`;
      octx.fillRect(0, 0, w, h);
      const rMul = 255 - Math.round(Math.max(0, -tempOff) * 200);
      const bMul = 255 - Math.round(Math.max(0, tempOff) * 200);
      const gMul = 255 - Math.round(Math.max(0, tintOff) * 200);
      octx.globalCompositeOperation = 'multiply';
      octx.fillStyle = `rgb(${rMul},${gMul},${bMul})`;
      octx.fillRect(0, 0, w, h);
      octx.globalCompositeOperation = 'source-over';
    }
  }
  pool.release(canvas);
  return out;
}

// ---------------- per-effect application ----------------

const grainCanvasCache = new Map<string, HTMLCanvasElement>();
function grainTile(size: number, seed: number): HTMLCanvasElement {
  const key = `${size}:${seed}`;
  let c = grainCanvasCache.get(key);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(256, 256);
  let s = seed * 7919 + 1;
  for (let i = 0; i < img.data.length; i += 4) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    const v = (s / 0x7fffffff) * 255;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  if (grainCanvasCache.size > 40) grainCanvasCache.clear();
  grainCanvasCache.set(key, c);
  return c;
}

/**
 * Apply the effect stack to a frame canvas. Returns a canvas (possibly a
 * different pooled one). `localTime` is clip-local seconds for keyframes.
 */
export function applyVideoEffects(
  canvas: HTMLCanvasElement,
  effects: EffectInstance[],
  localTime: number,
  pool: CanvasPool,
  frameTime = 0,
): HTMLCanvasElement {
  let cur = canvas;
  for (const fx of effects) {
    if (!fx.enabled) continue;
    const P = (key: string, fallback = 0) => (fx.params[key] ? evalNum(fx.params[key], localTime) : fallback);
    const PV = (key: string, fallback: number[] = [0, 0, 0]) => (fx.params[key] ? evalVec(fx.params[key], localTime) : fallback);
    const w = cur.width, h = cur.height;
    const scale = w / 1920; // param values are calibrated for 1080p

    switch (fx.effectId) {
      case 'lumetri': {
        cur = applyLumetri(cur, {
          temperature: P('temperature'), tint: P('tint'), exposure: P('exposure'), contrast: P('contrast'),
          highlights: P('highlights'), shadows: P('shadows'), whites: P('whites'), blacks: P('blacks'),
          saturation: P('saturation', 100), vibrance: P('vibrance'), look: P('look'),
        }, pool, `lum_${fx.id}`);
        break;
      }
      case 'gaussian-blur': {
        const amt = P('amount');
        if (amt <= 0) break;
        const out = pool.acquire(w, h);
        const octx = out.getContext('2d')!;
        octx.filter = `blur(${(amt * 0.35 * scale).toFixed(2)}px)`;
        octx.drawImage(cur, 0, 0);
        octx.filter = 'none';
        pool.release(cur);
        cur = out;
        break;
      }
      case 'directional-blur': {
        const len = P('length') * scale;
        if (len <= 0) break;
        const ang = (P('angle') * Math.PI) / 180;
        const dx = Math.cos(ang), dy = Math.sin(ang);
        const out = pool.acquire(w, h);
        const octx = out.getContext('2d')!;
        const steps = 9;
        octx.globalAlpha = 1 / steps;
        for (let i = 0; i < steps; i++) {
          const o = (i / (steps - 1) - 0.5) * len;
          octx.drawImage(cur, dx * o, dy * o);
        }
        octx.globalAlpha = 1;
        pool.release(cur);
        cur = out;
        break;
      }
      case 'sharpen': {
        const amt = P('amount') / 100;
        if (amt <= 0) break;
        // unsharp mask: original + (original - blurred) * amount
        const blur = pool.acquire(w, h);
        const bctx = blur.getContext('2d')!;
        bctx.filter = `blur(${2 * scale}px)`;
        bctx.drawImage(cur, 0, 0);
        bctx.filter = 'none';
        const octx = cur.getContext('2d')!;
        octx.globalCompositeOperation = 'source-over';
        // approximate: overlay high-pass via difference + lighter
        bctx.globalCompositeOperation = 'difference';
        bctx.drawImage(cur, 0, 0);
        octx.globalAlpha = Math.min(1, amt);
        octx.globalCompositeOperation = 'lighter';
        octx.drawImage(blur, 0, 0);
        octx.globalAlpha = 1;
        octx.globalCompositeOperation = 'source-over';
        pool.release(blur);
        break;
      }
      case 'noise':
      case 'grain': {
        const amt = P('amount') / 100;
        if (amt <= 0) break;
        const size = fx.effectId === 'grain' ? P('size', 2) : 1;
        const frameSeed = Math.floor(frameTime * 30) % 8;
        const tile = grainTile(size, frameSeed);
        const octx = cur.getContext('2d')!;
        octx.save();
        octx.globalAlpha = amt * 0.35;
        octx.globalCompositeOperation = 'overlay';
        const ts = 256 * size * scale;
        for (let y = 0; y < h; y += ts)
          for (let x = 0; x < w; x += ts)
            octx.drawImage(tile, x, y, ts, ts);
        octx.restore();
        break;
      }
      case 'crop': {
        const l = (P('left') / 100) * w, t = (P('top') / 100) * h;
        const r = (P('right') / 100) * w, b = (P('bottom') / 100) * h;
        const octx = cur.getContext('2d')!;
        octx.save();
        octx.globalCompositeOperation = 'destination-in';
        const feather = P('feather') * scale;
        if (feather > 0.5) octx.filter = `blur(${feather}px)`;
        octx.fillStyle = '#fff';
        octx.fillRect(l, t, w - l - r, h - t - b);
        octx.restore();
        break;
      }
      case 'flip-horizontal':
      case 'flip-vertical': {
        const out = pool.acquire(w, h);
        const octx = out.getContext('2d')!;
        if (fx.effectId === 'flip-horizontal') { octx.translate(w, 0); octx.scale(-1, 1); }
        else { octx.translate(0, h); octx.scale(1, -1); }
        octx.drawImage(cur, 0, 0);
        pool.release(cur);
        cur = out;
        break;
      }
      case 'mirror': {
        const cx = (P('center', 50) / 100) * w;
        const octx = cur.getContext('2d')!;
        octx.save();
        octx.translate(cx * 2, 0);
        octx.scale(-1, 1);
        octx.beginPath();
        octx.rect(0, 0, cx, h);
        octx.clip();
        octx.drawImage(cur, 0, 0);
        octx.restore();
        break;
      }
      case 'mosaic': {
        const bw = Math.max(2, P('blocksH', 40));
        const bh = Math.max(2, P('blocksV', 24));
        const small = pool.acquire(Math.ceil(bw), Math.ceil(bh));
        const sctx = small.getContext('2d')!;
        sctx.imageSmoothingEnabled = true;
        sctx.drawImage(cur, 0, 0, bw, bh);
        const octx = cur.getContext('2d')!;
        octx.imageSmoothingEnabled = false;
        octx.drawImage(small, 0, 0, bw, bh, 0, 0, w, h);
        octx.imageSmoothingEnabled = true;
        pool.release(small);
        break;
      }
      case 'posterize': {
        const levels = Math.max(2, Math.round(P('levels', 6)));
        const octx = cur.getContext('2d', { willReadFrequently: true })!;
        const img = octx.getImageData(0, 0, w, h);
        const d = img.data;
        const step = 255 / (levels - 1);
        for (let i = 0; i < d.length; i += 4) {
          d[i] = Math.round(d[i] / step) * step;
          d[i + 1] = Math.round(d[i + 1] / step) * step;
          d[i + 2] = Math.round(d[i + 2] / step) * step;
        }
        octx.putImageData(img, 0, 0);
        break;
      }
      case 'black-white': {
        const out = pool.acquire(w, h);
        const octx = out.getContext('2d')!;
        octx.filter = 'grayscale(1)';
        octx.drawImage(cur, 0, 0);
        octx.filter = 'none';
        pool.release(cur);
        cur = out;
        break;
      }
      case 'invert': {
        const out = pool.acquire(w, h);
        const octx = out.getContext('2d')!;
        octx.filter = 'invert(1)';
        octx.drawImage(cur, 0, 0);
        octx.filter = 'none';
        pool.release(cur);
        cur = out;
        break;
      }
      case 'tint': {
        const amt = P('amount', 100) / 100;
        if (amt <= 0) break;
        const black = PV('blackTo', [0, 0, 0]);
        const white = PV('whiteTo', [255, 255, 255]);
        const gray = pool.acquire(w, h);
        const gctx = gray.getContext('2d')!;
        gctx.filter = 'grayscale(1)';
        gctx.drawImage(cur, 0, 0);
        gctx.filter = 'none';
        // map: black*(1-l) + white*l  →  multiply by (white-black) then add black
        gctx.globalCompositeOperation = 'multiply';
        gctx.fillStyle = `rgb(${white.map((v, i) => Math.max(0, v - black[i])).join(',')})`;
        gctx.fillRect(0, 0, w, h);
        gctx.globalCompositeOperation = 'lighter';
        gctx.fillStyle = `rgb(${black.join(',')})`;
        gctx.fillRect(0, 0, w, h);
        gctx.globalCompositeOperation = 'destination-in';
        gctx.drawImage(cur, 0, 0); // keep alpha
        const octx = cur.getContext('2d')!;
        octx.globalAlpha = amt;
        octx.drawImage(gray, 0, 0);
        octx.globalAlpha = 1;
        pool.release(gray);
        break;
      }
      case 'chroma-key': {
        const key = PV('keyColor', [0, 255, 0]);
        const tol = P('tolerance', 30) * 2.55 * 1.8;
        const soft = P('softness', 10) * 2.55;
        const octx = cur.getContext('2d', { willReadFrequently: true })!;
        const img = octx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const dr = d[i] - key[0], dg = d[i + 1] - key[1], db = d[i + 2] - key[2];
          const dist = Math.sqrt(dr * dr + dg * dg + db * db);
          if (dist < tol) d[i + 3] = 0;
          else if (dist < tol + soft) d[i + 3] = Math.round((d[i + 3] * (dist - tol)) / soft);
        }
        octx.putImageData(img, 0, 0);
        break;
      }
      case 'luma-key': {
        const th = P('threshold', 20) * 2.55;
        const cut = P('cutoff', 50) * 2.55;
        const octx = cur.getContext('2d', { willReadFrequently: true })!;
        const img = octx.getImageData(0, 0, w, h);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
          if (l < th) d[i + 3] = 0;
          else if (l < th + Math.max(1, cut - th)) d[i + 3] = Math.round((d[i + 3] * (l - th)) / Math.max(1, cut - th));
        }
        octx.putImageData(img, 0, 0);
        break;
      }
      case 'drop-shadow': {
        const dist = P('distance', 12) * scale;
        const ang = (P('angle', 135) * Math.PI) / 180;
        const soft = P('softness', 20) * 0.5 * scale;
        const op = P('opacity', 60) / 100;
        const out = pool.acquire(w, h);
        const octx = out.getContext('2d')!;
        octx.filter = `drop-shadow(${(Math.cos(ang) * dist).toFixed(1)}px ${(Math.sin(ang) * dist).toFixed(1)}px ${soft.toFixed(1)}px rgba(0,0,0,${op}))`;
        octx.drawImage(cur, 0, 0);
        octx.filter = 'none';
        pool.release(cur);
        cur = out;
        break;
      }
      case 'glow': {
        const radius = P('radius', 20) * scale;
        const intensity = P('intensity', 80) / 100;
        if (radius <= 0 || intensity <= 0) break;
        const octx = cur.getContext('2d')!;
        octx.save();
        octx.globalCompositeOperation = 'lighter';
        octx.globalAlpha = Math.min(1, intensity);
        octx.filter = `blur(${radius}px) brightness(1.2)`;
        octx.drawImage(cur, 0, 0);
        octx.restore();
        break;
      }
      case 'vignette': {
        const amt = P('amount', -40) / 100;
        if (Math.abs(amt) < 0.005) break;
        const mid = P('midpoint', 50) / 100;
        const feather = Math.max(0.01, P('feather', 60) / 100);
        const octx = cur.getContext('2d')!;
        const maxR = Math.hypot(w, h) / 2;
        const g = octx.createRadialGradient(w / 2, h / 2, maxR * mid * (1 - feather), w / 2, h / 2, maxR * (mid + feather));
        const col = amt < 0 ? '0,0,0' : '255,255,255';
        g.addColorStop(0, `rgba(${col},0)`);
        g.addColorStop(1, `rgba(${col},${Math.min(1, Math.abs(amt))})`);
        octx.fillStyle = g;
        octx.fillRect(0, 0, w, h);
        break;
      }
      case 'timecode': {
        const size = P('size', 60) * scale;
        const octx = cur.getContext('2d')!;
        const frames = Math.floor(frameTime * 30);
        const ff = frames % 30, ss = Math.floor(frames / 30) % 60, mm = Math.floor(frames / 1800) % 60, hh = Math.floor(frames / 108000);
        const pad = (n: number) => String(n).padStart(2, '0');
        const text = `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
        octx.font = `${size}px "SF Mono", Menlo, monospace`;
        octx.textAlign = 'center';
        const tw = octx.measureText(text).width;
        octx.fillStyle = 'rgba(0,0,0,0.65)';
        octx.fillRect(w / 2 - tw / 2 - size * 0.3, h * 0.82 - size * 0.85, tw + size * 0.6, size * 1.2);
        octx.fillStyle = '#fff';
        octx.fillText(text, w / 2, h * 0.82);
        break;
      }
    }
  }
  return cur;
}
