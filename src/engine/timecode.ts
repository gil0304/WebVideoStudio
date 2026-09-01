/** Format seconds as SMPTE timecode HH:MM:SS:FF (non-drop). */
export function toTimecode(sec: number, fps = 30): string {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const totalFrames = Math.round(sec * fps);
  const f = totalFrames % fps;
  const s = Math.floor(totalFrames / fps) % 60;
  const m = Math.floor(totalFrames / (fps * 60)) % 60;
  const h = Math.floor(totalFrames / (fps * 3600));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

/** Parse "HH:MM:SS:FF" or "SS" etc. into seconds. Returns null when invalid. */
export function parseTimecode(tc: string, fps = 30): number | null {
  const parts = tc.trim().split(/[:;.]/).map((p) => parseInt(p, 10));
  if (parts.some((p) => isNaN(p))) return null;
  while (parts.length < 4) parts.unshift(0);
  const [h, m, s, f] = parts.slice(-4);
  return h * 3600 + m * 60 + s + f / fps;
}

export const snapToFrame = (sec: number, fps = 30): number => Math.round(sec * fps) / fps;
export const frameStep = (fps = 30): number => 1 / fps;
