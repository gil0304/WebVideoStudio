// ============================================================
// Procedural demo audio — deterministic synthesis into real
// AudioBuffers. Waveforms, mixing, meters and export all read
// these actual samples (never generated placeholders).
// ============================================================

const SR = 48000;

// deterministic PRNG (mulberry32)
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed = 1): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.ceil(seconds * ctx.sampleRate), ctx.sampleRate);
  const d = buf.getChannelData(0);
  const r = rng(seed);
  for (let i = 0; i < d.length; i++) d[i] = r() * 2 - 1;
  return buf;
}

type Ctx = OfflineAudioContext;

const env = (_ctx: Ctx, g: GainNode, t: number, a: number, peak: number, d: number, sustain = 0, r = 0.01, hold = 0) => {
  const p = g.gain;
  p.setValueAtTime(0.0001, t);
  p.exponentialRampToValueAtTime(Math.max(peak, 0.0001), t + a);
  p.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + d);
  if (hold > 0) p.setValueAtTime(Math.max(sustain, 0.0001), t + a + d + hold);
  p.exponentialRampToValueAtTime(0.0001, t + a + d + hold + r);
};

function kick(ctx: Ctx, out: AudioNode, t: number, vel = 1) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(48, t + 0.11);
  env(ctx, g, t, 0.002, 0.9 * vel, 0.24, 0, 0.05);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + 0.4);
  // click
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.03, 7);
  const ng = ctx.createGain();
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 3000;
  env(ctx, ng, t, 0.001, 0.25 * vel, 0.02);
  n.connect(hp).connect(ng).connect(out);
  n.start(t);
}

function hat(ctx: Ctx, out: AudioNode, t: number, open = false, vel = 1) {
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.3, 11);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass'; hp.frequency.value = 8200;
  const g = ctx.createGain();
  env(ctx, g, t, 0.001, 0.16 * vel, open ? 0.24 : 0.04);
  n.connect(hp).connect(g).connect(out);
  n.start(t);
}

function clap(ctx: Ctx, out: AudioNode, t: number, vel = 1) {
  for (let i = 0; i < 3; i++) {
    const n = ctx.createBufferSource();
    n.buffer = noiseBuffer(ctx, 0.25, 21 + i);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1500 + i * 300; bp.Q.value = 1.4;
    const g = ctx.createGain();
    env(ctx, g, t + i * 0.011, 0.001, 0.3 * vel / (i + 1), 0.14);
    n.connect(bp).connect(g).connect(out);
    n.start(t + i * 0.011);
  }
}

function bassNote(ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, vel = 1) {
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.value = freq;
  const o2 = ctx.createOscillator();
  o2.type = 'square';
  o2.frequency.value = freq / 2;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(900, t);
  lp.frequency.exponentialRampToValueAtTime(240, t + dur);
  lp.Q.value = 4;
  const g = ctx.createGain();
  env(ctx, g, t, 0.008, 0.34 * vel, dur * 0.7, 0.0001, 0.05);
  o.connect(lp); o2.connect(lp);
  lp.connect(g).connect(out);
  o.start(t); o.stop(t + dur + 0.1);
  o2.start(t); o2.stop(t + dur + 0.1);
}

function pluck(ctx: Ctx, out: AudioNode, t: number, freq: number, vel = 1, pan = 0) {
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = freq;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(freq * 6, t);
  lp.frequency.exponentialRampToValueAtTime(freq * 1.5, t + 0.2);
  const g = ctx.createGain();
  env(ctx, g, t, 0.003, 0.16 * vel, 0.28);
  const p = ctx.createStereoPanner();
  p.pan.value = pan;
  o.connect(lp).connect(g).connect(p).connect(out);
  o.start(t); o.stop(t + 0.6);
}

function padChord(ctx: Ctx, out: AudioNode, t: number, freqs: number[], dur: number, vel = 1) {
  for (const f of freqs) {
    for (const det of [-6, 4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = det;
      const g = ctx.createGain();
      env(ctx, g, t, Math.min(1.2, dur * 0.4), 0.05 * vel, dur * 0.5, 0.03 * vel, dur * 0.3);
      const p = ctx.createStereoPanner();
      p.pan.value = det > 0 ? 0.4 : -0.4;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 2200;
      o.connect(lp).connect(g).connect(p).connect(out);
      o.start(t); o.stop(t + dur + 0.5);
    }
  }
}

// note helper: midi → freq
const mf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** 45s / 120 BPM promo track. Sections: intro(0-4) build(4-20) drop(20-30) half(30-34) full(34-42) outro(42-45). */
async function renderMusic(duration: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -12;
  master.ratio.value = 6;
  master.connect(ctx.destination);
  const bus = ctx.createGain();
  bus.gain.value = 0.9;
  bus.connect(master);

  const BEAT = 0.5; // 120 bpm
  const bars = Math.ceil(duration / (BEAT * 4));
  // Am / F / C / G progression, roots at A1=33 F1=29 C2=36 G1=31 (midi)
  const roots = [33, 29, 36, 31];
  const chords = [
    [57, 60, 64, 69], // Am
    [53, 57, 60, 65], // F
    [48, 52, 55, 60].map((n) => n + 12), // C
    [55, 59, 62, 67], // G
  ];
  const arpNotes = [69, 72, 76, 81, 76, 72]; // A minor arp

  for (let bar = 0; bar < bars; bar++) {
    const bt = bar * BEAT * 4;
    if (bt >= duration) break;
    const chordIdx = bar % 4;
    const section = bt < 4 ? 'intro' : bt < 20 ? 'build' : bt < 30 ? 'drop' : bt < 34 ? 'half' : bt < 42 ? 'full' : 'outro';
    const intensity = section === 'intro' ? 0.4 : section === 'build' ? 0.55 + (bt - 4) / 40 : section === 'half' ? 0.6 : section === 'outro' ? 0.5 : 1;

    // pads always
    padChord(ctx, bus, bt, chords[chordIdx].map(mf), BEAT * 4, section === 'drop' ? 0.8 : 1);

    for (let b = 0; b < 4; b++) {
      const t = bt + b * BEAT;
      if (t >= duration - 0.05) break;
      const beatInBar = b;
      // kick: four-on-floor except intro (halved) and half-time
      if (section === 'half') {
        if (beatInBar === 0) kick(ctx, bus, t, 1);
        if (beatInBar === 2) clap(ctx, bus, t, 0.8);
      } else if (section === 'intro') {
        if (beatInBar % 2 === 0) kick(ctx, bus, t, 0.7);
      } else {
        kick(ctx, bus, t, intensity);
        if (beatInBar === 1 || beatInBar === 3) clap(ctx, bus, t, section === 'drop' || section === 'full' ? 0.9 : 0.4);
      }
      // hats offbeat
      if (section !== 'intro') {
        hat(ctx, bus, t + BEAT / 2, false, intensity);
        if (section === 'drop' || section === 'full') {
          hat(ctx, bus, t + BEAT / 4, false, 0.35);
          hat(ctx, bus, t + (3 * BEAT) / 4, false, 0.35);
        }
        if (beatInBar === 3) hat(ctx, bus, t + BEAT / 2, true, 0.7);
      }
      // bass: 8ths in drop/full, quarters in build
      const root = mf(roots[chordIdx] + 12);
      if (section === 'drop' || section === 'full') {
        bassNote(ctx, bus, t, root, BEAT * 0.45, 1);
        bassNote(ctx, bus, t + BEAT / 2, root * (beatInBar === 3 ? 1.5 : 1), BEAT * 0.4, 0.8);
      } else if (section !== 'intro') {
        bassNote(ctx, bus, t, root, BEAT * 0.8, 0.8);
      }
      // arp in build/full/outro
      if (section === 'build' || section === 'full' || section === 'outro') {
        for (let s = 0; s < 2; s++) {
          const idx = (b * 2 + s) % arpNotes.length;
          pluck(ctx, bus, t + s * BEAT / 2, mf(arpNotes[idx] + (chordIdx === 1 ? -4 : chordIdx === 3 ? -2 : 0)), 0.8, s === 0 ? -0.3 : 0.3);
        }
      }
    }
  }
  // impact at drop (t=20) and t=24 handled by SFX track; add subtle reverse-cymbal into drop
  const rev = ctx.createBufferSource();
  rev.buffer = noiseBuffer(ctx, 2, 31);
  const rg = ctx.createGain();
  rg.gain.setValueAtTime(0.0001, 18);
  rg.gain.exponentialRampToValueAtTime(0.22, 20);
  rg.gain.exponentialRampToValueAtTime(0.0001, 20.15);
  const rhp = ctx.createBiquadFilter();
  rhp.type = 'highpass'; rhp.frequency.value = 3000;
  rev.connect(rhp).connect(rg).connect(bus);
  rev.start(18);
  return ctx.startRendering();
}

/** City ambience: filtered noise bed + rumble + sparse horns/sirens. */
async function renderAmbience(duration: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(duration * SR), SR);
  const out = ctx.createGain();
  out.gain.value = 0.8;
  out.connect(ctx.destination);
  // traffic bed
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, duration, 5);
  n.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.4;
  const g = ctx.createGain(); g.gain.value = 0.35;
  n.connect(lp).connect(g).connect(out);
  n.start(0);
  // air / hiss
  const n2 = ctx.createBufferSource();
  n2.buffer = noiseBuffer(ctx, duration, 9);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.frequency.value = 3200; bp.Q.value = 0.5;
  const g2 = ctx.createGain(); g2.gain.value = 0.05;
  n2.connect(bp).connect(g2).connect(out);
  n2.start(0);
  // slow swell LFO on bed
  const lfo = ctx.createOscillator();
  lfo.frequency.value = 0.07;
  const lfoG = ctx.createGain(); lfoG.gain.value = 0.1;
  lfo.connect(lfoG).connect(g.gain);
  lfo.start(0);
  // distant horns
  const r = rng(99);
  for (let t = 3; t < duration - 2; t += 5 + r() * 9) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 190 + r() * 140;
    const og = ctx.createGain();
    env(ctx, og, t, 0.3, 0.035, 0.8, 0.0001, 0.4);
    const p = ctx.createStereoPanner();
    p.pan.value = r() * 2 - 1;
    o.connect(og).connect(p).connect(out);
    o.start(t); o.stop(t + 2);
  }
  // occasional train rumble
  for (let t = 8; t < duration - 4; t += 14) {
    const rn = ctx.createBufferSource();
    rn.buffer = noiseBuffer(ctx, 4, 55);
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass'; rlp.frequency.value = 130;
    const rg = ctx.createGain();
    env(ctx, rg, t, 1.4, 0.3, 1.2, 0.0001, 1.2);
    rn.connect(rlp).connect(rg).connect(out);
    rn.start(t);
  }
  return ctx.startRendering();
}

async function renderWhoosh(): Promise<AudioBuffer> {
  const dur = 1.1;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur, 41);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass'; bp.Q.value = 1.1;
  bp.frequency.setValueAtTime(220, 0);
  bp.frequency.exponentialRampToValueAtTime(5200, 0.55);
  bp.frequency.exponentialRampToValueAtTime(300, dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.75, 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, dur);
  n.connect(bp).connect(g).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

async function renderImpact(): Promise<AudioBuffer> {
  const dur = 1.6;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const o = ctx.createOscillator();
  o.frequency.setValueAtTime(120, 0);
  o.frequency.exponentialRampToValueAtTime(34, 0.5);
  const g = ctx.createGain();
  env(ctx as OfflineAudioContext, g, 0, 0.004, 0.95, 0.9, 0.0001, 0.4);
  o.connect(g).connect(ctx.destination);
  o.start(0); o.stop(dur);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, 0.4, 71);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = 900;
  const ng = ctx.createGain();
  env(ctx, ng, 0, 0.002, 0.5, 0.3);
  n.connect(lp).connect(ng).connect(ctx.destination);
  n.start(0);
  return ctx.startRendering();
}

async function renderRiser(): Promise<AudioBuffer> {
  const dur = 3.2;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur, 61);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.setValueAtTime(180, 0);
  hp.frequency.exponentialRampToValueAtTime(6400, dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, 0);
  g.gain.exponentialRampToValueAtTime(0.55, dur - 0.05);
  g.gain.exponentialRampToValueAtTime(0.0001, dur);
  n.connect(hp).connect(g).connect(ctx.destination);
  n.start(0);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(110, 0);
  o.frequency.exponentialRampToValueAtTime(880, dur);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, 0);
  og.gain.exponentialRampToValueAtTime(0.12, dur - 0.05);
  og.gain.exponentialRampToValueAtTime(0.0001, dur);
  o.connect(og).connect(ctx.destination);
  o.start(0); o.stop(dur);
  return ctx.startRendering();
}

/** Airy whisper-ish texture for the VOICE bin (vocoder-style pad). */
async function renderVoiceTag(): Promise<AudioBuffer> {
  const dur = 2.4;
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const n = ctx.createBufferSource();
  n.buffer = noiseBuffer(ctx, dur, 81);
  // formant-ish band stack ("city pulse" cadence via amplitude gating)
  const freqs = [420, 900, 2400];
  for (const f of freqs) {
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, 0);
    // two syllable groups
    g.gain.exponentialRampToValueAtTime(0.3, 0.15);
    g.gain.exponentialRampToValueAtTime(0.05, 0.5);
    g.gain.exponentialRampToValueAtTime(0.3, 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, 1.4);
    g.gain.exponentialRampToValueAtTime(0.25, 1.7);
    g.gain.exponentialRampToValueAtTime(0.0001, dur);
    n.connect(bp).connect(g).connect(ctx.destination);
  }
  n.start(0);
  return ctx.startRendering();
}

// ---------------- public API ----------------

const cache = new Map<string, Promise<AudioBuffer>>();

export function synthesizeAudio(kind: string, duration: number): Promise<AudioBuffer> {
  const key = `${kind}:${duration}`;
  let p = cache.get(key);
  if (!p) {
    p = (() => {
      switch (kind) {
        case 'music_main': return renderMusic(duration);
        case 'ambience_city': return renderAmbience(duration);
        case 'sfx_whoosh': return renderWhoosh();
        case 'sfx_impact': return renderImpact();
        case 'sfx_riser': return renderRiser();
        case 'vo_tag': return renderVoiceTag();
        default: return renderWhoosh();
      }
    })();
    cache.set(key, p);
  }
  return p;
}

/** Peak data for waveform drawing: pairs of [min,max] per bucket, from real samples. */
export interface WaveformPeaks {
  peaks: Float32Array; // interleaved min,max
  buckets: number;
  duration: number;
}

const peakCache = new Map<string, WaveformPeaks>();

export function computePeaks(key: string, buf: AudioBuffer, bucketsPerSecond = 100): WaveformPeaks {
  const cacheKey = `${key}:${bucketsPerSecond}`;
  const hit = peakCache.get(cacheKey);
  if (hit) return hit;
  const buckets = Math.max(1, Math.ceil(buf.duration * bucketsPerSecond));
  const peaks = new Float32Array(buckets * 2);
  const ch0 = buf.getChannelData(0);
  const ch1 = buf.numberOfChannels > 1 ? buf.getChannelData(1) : ch0;
  const samplesPerBucket = ch0.length / buckets;
  for (let b = 0; b < buckets; b++) {
    let mn = 0, mx = 0;
    const start = Math.floor(b * samplesPerBucket);
    const end = Math.min(ch0.length, Math.floor((b + 1) * samplesPerBucket));
    for (let i = start; i < end; i += 2) { // stride 2 for speed
      const v = (ch0[i] + ch1[i]) * 0.5;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    peaks[b * 2] = mn;
    peaks[b * 2 + 1] = mx;
  }
  const result = { peaks, buckets, duration: buf.duration };
  peakCache.set(cacheKey, result);
  return result;
}
