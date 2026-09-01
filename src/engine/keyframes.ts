import type { Interp, Keyframe, Prop } from '../model/types';

const easeFns: Record<Interp, (t: number) => number> = {
  linear: (t) => t,
  hold: () => 0,
  bezier: (t) => t * t * (3 - 2 * t), // smoothstep
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function lerpValue(a: number | number[], b: number | number[], t: number): number | number[] {
  if (Array.isArray(a) && Array.isArray(b)) return a.map((v, i) => lerp(v, (b as number[])[i] ?? v, t));
  if (typeof a === 'number' && typeof b === 'number') return lerp(a, b, t);
  return a;
}

/**
 * Evaluate an animatable property at clip-local time (seconds from clip start).
 */
export function evalProp(p: Prop, localTime: number): number | number[] {
  if (!p.animated || p.keyframes.length === 0) return p.value;
  const kfs = p.keyframes;
  if (localTime <= kfs[0].time) return kfs[0].value;
  const last = kfs[kfs.length - 1];
  if (localTime >= last.time) return last.value;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (localTime >= a.time && localTime < b.time) {
      const span = b.time - a.time;
      const raw = span <= 0 ? 0 : (localTime - a.time) / span;
      const t = a.interpolation === 'hold' ? 0 : easeFns[a.interpolation](raw);
      return lerpValue(a.value, b.value, t);
    }
  }
  return last.value;
}

export const evalNum = (p: Prop, t: number): number => {
  const v = evalProp(p, t);
  return typeof v === 'number' ? v : v[0] ?? 0;
};

export const evalVec = (p: Prop, t: number): number[] => {
  const v = evalProp(p, t);
  return Array.isArray(v) ? v : [v, v];
};

/** Insert or update a keyframe (keeps list sorted). Returns the keyframe list. */
export function upsertKeyframe(p: Prop, kf: Keyframe, epsilon = 1e-4): void {
  const existing = p.keyframes.findIndex((k) => Math.abs(k.time - kf.time) < epsilon);
  if (existing >= 0) p.keyframes[existing] = { ...p.keyframes[existing], value: kf.value };
  else {
    p.keyframes.push(kf);
    p.keyframes.sort((a, b) => a.time - b.time);
  }
}

export function removeKeyframeAt(p: Prop, time: number, epsilon = 1e-4): void {
  p.keyframes = p.keyframes.filter((k) => Math.abs(k.time - time) >= epsilon);
}
