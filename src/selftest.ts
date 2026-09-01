// ============================================================
// In-browser self-test harness (spec §34). Open the app with
// ?selftest=1 — exercises editing operations, the render
// pipeline, keyframes, audio synthesis and export, then prints
// a report to console + overlay. Proves the editor is real:
// edits change pixels; there is no pre-rendered video.
// ============================================================

import { useStudio, getActiveSequence, getPlayhead } from './state/store';
import { renderSequenceFrame } from './engine/renderer';
import { CanvasPool } from './engine/effects';
import { MediaCache } from './engine/sources';
import { evalProp } from './engine/keyframes';
import { prop } from './model/types';
import { audioEngine } from './engine/audioEngine';
import { exportSequence, defaultExportSettings } from './engine/exporter';
import { toTimecode, parseTimecode } from './engine/timecode';

interface TestResult { name: string; pass: boolean; detail?: string }
const results: TestResult[] = [];

function t(name: string, fn: () => boolean | string): void {
  try {
    const r = fn();
    if (r === true) results.push({ name, pass: true });
    else results.push({ name, pass: false, detail: typeof r === 'string' ? r : 'assertion failed' });
  } catch (e) {
    results.push({ name, pass: false, detail: String(e) });
  }
}
async function ta(name: string, fn: () => Promise<boolean | string>): Promise<void> {
  try {
    const r = await fn();
    if (r === true) results.push({ name, pass: true });
    else results.push({ name, pass: false, detail: typeof r === 'string' ? r : 'assertion failed' });
  } catch (e) {
    results.push({ name, pass: false, detail: String(e) });
  }
}

async function renderFramePixels(time: number): Promise<Uint8ClampedArray> {
  const s = useStudio.getState();
  const seq = getActiveSequence(s);
  const c = document.createElement('canvas');
  c.width = 192; c.height = 108;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  await renderSequenceFrame(ctx, s.project, seq, time, {
    width: 480, height: 270, pool: new CanvasPool(), media: new MediaCache(),
  });
  return ctx.getImageData(0, 0, 192, 108).data;
}

const meanLuma = (d: Uint8ClampedArray) => {
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
  return sum / (d.length / 4);
};
const pixelDiff = (a: Uint8ClampedArray, b: Uint8ClampedArray) => {
  let diff = 0;
  for (let i = 0; i < a.length; i += 4) diff += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
  return diff / (a.length / 4);
};

export async function runSelfTest(): Promise<void> {
  const S = () => useStudio.getState();
  console.log('%c[SelfTest] starting', 'color:#4da3ff');
  S().resetToDemo();

  // ---------- unit: timecode ----------
  t('timecode roundtrip', () => toTimecode(parseTimecode('00:00:10:15', 30)!, 30) === '00:00:10:15');
  t('timecode format', () => toTimecode(45, 30) === '00:00:45:00');

  // ---------- unit: keyframes ----------
  t('keyframe interpolation linear', () => {
    const p = { ...prop(0), animated: true, keyframes: [
      { id: 'a', time: 0, value: 0, interpolation: 'linear' as const },
      { id: 'b', time: 2, value: 100, interpolation: 'linear' as const },
    ] };
    return Math.abs((evalProp(p, 1) as number) - 50) < 0.01 || `got ${evalProp(p, 1)}`;
  });
  t('keyframe hold', () => {
    const p = { ...prop(0), animated: true, keyframes: [
      { id: 'a', time: 0, value: 10, interpolation: 'hold' as const },
      { id: 'b', time: 2, value: 99, interpolation: 'linear' as const },
    ] };
    return (evalProp(p, 1.5) as number) === 10;
  });

  // ---------- edit graph operations ----------
  const seq0 = getActiveSequence(S());
  const v1 = seq0.videoTracks[0];
  const clipCount0 = v1.clips.length;
  const third = v1.clips[2];

  t('demo timeline populated', () => clipCount0 >= 10 && seq0.audioTracks[0].clips.length >= 1);

  // the finished demo film must carry no on-screen text
  t('demo film contains no on-screen text', () => {
    for (const seq of S().project.sequences) {
      if (seq.captions.length > 0) return `${seq.name}: ${seq.captions.length} captions`;
      for (const tr of seq.videoTracks)
        for (const c of tr.clips)
          if (c.textLayers && c.textLayers.length > 0) return `${seq.name}: text clip "${c.name}"`;
    }
    return true;
  });

  // razor (体験2)
  S().razorClip(third.id, (third.start + third.end) / 2);
  t('razor splits clip', () => {
    const v = getActiveSequence(S()).videoTracks[0];
    return v.clips.length === clipCount0 + 1 || `count ${v.clips.length}`;
  });
  // ripple delete second half
  const v1b = getActiveSequence(S()).videoTracks[0];
  const rightHalf = v1b.clips.find((c) => Math.abs(c.start - (third.start + third.end) / 2) < 0.03)!;
  const afterStart = v1b.clips.find((c) => c.start >= third.end - 0.03)!;
  const gap = rightHalf.end - rightHalf.start;
  S().deleteClips([rightHalf.id], true);
  t('ripple delete closes gap', () => {
    const v = getActiveSequence(S()).videoTracks[0];
    const moved = v.clips.find((c) => c.id === afterStart.id)!;
    return Math.abs(moved.start - (afterStart.start - gap)) < 0.05 || `start ${moved.start} vs ${afterStart.start - gap}`;
  });
  // undo × 2 restores
  S().undo();
  S().undo();
  t('undo restores timeline', () => {
    const v = getActiveSequence(S()).videoTracks[0];
    return v.clips.length === clipCount0 && Math.abs(v.clips[2].end - third.end) < 0.001;
  });
  S().redo();
  t('redo re-applies razor', () => getActiveSequence(S()).videoTracks[0].clips.length === clipCount0 + 1);
  S().undo();

  // trim
  const c0 = getActiveSequence(S()).videoTracks[0].clips[1];
  S().trimClip(c0.id, 'out', c0.end - 0.5, false);
  t('trim out shortens clip', () => {
    const c = getActiveSequence(S()).videoTracks[0].clips[1];
    return Math.abs(c.end - (c0.end - 0.5)) < 0.001;
  });
  S().undo();

  // move with overwrite semantics
  const cM = getActiveSequence(S()).videoTracks[1].clips[0];
  S().moveClips([cM.id], 1.0, 0);
  t('move shifts clip', () => {
    const seq = getActiveSequence(S());
    const c = seq.videoTracks[1].clips.find((cc) => cc.id === cM.id)!;
    return Math.abs(c.start - (cM.start + 1.0)) < 0.05 || `start ${c.start}`;
  });
  S().undo();

  // insert edit shifts downstream
  const musicAsset = S().project.assets.find((a) => a.name.startsWith('SFX_whoosh'))!;
  const beforeInsert = getActiveSequence(S()).videoTracks[0].clips.length;
  S().setPlayhead(0);
  S().insertEdit(musicAsset.id, 2);
  t('insert edit executes', () => {
    void beforeInsert;
    const a1 = getActiveSequence(S()).audioTracks[0];
    return a1.clips.length >= 2; // whoosh landed on audio patch track
  });
  S().undo();

  // speed / freeze
  const cS = getActiveSequence(S()).videoTracks[0].clips[3];
  S().setClipSpeed(cS.id, 2, false);
  t('speed 2x halves duration', () => {
    const c = getActiveSequence(S()).videoTracks[0].clips.find((cc) => cc.id === cS.id)!;
    const expect = (cS.end - cS.start) / 2;
    return Math.abs((c.end - c.start) - expect) < 0.05 || `dur ${(c.end - c.start).toFixed(2)} vs ${expect.toFixed(2)}`;
  });
  S().undo();

  // ---------- render pipeline is live ----------
  const f6 = await renderFramePixels(6.5);
  const f13 = await renderFramePixels(13.5);
  const f22 = await renderFramePixels(22);
  await ta('frames are non-black', async () => meanLuma(f6) > 6 && meanLuma(f13) > 6 || `luma ${meanLuma(f6).toFixed(1)}`);
  await ta('different times → different frames', async () => pixelDiff(f6, f13) > 8 && pixelDiff(f13, f22) > 8 || `diff ${pixelDiff(f6, f13).toFixed(1)}`);

  // editing changes pixels (proves no hidden video)
  await ta('color grade edit changes output pixels', async () => {
    const before = await renderFramePixels(10);
    const adj = getActiveSequence(S()).videoTracks[2].clips[0];
    const lum = adj.effects.find((e) => e.effectId === 'lumetri')!;
    S().setPropValue(adj.id, { kind: 'effect', instanceId: lum.id, key: 'saturation' }, 0);
    const after = await renderFramePixels(10);
    S().undo();
    return pixelDiff(before, after) > 2 || `diff ${pixelDiff(before, after).toFixed(2)}`;
  });
  await ta('text clip can be added and edited (体験3)', async () => {
    const before = await renderFramePixels(43.2);
    S().addGraphicClip(43, 'CITY PULSE');
    const seq = getActiveSequence(S());
    const top = seq.videoTracks[seq.videoTracks.length - 1];
    const clip = top.clips.find((c) => c.textLayers && c.textLayers.length > 0);
    if (!clip) return 'graphic clip not created';
    const added = await renderFramePixels(43.2);
    const layer = clip.textLayers!.find((l) => l.kind === 'text')!;
    S().patchTextLayer(clip.id, layer.id, { text: 'TOKYO NEVER STOPS' });
    const edited = await renderFramePixels(43.2);
    S().undo();
    S().undo();
    const dAdd = pixelDiff(before, added);
    const dEdit = pixelDiff(added, edited);
    return (dAdd > 1 && dEdit > 0.5) || `add ${dAdd.toFixed(2)} / edit ${dEdit.toFixed(2)}`;
  });
  await ta('disabling track V1 changes output', async () => {
    const before = await renderFramePixels(10);
    const track = getActiveSequence(S()).videoTracks[0];
    S().patchTrack(track.id, { enabled: false });
    const after = await renderFramePixels(10);
    S().undo();
    return pixelDiff(before, after) > 10 || `diff ${pixelDiff(before, after).toFixed(1)}`;
  });
  await ta('nested sequence renders', async () => {
    const f = await renderFramePixels(27);
    return meanLuma(f) > 6 || `luma ${meanLuma(f).toFixed(1)}`;
  });
  await ta('transition midpoint blends', async () => {
    // cross dissolve at t=4 (±0.5): frame at 4.0 should differ from both sides
    const a = await renderFramePixels(3.2);
    const mid = await renderFramePixels(4.0);
    const b = await renderFramePixels(4.8);
    return pixelDiff(a, mid) > 2 && pixelDiff(b, mid) > 2 || 'transition not blending';
  });

  // ---------- audio ----------
  await ta('music synthesis produces real samples', async () => {
    const music = S().project.assets.find((a) => a.procedural === 'music_main')!;
    const buf = await audioEngine.ensureAssetBuffer(music);
    if (!buf) return 'no buffer';
    const d = buf.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i += 97) peak = Math.max(peak, Math.abs(d[i]));
    return peak > 0.1 || `peak ${peak}`;
  });
  await ta('waveform peaks derive from samples', async () => {
    const music = S().project.assets.find((a) => a.procedural === 'music_main')!;
    await audioEngine.ensureAssetBuffer(music);
    const wf = audioEngine.waveform(music);
    if (!wf) return 'no waveform';
    let nonzero = 0;
    for (let i = 0; i < wf.peaks.length; i++) if (Math.abs(wf.peaks[i]) > 0.02) nonzero++;
    return nonzero > wf.buckets * 0.5 || `nonzero ${nonzero}/${wf.buckets}`;
  });
  await ta('offline sequence mix renders', async () => {
    const s = S();
    const mix = await audioEngine.renderMix(s.project, getActiveSequence(s), 3);
    const d = mix.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < d.length; i += 53) peak = Math.max(peak, Math.abs(d[i]));
    return peak > 0.05 || `peak ${peak}`;
  });

  // ---------- export (2s MP4/WebM) ----------
  await ta('video export produces a real file', async () => {
    const s = S();
    const seq = getActiveSequence(s);
    const settings = { ...defaultExportSettings(seq), rangeStart: 4, rangeEnd: 6, fileName: 'selftest' };
    if (typeof VideoEncoder === 'undefined') return 'WebCodecs unavailable (skipped)';
    try {
      const r = await exportSequence(s.project, seq, settings, () => undefined, new AbortController().signal);
      return (r.blob.size > 50_000 && (r.extension === 'mp4' || r.extension === 'webm')) || `size ${r.blob.size}`;
    } catch (e) {
      // fall back to webm
      const r = await exportSequence(s.project, seq, { ...settings, format: 'webm' }, () => undefined, new AbortController().signal);
      return r.blob.size > 50_000 || `webm size ${r.blob.size}; mp4 err ${e}`;
    }
  });
  await ta('caption add + SRT export well-formed', async () => {
    S().addCaption(5, 8, 'テスト字幕');
    const s = S();
    const seq = getActiveSequence(s);
    const r = await exportSequence(s.project, seq, { ...defaultExportSettings(seq), format: 'srt' }, () => undefined, new AbortController().signal);
    const text = await r.blob.text();
    S().undo();
    return (text.includes('-->') && text.includes('テスト字幕')) || `got: ${text.slice(0, 60)}`;
  });

  // ---------- state invariants ----------
  t('tracks stay sorted & non-overlapping', () => {
    const seq = getActiveSequence(S());
    for (const tr of [...seq.videoTracks, ...seq.audioTracks]) {
      for (let i = 1; i < tr.clips.length; i++) {
        if (tr.clips[i].start < tr.clips[i - 1].end - 0.002) return `overlap on ${tr.name}`;
      }
    }
    return true;
  });
  t('playhead accessor works', () => getPlayhead(S()) >= 0);

  // ---------- report ----------
  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass);
  console.log(`%c[SelfTest] ${passed}/${results.length} passed`, failed.length ? 'color:#e05555;font-weight:bold' : 'color:#3a8: bold');
  for (const r of results) {
    console.log(`${r.pass ? '✅' : '❌'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  const el = document.createElement('div');
  el.id = 'selftest-report';
  el.style.cssText = 'position:fixed;top:40px;right:12px;z-index:99999;background:#111c;border:1px solid #444;border-radius:8px;padding:12px 16px;font:11px/1.7 monospace;color:#ddd;max-height:80vh;overflow:auto;backdrop-filter:blur(6px)';
  el.innerHTML = `<b style="color:${failed.length ? '#ff7777' : '#66dd88'}">SelfTest: ${passed}/${results.length} passed</b><br>` +
    results.map((r) => `<span style="color:${r.pass ? '#66dd88' : '#ff7777'}">${r.pass ? '✔' : '✘'} ${r.name}</span>${r.detail ? ` <span style="color:#999">${r.detail}</span>` : ''}`).join('<br>');
  document.body.appendChild(el);
  S().resetToDemo();
}
