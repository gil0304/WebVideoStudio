// ============================================================
// Export pipeline — renders every frame from the edit graph,
// encodes via WebCodecs and muxes real MP4/WebM files.
// Audio is the offline-rendered sequence mix. (spec §28, §33)
// ============================================================

import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import type { Sequence, VideoProject } from '../model/types';
import { sequenceDuration } from '../model/types';
import { renderSequenceFrame } from './renderer';
import { CanvasPool } from './effects';
import { MediaCache } from './sources';
import { audioEngine } from './audioEngine';

export interface ExportSettings {
  format: 'mp4' | 'webm' | 'wav' | 'png' | 'png-seq' | 'srt' | 'vtt' | 'project';
  width: number;
  height: number;
  fps: number;
  videoBitrate: number;   // bps
  audioBitrate: number;   // bps
  includeAudio: boolean;
  burnCaptions: boolean;
  rangeStart: number;
  rangeEnd: number;
  fileName: string;
}

export interface ExportProgress {
  fraction: number;
  frame: number;
  totalFrames: number;
  phase: string;
  elapsed: number;
  estimatedRemaining: number;
}

export function defaultExportSettings(seq: Sequence): ExportSettings {
  return {
    format: 'mp4',
    width: seq.width,
    height: seq.height,
    fps: seq.frameRate,
    videoBitrate: 12_000_000,
    audioBitrate: 192_000,
    includeAudio: true,
    burnCaptions: true,
    rangeStart: 0,
    rangeEnd: sequenceDuration(seq),
    fileName: seq.name,
  };
}

export class ExportCancelled extends Error {
  constructor() { super('Export cancelled'); }
}

export async function exportSequence(
  project: VideoProject,
  seq: Sequence,
  settings: ExportSettings,
  onProgress: (p: ExportProgress) => void,
  signal: AbortSignal,
): Promise<{ blob: Blob; extension: string }> {
  const started = performance.now();
  const report = (fraction: number, frame: number, totalFrames: number, phase: string) => {
    const elapsed = (performance.now() - started) / 1000;
    onProgress({
      fraction, frame, totalFrames, phase, elapsed,
      estimatedRemaining: fraction > 0.02 ? (elapsed / fraction) * (1 - fraction) : 0,
    });
  };

  switch (settings.format) {
    case 'srt': return { blob: new Blob([captionsToSrt(seq)], { type: 'text/plain' }), extension: 'srt' };
    case 'vtt': return { blob: new Blob([captionsToVtt(seq)], { type: 'text/vtt' }), extension: 'vtt' };
    case 'project': return {
      blob: new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
      extension: 'wvs.json',
    };
    case 'wav': {
      report(0.1, 0, 1, 'Mixing audio');
      const mix = await audioEngine.renderMix(project, seq, settings.rangeEnd);
      report(0.9, 0, 1, 'Writing WAV');
      return { blob: audioBufferToWav(mix, settings.rangeStart, settings.rangeEnd), extension: 'wav' };
    }
    case 'png': {
      const canvas = document.createElement('canvas');
      canvas.width = settings.width;
      canvas.height = settings.height;
      const ctx = canvas.getContext('2d')!;
      await renderSequenceFrame(ctx, project, seq, settings.rangeStart, {
        width: seq.width, height: seq.height, pool: new CanvasPool(), media: new MediaCache(),
        exact: true, drawCaptions: settings.burnCaptions,
      });
      const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
      return { blob, extension: 'png' };
    }
    case 'png-seq': return exportPngSequence(project, seq, settings, report, signal);
    default: return exportVideo(project, seq, settings, report, signal);
  }
}

// ---------------- video (MP4 / WebM) ----------------

async function exportVideo(
  project: VideoProject, seq: Sequence, settings: ExportSettings,
  report: (f: number, fr: number, t: number, p: string) => void,
  signal: AbortSignal,
): Promise<{ blob: Blob; extension: string }> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebCodecs is not available in this browser. Use Chrome/Edge for video export.');
  }
  const { width, height, fps } = settings;
  const duration = Math.max(0.1, settings.rangeEnd - settings.rangeStart);
  const totalFrames = Math.max(1, Math.round(duration * fps));
  const isMp4 = settings.format === 'mp4';

  // --- pick codecs ---
  const videoCodec = isMp4 ? `avc1.640033` : 'vp09.00.50.08';
  const videoConfig: VideoEncoderConfig = {
    codec: videoCodec,
    width, height,
    bitrate: settings.videoBitrate,
    framerate: fps,
  };
  let vSupport = await VideoEncoder.isConfigSupported(videoConfig);
  if (!vSupport.supported && isMp4) {
    videoConfig.codec = 'avc1.42003e';
    vSupport = await VideoEncoder.isConfigSupported(videoConfig);
  }
  if (!vSupport.supported) throw new Error(`Video codec not supported: ${videoConfig.codec}`);

  let audioCodec: 'aac' | 'opus' = isMp4 ? 'aac' : 'opus';
  let audioConfig: AudioEncoderConfig | null = null;
  if (settings.includeAudio && typeof AudioEncoder !== 'undefined') {
    audioConfig = {
      codec: audioCodec === 'aac' ? 'mp4a.40.2' : 'opus',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: settings.audioBitrate,
    };
    const aSupport = await AudioEncoder.isConfigSupported(audioConfig).catch(() => ({ supported: false }));
    if (!aSupport.supported) {
      if (audioCodec === 'aac') {
        audioCodec = 'opus';
        audioConfig.codec = 'opus';
        const retry = await AudioEncoder.isConfigSupported(audioConfig).catch(() => ({ supported: false }));
        if (!retry.supported) audioConfig = null;
      } else {
        audioConfig = null;
      }
    }
  }

  // --- muxer ---
  let mp4Muxer: Mp4Muxer<Mp4Target> | null = null;
  let webmMuxer: WebmMuxer<WebmTarget> | null = null;
  if (isMp4) {
    mp4Muxer = new Mp4Muxer({
      target: new Mp4Target(),
      video: { codec: 'avc', width, height },
      audio: audioConfig ? { codec: audioCodec === 'aac' ? 'aac' : 'opus', sampleRate: 48000, numberOfChannels: 2 } : undefined,
      fastStart: 'in-memory',
    });
  } else {
    webmMuxer = new WebmMuxer({
      target: new WebmTarget(),
      video: { codec: 'V_VP9', width, height, frameRate: fps },
      audio: audioConfig ? { codec: 'A_OPUS', sampleRate: 48000, numberOfChannels: 2 } : undefined,
    });
  }

  let encodeError: Error | null = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => {
      if (mp4Muxer) mp4Muxer.addVideoChunk(chunk, meta);
      else webmMuxer!.addVideoChunk(chunk, meta);
    },
    error: (e) => { encodeError = e as Error; },
  });
  videoEncoder.configure(videoConfig);

  // --- audio mix + encode ---
  if (audioConfig) {
    report(0.02, 0, totalFrames, 'Mixing audio');
    const mix = await audioEngine.renderMix(project, seq, settings.rangeEnd);
    const audioEncoder = new AudioEncoder({
      output: (chunk, meta) => {
        if (mp4Muxer) mp4Muxer.addAudioChunk(chunk, meta);
        else webmMuxer!.addAudioChunk(chunk, meta);
      },
      error: (e) => { encodeError = e as Error; },
    });
    audioEncoder.configure(audioConfig);
    const startSample = Math.floor(settings.rangeStart * 48000);
    const endSample = Math.min(mix.length, Math.ceil(settings.rangeEnd * 48000));
    const chunkSize = 48000; // 1s chunks
    const ch0 = mix.getChannelData(0);
    const ch1 = mix.numberOfChannels > 1 ? mix.getChannelData(1) : ch0;
    for (let s = startSample; s < endSample; s += chunkSize) {
      if (signal.aborted) { audioEncoder.close(); videoEncoder.close(); throw new ExportCancelled(); }
      const n = Math.min(chunkSize, endSample - s);
      const planar = new Float32Array(n * 2);
      planar.set(ch0.subarray(s, s + n), 0);
      planar.set(ch1.subarray(s, s + n), n);
      const data = new AudioData({
        format: 'f32-planar',
        sampleRate: 48000,
        numberOfFrames: n,
        numberOfChannels: 2,
        timestamp: Math.round(((s - startSample) / 48000) * 1e6),
        data: planar,
      });
      audioEncoder.encode(data);
      data.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }

  // --- render + encode frames ---
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const pool = new CanvasPool();
  const media = new MediaCache();
  const savedVisible = seq.captionsVisible;

  for (let i = 0; i < totalFrames; i++) {
    if (signal.aborted) {
      videoEncoder.close();
      throw new ExportCancelled();
    }
    if (encodeError) throw encodeError;
    const t = settings.rangeStart + i / fps;
    const renderSeq = settings.burnCaptions ? seq : { ...seq, captionsVisible: false };
    await renderSequenceFrame(ctx, project, renderSeq, t, {
      width: seq.width, height: seq.height, pool, media, exact: true,
    });
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i / fps) * 1e6), duration: Math.round(1e6 / fps) });
    videoEncoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
    frame.close();
    // backpressure + keep UI alive
    while (videoEncoder.encodeQueueSize > 6) await new Promise((r) => setTimeout(r, 2));
    if (i % 5 === 0) {
      report(0.05 + 0.9 * (i / totalFrames), i, totalFrames, 'Rendering & encoding');
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  void savedVisible;
  report(0.96, totalFrames, totalFrames, 'Finalizing');
  await videoEncoder.flush();
  videoEncoder.close();

  let buffer: ArrayBuffer;
  if (mp4Muxer) {
    mp4Muxer.finalize();
    buffer = mp4Muxer.target.buffer;
  } else {
    webmMuxer!.finalize();
    buffer = webmMuxer!.target.buffer;
  }
  report(1, totalFrames, totalFrames, 'Complete');
  return {
    blob: new Blob([buffer], { type: isMp4 ? 'video/mp4' : 'video/webm' }),
    extension: isMp4 ? 'mp4' : 'webm',
  };
}

// ---------------- PNG sequence (store-only zip) ----------------

async function exportPngSequence(
  project: VideoProject, seq: Sequence, settings: ExportSettings,
  report: (f: number, fr: number, t: number, p: string) => void,
  signal: AbortSignal,
): Promise<{ blob: Blob; extension: string }> {
  const fps = settings.fps;
  const duration = Math.max(0.1, settings.rangeEnd - settings.rangeStart);
  const totalFrames = Math.min(Math.round(duration * fps), 1800);
  const canvas = document.createElement('canvas');
  canvas.width = settings.width;
  canvas.height = settings.height;
  const ctx = canvas.getContext('2d')!;
  const pool = new CanvasPool();
  const media = new MediaCache();
  const files: { name: string; data: Uint8Array }[] = [];
  for (let i = 0; i < totalFrames; i++) {
    if (signal.aborted) throw new ExportCancelled();
    await renderSequenceFrame(ctx, project, seq, settings.rangeStart + i / fps, {
      width: seq.width, height: seq.height, pool, media, exact: true, drawCaptions: settings.burnCaptions,
    });
    const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), 'image/png'));
    files.push({ name: `${settings.fileName}_${String(i).padStart(5, '0')}.png`, data: new Uint8Array(await blob.arrayBuffer()) });
    if (i % 3 === 0) report(i / totalFrames, i, totalFrames, 'Rendering frames');
  }
  report(0.97, totalFrames, totalFrames, 'Packing ZIP');
  return { blob: buildStoreZip(files), extension: 'zip' };
}

/** Minimal STORE-method zip writer. */
function buildStoreZip(files: { name: string; data: Uint8Array }[]): Blob {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  const crcTable = new Uint32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (d: Uint8Array) => {
    let c = 0xffffffff;
    for (let i = 0; i < d.length; i++) c = crcTable[(c ^ d[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  for (const f of files) {
    const name = encoder.encode(f.name);
    const crc = crc32(f.data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true);
    header.setUint32(14, crc, true);
    header.setUint32(18, f.data.length, true);
    header.setUint32(22, f.data.length, true);
    header.setUint16(26, name.length, true);
    chunks.push(new Uint8Array(header.buffer), name, f.data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((s, c) => s + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(end.buffer)] as BlobPart[], { type: 'application/zip' });
}

// ---------------- audio WAV ----------------

function audioBufferToWav(buf: AudioBuffer, start: number, end: number): Blob {
  const s0 = Math.floor(start * buf.sampleRate);
  const s1 = Math.min(buf.length, Math.ceil(end * buf.sampleRate));
  const n = Math.max(0, s1 - s0);
  const ch = Math.min(2, buf.numberOfChannels);
  const bytes = 44 + n * ch * 2;
  const view = new DataView(new ArrayBuffer(bytes));
  const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, ch, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * ch * 2, true);
  view.setUint16(32, ch * 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, n * ch * 2, true);
  const channels = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = s0; i < s1; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, channels[c][i]));
      view.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

// ---------------- captions ----------------

const tcPad = (n: number, len = 2) => String(Math.floor(n)).padStart(len, '0');
function srtTime(t: number): string {
  const ms = Math.round((t % 1) * 1000);
  return `${tcPad(t / 3600)}:${tcPad((t / 60) % 60)}:${tcPad(t % 60)},${String(ms).padStart(3, '0')}`;
}
export function captionsToSrt(seq: Sequence): string {
  return seq.captions.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
}
export function captionsToVtt(seq: Sequence): string {
  return `WEBVTT\n\n${seq.captions.map((c) =>
    `${srtTime(c.start).replace(',', '.')} --> ${srtTime(c.end).replace(',', '.')}\n${c.text}\n`).join('\n')}`;
}

export function downloadBlob(blob: Blob, fileName: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
