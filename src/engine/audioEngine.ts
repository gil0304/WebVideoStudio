// ============================================================
// Audio engine — schedules real AudioBuffers through per-clip
// gain/pan/effect chains into per-track buses. The same graph
// builder runs on the realtime AudioContext (playback) and on
// an OfflineAudioContext (export mix).
// ============================================================

import type { MediaAsset, Sequence, TimelineClip, VideoProject } from '../model/types';
import { getAsset, getSequence, sequenceDuration } from '../model/types';
import { evalNum } from './keyframes';
import { synthesizeAudio, computePeaks, type WaveformPeaks } from './audioSynth';
import { getBlob } from './sources';

const dbToGain = (db: number): number => (db <= -59 ? 0 : Math.pow(10, db / 20));

interface TrackBus {
  gain: GainNode;
  analyser: AnalyserNode;
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, Promise<AudioBuffer | null>>();
  private activeSources: AudioBufferSourceNode[] = [];
  private trackBuses = new Map<string, TrackBus>();
  private masterAnalyser: AnalyserNode | null = null;
  private startCtxTime = 0;
  private startSeqTime = 0;
  playing = false;

  ensureCtx(): AudioContext {
    if (!this.ctx) this.ctx = new AudioContext({ sampleRate: 48000 });
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  async ensureAssetBuffer(asset: MediaAsset): Promise<AudioBuffer | null> {
    const cached = this.buffers.get(asset.id);
    if (cached) return cached;
    let p = this.pending.get(asset.id);
    if (!p) {
      p = (async () => {
        try {
          if (asset.procedural) {
            const buf = await synthesizeAudio(asset.procedural, asset.duration);
            this.buffers.set(asset.id, buf);
            return buf;
          }
          if (asset.fileId) {
            const blob = getBlob(asset.fileId);
            if (!blob) return null;
            const arr = await blob.arrayBuffer();
            const ctx = this.ensureCtx();
            const buf = await ctx.decodeAudioData(arr);
            this.buffers.set(asset.id, buf);
            return buf;
          }
        } catch {
          return null;
        }
        return null;
      })();
      this.pending.set(asset.id, p);
    }
    return p;
  }

  getBufferSync(assetId: string): AudioBuffer | null {
    return this.buffers.get(assetId) ?? null;
  }

  /** Preload every audio buffer used by the sequence (incl. one nest level). */
  async prepareSequence(project: VideoProject, seq: Sequence, depth = 0): Promise<void> {
    const jobs: Promise<unknown>[] = [];
    const scan = (s: Sequence, d: number) => {
      for (const track of [...s.audioTracks, ...s.videoTracks]) {
        for (const clip of track.clips) {
          const asset = getAsset(project, clip.assetId);
          if (!asset) continue;
          if ((asset.type === 'audio' || asset.hasAudio) && track.type === 'audio') jobs.push(this.ensureAssetBuffer(asset));
          if (asset.type === 'sequence' && asset.sequenceId && d < 3) {
            const nested = getSequence(project, asset.sequenceId);
            if (nested) scan(nested, d + 1);
          }
        }
      }
    };
    scan(seq, depth);
    await Promise.all(jobs);
  }

  waveform(asset: MediaAsset): WaveformPeaks | null {
    const buf = this.buffers.get(asset.id);
    if (!buf) {
      void this.ensureAssetBuffer(asset);
      return null;
    }
    return computePeaks(asset.id, buf);
  }

  // ---------------- graph building ----------------

  private scheduleClipGain(param: AudioParam, clip: TimelineClip, from: number, base: (t: number) => number, timeOffset: number, ctxStart: number): void {
    // Sample volume envelope (keyframes + transitions) at 20ms resolution over the audible span.
    const dur = clip.end - clip.start;
    const step = 0.02;
    const startLocal = Math.max(0, from - clip.start);
    param.setValueAtTime(this.envGain(clip, startLocal, base), ctxStart);
    for (let lt = startLocal + step; lt <= dur + 1e-6; lt += step) {
      const v = this.envGain(clip, lt, base);
      param.linearRampToValueAtTime(v, ctxStart + (lt - startLocal) + timeOffset * 0);
    }
  }

  private envGain(clip: TimelineClip, localTime: number, base: (t: number) => number): number {
    let g = base(localTime);
    const dur = clip.end - clip.start;
    // audio transitions as fades
    if (clip.transitionIn) {
      const d = clip.transitionIn.duration;
      if (localTime < d) {
        const p = Math.max(0, localTime / d);
        g *= clip.transitionIn.type === 'constant-power' ? Math.sin((p * Math.PI) / 2)
          : clip.transitionIn.type === 'exponential-fade' ? p * p : p;
      }
    }
    if (clip.transitionOut) {
      const d = clip.transitionOut.duration;
      if (localTime > dur - d) {
        const p = Math.max(0, Math.min(1, (dur - localTime) / d));
        g *= clip.transitionOut.type === 'constant-power' ? Math.sin((p * Math.PI) / 2)
          : clip.transitionOut.type === 'exponential-fade' ? p * p : p;
      }
    }
    return g;
  }

  private buildClipChain(ctx: BaseAudioContext, clip: TimelineClip, dest: AudioNode): AudioNode {
    // effect chain: dest ← ... ← head. Returns head (where source connects).
    let head: AudioNode = dest;
    const fx = [...clip.effects].reverse();
    for (const inst of fx) {
      if (!inst.enabled) continue;
      const P = (key: string, fallback = 0) => (inst.params[key] ? evalNum(inst.params[key], 0) : fallback);
      let node: AudioNode | null = null;
      let tail: AudioNode | null = null;
      switch (inst.effectId) {
        case 'a-gain': {
          const g = ctx.createGain();
          g.gain.value = dbToGain(P('gain'));
          node = tail = g;
          break;
        }
        case 'a-eq': {
          const low = ctx.createBiquadFilter();
          low.type = 'lowshelf'; low.frequency.value = 250; low.gain.value = P('low');
          const mid = ctx.createBiquadFilter();
          mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.8; mid.gain.value = P('mid');
          const high = ctx.createBiquadFilter();
          high.type = 'highshelf'; high.frequency.value = 6000; high.gain.value = P('high');
          low.connect(mid).connect(high);
          node = low; tail = high;
          break;
        }
        case 'a-highpass': {
          const f = ctx.createBiquadFilter();
          f.type = 'highpass'; f.frequency.value = P('freq', 120);
          node = tail = f;
          break;
        }
        case 'a-lowpass': {
          const f = ctx.createBiquadFilter();
          f.type = 'lowpass'; f.frequency.value = P('freq', 8000);
          node = tail = f;
          break;
        }
        case 'a-compressor': {
          const c = ctx.createDynamicsCompressor();
          c.threshold.value = P('threshold', -18);
          c.ratio.value = P('ratio', 4);
          c.attack.value = P('attack', 0.01);
          c.release.value = P('release', 0.2);
          node = tail = c;
          break;
        }
        case 'a-limiter': {
          const c = ctx.createDynamicsCompressor();
          c.threshold.value = P('ceiling', -1);
          c.ratio.value = 20;
          c.attack.value = 0.002;
          c.release.value = 0.05;
          c.knee.value = 0;
          node = tail = c;
          break;
        }
        case 'a-delay': {
          const input = ctx.createGain();
          const delay = ctx.createDelay(2);
          delay.delayTime.value = P('time', 0.35);
          const fb = ctx.createGain();
          fb.gain.value = P('feedback', 35) / 100;
          const wet = ctx.createGain();
          wet.gain.value = P('mix', 30) / 100;
          const dry = ctx.createGain();
          dry.gain.value = 1;
          const out = ctx.createGain();
          input.connect(dry).connect(out);
          input.connect(delay);
          delay.connect(fb).connect(delay);
          delay.connect(wet).connect(out);
          node = input; tail = out;
          break;
        }
        case 'a-reverb': {
          const input = ctx.createGain();
          const conv = ctx.createConvolver();
          conv.buffer = makeImpulse(ctx, 0.5 + (P('size', 40) / 100) * 2.5);
          const wet = ctx.createGain();
          wet.gain.value = P('mix', 25) / 100;
          const dry = ctx.createGain();
          const out = ctx.createGain();
          input.connect(dry).connect(out);
          input.connect(conv).connect(wet).connect(out);
          node = input; tail = out;
          break;
        }
      }
      if (node && tail) {
        tail.connect(head);
        head = node;
      }
    }
    return head;
  }

  /**
   * Schedule all audio of `seq` from `from` into `dest` on `ctx`.
   * Returns scheduled sources. `ctxStartTime` is the AudioContext time at which `from` should sound.
   */
  buildGraph(
    ctx: BaseAudioContext, project: VideoProject, seq: Sequence, from: number,
    dest: AudioNode, ctxStartTime: number, opts: { realtime: boolean; maxDur?: number; depth?: number; timeShift?: number } ,
  ): AudioBufferSourceNode[] {
    const sources: AudioBufferSourceNode[] = [];
    const anySolo = seq.audioTracks.some((t) => t.solo);
    const depth = opts.depth ?? 0;
    for (const track of seq.audioTracks) {
      const audible = !track.muted && (!anySolo || track.solo);
      // track bus
      const trackGain = ctx.createGain();
      trackGain.gain.value = audible ? dbToGain(track.volume) : 0;
      const trackPan = ctx.createStereoPanner();
      trackPan.pan.value = Math.max(-1, Math.min(1, track.pan / 100));
      trackGain.connect(trackPan).connect(dest);
      if (opts.realtime && depth === 0) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        trackPan.connect(analyser);
        this.trackBuses.set(track.id, { gain: trackGain, analyser });
      }
      for (const clip of track.clips) {
        if (!clip.enabled || clip.speed === 0) continue;
        if (clip.end <= from + 0.001) continue;
        if (opts.maxDur !== undefined && clip.start >= from + opts.maxDur) continue;
        const asset = getAsset(project, clip.assetId);
        if (!asset) continue;
        if (asset.type === 'sequence' && asset.sequenceId && depth < 3) {
          // nested audio: schedule inner sequence within the clip window
          const nested = getSequence(project, asset.sequenceId);
          if (nested) {
            const innerFrom = Math.max(0, clip.inPoint + (Math.max(from, clip.start) - clip.start) * clip.speed);
            const when = ctxStartTime + Math.max(0, clip.start - from);
            const innerGain = ctx.createGain();
            this.scheduleClipGain(innerGain.gain, clip, Math.max(from, clip.start),
              (lt) => dbToGain(evalNum(clip.volume, lt)), 0, when);
            innerGain.connect(trackGain);
            sources.push(...this.buildGraph(ctx, project, nested, innerFrom, innerGain, when,
              { ...opts, depth: depth + 1, maxDur: clip.end - Math.max(from, clip.start) }));
          }
          continue;
        }
        const buf = this.buffers.get(asset.id);
        if (!buf) {
          void this.ensureAssetBuffer(asset);
          continue;
        }
        const src = ctx.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = Math.abs(clip.speed) || 1;
        const clipGain = ctx.createGain();
        const panner = ctx.createStereoPanner();
        const startLocal = Math.max(0, from - clip.start);
        panner.pan.value = Math.max(-1, Math.min(1, evalNum(clip.pan, startLocal) / 100));
        const chainHead = this.buildClipChain(ctx, clip, clipGain);
        src.connect(chainHead);
        clipGain.connect(panner).connect(trackGain);
        const when = ctxStartTime + Math.max(0, clip.start - from);
        const offset = clip.inPoint + startLocal * Math.abs(clip.speed);
        const dur = (clip.end - Math.max(from, clip.start)) * Math.abs(clip.speed);
        this.scheduleClipGain(clipGain.gain, clip, Math.max(from, clip.start),
          (lt) => dbToGain(evalNum(clip.volume, lt)), 0, when);
        try {
          src.start(when, Math.max(0, offset), Math.max(0.001, dur));
          sources.push(src);
        } catch { /* invalid schedule params */ }
      }
    }
    return sources;
  }

  // ---------------- transport ----------------

  async play(project: VideoProject, seq: Sequence, from: number): Promise<void> {
    const ctx = this.ensureCtx();
    this.stop();
    await this.prepareSequence(project, seq);
    const master = ctx.createGain();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    master.connect(analyser).connect(ctx.destination);
    this.masterAnalyser = analyser;
    const startAt = ctx.currentTime + 0.06;
    this.activeSources = this.buildGraph(ctx, project, seq, from, master, startAt, { realtime: true });
    this.startCtxTime = startAt;
    this.startSeqTime = from;
    this.playing = true;
  }

  stop(): void {
    for (const s of this.activeSources) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    this.activeSources = [];
    this.trackBuses.clear();
    this.masterAnalyser = null;
    this.playing = false;
  }

  /** Current sequence time derived from the audio clock (the sync master). */
  get time(): number | null {
    if (!this.playing || !this.ctx) return null;
    return this.startSeqTime + (this.ctx.currentTime - this.startCtxTime);
  }

  private lastScrub = 0;
  scrub(project: VideoProject, seq: Sequence, t: number): void {
    const now = performance.now();
    if (now - this.lastScrub < 70) return;
    this.lastScrub = now;
    const ctx = this.ensureCtx();
    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    const startAt = ctx.currentTime + 0.005;
    const sources = this.buildGraph(ctx, project, seq, t, master, startAt, { realtime: false, maxDur: 0.09 });
    const stopAt = startAt + 0.09;
    for (const s of sources) {
      try { s.stop(stopAt); } catch { /* noop */ }
    }
    setTimeout(() => master.disconnect(), 300);
  }

  /** RMS levels (0..1) per track id + master, for meters. */
  getMeters(): { tracks: Record<string, number>; master: number } {
    const tracks: Record<string, number> = {};
    const read = (an: AnalyserNode): number => {
      const data = new Float32Array(an.fftSize);
      an.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      return Math.sqrt(sum / data.length);
    };
    for (const [id, bus] of this.trackBuses) tracks[id] = read(bus.analyser);
    return { tracks, master: this.masterAnalyser ? read(this.masterAnalyser) : 0 };
  }

  /** Offline mix of the full sequence (export). */
  async renderMix(project: VideoProject, seq: Sequence, duration?: number): Promise<AudioBuffer> {
    await this.prepareSequence(project, seq);
    const dur = Math.max(0.1, duration ?? sequenceDuration(seq));
    const ctx = new OfflineAudioContext(2, Math.ceil(dur * 48000), 48000);
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.buildGraph(ctx, project, seq, 0, master, 0, { realtime: false });
    return ctx.startRendering();
  }
}

function makeImpulse(ctx: BaseAudioContext, seconds: number): AudioBuffer {
  const len = Math.ceil(seconds * ctx.sampleRate);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let seed = 12345 + ch;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = ((seed / 0x7fffffff) * 2 - 1) * Math.pow(1 - i / len, 2.2);
    }
  }
  return buf;
}

export const audioEngine = new AudioEngine();

/** Convert an audio track+clip layout into audible test — used by unit checks. */
export const _internal = { dbToGain };
