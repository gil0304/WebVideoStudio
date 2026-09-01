// ============================================================
// Source Monitor — previews a single asset (procedural scene,
// file video, image, nested sequence or audio waveform) with a
// local rAF playback clock, real scheduled audio, in/out marks
// and Insert / Overwrite edits into the active sequence.
// ============================================================

import React, { useEffect, useRef, useState } from 'react';
import { useStudio } from '../../state/store';
import type { MediaAsset, VideoProject } from '../../model/types';
import { getAsset, getSequence } from '../../model/types';
import { drawProceduralFrame } from '../../engine/procedural';
import { sharedMedia, sharedPool } from '../../engine/playback';
import { renderSequenceFrame, drawTextLayer } from '../../engine/renderer';
import { audioEngine } from '../../engine/audioEngine';
import { toTimecode, snapToFrame } from '../../engine/timecode';
import { ScrubBar, TBtn, fitRect } from './monitors/shared';

const FPS = 30;
const CW = 640;
const CH = 360;

export default function SourceMonitor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<{ node: AudioBufferSourceNode; assetId: string } | null>(null);
  const wasPlayingRef = useRef(false);
  const playedAssetRef = useRef<string | null>(null);
  const renderingRef = useRef(false);
  const lastDrawRef = useRef<{ assetId: string; time: number; revision: number } | null>(null);
  const loopRef = useRef(false);

  const source = useStudio((s) => s.ui.source);
  const asset = useStudio((s) => (s.ui.source.assetId ? getAsset(s.project, s.ui.source.assetId) : undefined));
  const setSourceTime = useStudio((s) => s.setSourceTime);
  const setSourcePlaying = useStudio((s) => s.setSourcePlaying);
  const setSourceIn = useStudio((s) => s.setSourceIn);
  const setSourceOut = useStudio((s) => s.setSourceOut);
  const sourceInsert = useStudio((s) => s.sourceInsert);
  const sourceOverwrite = useStudio((s) => s.sourceOverwrite);
  const openInSource = useStudio((s) => s.openInSource);

  const [loop, setLoop] = useState(false);
  const [zoom, setZoom] = useState<'fit' | '50' | '100'>('fit');
  loopRef.current = loop;

  const stopAudio = () => {
    if (audioRef.current) {
      try { audioRef.current.node.stop(); } catch { /* already stopped */ }
      audioRef.current = null;
    }
  };

  const startAudio = (a: MediaAsset) => {
    stopAudio();
    if (!(a.type === 'audio' || a.hasAudio)) return;
    const ctx = audioEngine.ensureCtx();
    void audioEngine.ensureAssetBuffer(a).then((buf) => {
      const s = useStudio.getState();
      if (!buf || !s.ui.source.playing || s.ui.source.assetId !== a.id) return;
      stopAudio();
      const node = ctx.createBufferSource();
      node.buffer = buf;
      node.connect(ctx.destination);
      const off = Math.max(0, Math.min(s.ui.source.time, Math.max(0, buf.duration - 0.01)));
      try {
        node.start(0, off);
        audioRef.current = { node, assetId: a.id };
      } catch { /* invalid params */ }
    });
  };

  // ---- rAF render / playback loop ----
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const s = useStudio.getState();
      const src = s.ui.source;
      const a = src.assetId ? getAsset(s.project, src.assetId) : undefined;

      // audio transport transitions
      if (src.playing && (!wasPlayingRef.current || playedAssetRef.current !== (a?.id ?? null))) {
        if (a) startAudio(a);
        playedAssetRef.current = a?.id ?? null;
      } else if (!src.playing && wasPlayingRef.current) {
        stopAudio();
      }
      wasPlayingRef.current = src.playing;

      let t = src.time;
      if (src.playing && a) {
        t = src.time + dt;
        if (t >= a.duration) {
          if (loopRef.current) {
            t = 0;
            s.setSourceTime(0);
            startAudio(a);
          } else {
            t = a.duration;
            s.setSourceTime(t);
            s.setSourcePlaying(false);
          }
        } else {
          s.setSourceTime(t);
        }
      }
      if (a) drawFrame(a, t, s.project);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      stopAudio();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const drawFrame = (a: MediaAsset, t: number, project: VideoProject) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const revision = project.revision;
    const prev = lastDrawRef.current;
    const cheap = a.type === 'video' || a.type === 'image' || a.type === 'audio';
    if (!cheap && prev && prev.assetId === a.id && Math.abs(prev.time - t) < 1e-4 && prev.revision === revision) return;

    if (a.type === 'audio') {
      drawWaveform(ctx, a, t);
      lastDrawRef.current = { assetId: a.id, time: t, revision };
      return;
    }
    if (a.procedural) {
      drawProceduralFrame(ctx, a.procedural, CW, CH, t, a.seed ?? 0);
      lastDrawRef.current = { assetId: a.id, time: t, revision };
      return;
    }
    if (a.type === 'sequence' && a.sequenceId) {
      if (renderingRef.current) return;
      const nested = getSequence(project, a.sequenceId);
      if (!nested) return;
      const fitted = fitRect(nested.width, nested.height, CW, CH);
      renderingRef.current = true;
      void renderSequenceFrame(ctx, project, nested, t, {
        width: Math.max(2, Math.round(fitted.w)), height: Math.max(2, Math.round(fitted.h)),
        pool: sharedPool, media: sharedMedia, depth: 1,
      }).finally(() => { renderingRef.current = false; });
      lastDrawRef.current = { assetId: a.id, time: t, revision };
      return;
    }
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, CW, CH);
    if (a.type === 'video' && a.fileId) {
      const r = fitRect(a.width ?? 1920, a.height ?? 1080, CW, CH);
      const ok = sharedMedia.drawVideoRealtime(ctx, a, t, r.x, r.y, r.w, r.h);
      if (!ok) centerNote(ctx, 'メディアを読み込み中…');
    } else if (a.type === 'image') {
      const bmp = sharedMedia.getImage(a);
      if (bmp) {
        const r = fitRect(bmp.width, bmp.height, CW, CH);
        ctx.drawImage(bmp, r.x, r.y, r.w, r.h);
      } else {
        centerNote(ctx, '画像を読み込み中…');
      }
    } else if (a.type === 'graphic' && a.textTemplate) {
      const s = CW / (a.width ?? 1280);
      for (const layer of a.textTemplate) drawTextLayer(ctx, layer, s);
    } else {
      centerNote(ctx, a.name);
    }
    lastDrawRef.current = { assetId: a.id, time: t, revision };
  };

  const centerNote = (ctx: CanvasRenderingContext2D, text: string) => {
    ctx.fillStyle = '#666';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, CW / 2, CH / 2);
  };

  const drawWaveform = (ctx: CanvasRenderingContext2D, a: MediaAsset, t: number) => {
    ctx.fillStyle = '#0e1114';
    ctx.fillRect(0, 0, CW, CH);
    const wf = audioEngine.waveform(a);
    if (!wf) {
      centerNote(ctx, 'オーディオをデコード中…');
      return;
    }
    const mid = CH / 2;
    const amp = CH * 0.42;
    ctx.strokeStyle = 'rgba(90,190,140,0.9)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x < CW; x++) {
      const bi = Math.min(wf.buckets - 1, Math.floor((x / CW) * wf.buckets));
      const mn = wf.peaks[bi * 2];
      const mx = wf.peaks[bi * 2 + 1];
      ctx.moveTo(x + 0.5, mid - mx * amp);
      ctx.lineTo(x + 0.5, mid - mn * amp + 1);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.moveTo(0, mid + 0.5);
    ctx.lineTo(CW, mid + 0.5);
    ctx.stroke();
    // playhead
    const px = (t / Math.max(1e-6, a.duration)) * CW;
    ctx.strokeStyle = 'var(--playhead)';
    ctx.strokeStyle = '#2d8ceb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, CH);
    ctx.stroke();
  };

  // ---- transport helpers ----
  const togglePlay = () => {
    if (!asset) return;
    const s = useStudio.getState();
    if (!s.ui.source.playing && s.ui.source.time >= asset.duration - 1e-4) setSourceTime(0);
    setSourcePlaying(!s.ui.source.playing);
  };

  const step = (n: number) => {
    if (!asset) return;
    setSourcePlaying(false);
    stopAudio();
    setSourceTime(snapToFrame(useStudio.getState().ui.source.time + n / FPS, FPS));
  };

  const onScrub = (t: number, phase: 'start' | 'move' | 'end') => {
    if (phase === 'start') {
      setSourcePlaying(false);
      stopAudio();
    }
    setSourceTime(t);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!asset) return;
    const time = useStudio.getState().ui.source.time;
    switch (e.key) {
      case ' ': togglePlay(); break;
      case 'i': case 'I': setSourceIn(snapToFrame(time, FPS)); break;
      case 'o': case 'O': setSourceOut(snapToFrame(time, FPS)); break;
      case 'ArrowLeft': step(e.shiftKey ? -5 : -1); break;
      case 'ArrowRight': step(e.shiftKey ? 5 : 1); break;
      case ',': sourceInsert(); break;
      case '.': sourceOverwrite(); break;
      case 'l': case 'L': setLoop((v) => !v); break;
      default: return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  const dragPayload = (take: 'both' | 'video' | 'audio') => JSON.stringify({
    assetId: asset?.id,
    srcIn: source.inPoint ?? 0,
    srcOut: source.outPoint ?? asset?.duration ?? 0,
    take,
  });

  const onDragStart = (take: 'both' | 'video' | 'audio') => (e: React.DragEvent) => {
    if (!asset) { e.preventDefault(); return; }
    e.dataTransfer.setData('application/x-wvs-asset', dragPayload(take));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const dur = asset?.duration ?? 0;
  const rangeDur = Math.max(0, (source.outPoint ?? dur) - (source.inPoint ?? 0));
  const hasAudioPart = !!asset && (asset.type === 'audio' || !!asset.hasAudio);
  const hasVideoPart = !!asset && asset.type !== 'audio';

  const canvasStyle: React.CSSProperties = zoom === 'fit'
    ? { width: '100%', height: '100%', objectFit: 'contain', display: 'block' }
    : { width: zoom === '100' ? CW : CW / 2, height: zoom === '100' ? CH : CH / 2, display: 'block', margin: 'auto' };

  const chipStyle: React.CSSProperties = {
    fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: 'grab',
    border: '1px solid var(--border-light)', background: 'var(--bg-panel)', color: 'var(--text)',
    userSelect: 'none', whiteSpace: 'nowrap',
  };

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={(e) => {
        const ae = document.activeElement;
        if (!ae || ae === document.body) e.currentTarget.focus();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-wvs-asset')) e.preventDefault();
      }}
      onDrop={(e) => {
        const raw = e.dataTransfer.getData('application/x-wvs-asset');
        if (!raw) return;
        e.preventDefault();
        try {
          const data = JSON.parse(raw) as { assetId?: string };
          if (data.assetId) openInSource(data.assetId);
        } catch { /* ignore malformed */ }
      }}
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-inset)', outline: 'none' }}
    >
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: zoom === 'fit' ? 'hidden' : 'auto', padding: 6 }}>
        {asset ? (
          <div
            draggable
            onDragStart={onDragStart('both')}
            title={`${asset.name} — タイムラインにドラッグ`}
            style={{ width: '100%', height: '100%', minHeight: zoom === 'fit' ? 0 : CH / 2, display: 'flex' }}
          >
            <canvas ref={canvasRef} width={CW} height={CH} style={{ ...canvasStyle, background: '#000' }} />
          </div>
        ) : (
          <div style={{
            height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-dim)', fontSize: 12, textAlign: 'center', padding: 16,
          }}>
            素材をここにドラッグ、またはプロジェクトの項目をダブルクリック
          </div>
        )}
      </div>

      <ScrubBar
        duration={dur}
        time={source.time}
        inPoint={source.inPoint}
        outPoint={source.outPoint}
        fps={FPS}
        onScrub={onScrub}
        onSetIn={(t) => setSourceIn(t)}
        onSetOut={(t) => setSourceOut(t)}
      />

      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 2, padding: '3px 8px 2px', flexWrap: 'wrap' }}>
        <span className="timecode">{toTimecode(source.time, FPS)}</span>
        <div style={{ flex: 1 }} />
        <TBtn label="{" title="インをマーク (I)" onClick={() => setSourceIn(snapToFrame(source.time, FPS))} disabled={!asset} />
        <TBtn label="}" title="アウトをマーク (O)" onClick={() => setSourceOut(snapToFrame(source.time, FPS))} disabled={!asset} />
        <TBtn label="✕" title="インとアウトを消去" onClick={() => { setSourceIn(null); setSourceOut(null); }} disabled={!asset || (source.inPoint == null && source.outPoint == null)} />
        <span style={{ width: 6 }} />
        <TBtn label="◀︎" title="1フレーム前へ (←)" onClick={() => step(-1)} disabled={!asset} />
        <TBtn label={source.playing ? '⏸' : '▶'} title="再生/一時停止 (Space)" onClick={togglePlay} disabled={!asset} fontSize={15} />
        <TBtn label="▶︎" title="1フレーム後へ (→)" onClick={() => step(1)} disabled={!asset} />
        <TBtn label="↻" title="ループ再生 (L)" onClick={() => setLoop((v) => !v)} toggled={loop} disabled={!asset} />
        <span style={{ width: 6 }} />
        <TBtn label="インサート" title="再生ヘッドの位置でシーケンスにインサート (,)" onClick={sourceInsert} disabled={!asset} wide />
        <TBtn label="上書き" title="再生ヘッドの位置でシーケンスに上書き (.)" onClick={sourceOverwrite} disabled={!asset} wide />
        <div style={{ flex: 1 }} />
        <span className="timecode dim" title="インからアウトのデュレーション">{toTimecode(rangeDur, FPS)}</span>
      </div>

      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 6px', flexWrap: 'wrap' }}>
        <div
          draggable={hasVideoPart}
          onDragStart={onDragStart('video')}
          title="ビデオのみをタイムラインにドラッグ"
          style={{ ...chipStyle, opacity: hasVideoPart ? 1 : 0.35, cursor: hasVideoPart ? 'grab' : 'default' }}
        >
          ▦ ビデオのみ
        </div>
        <div
          draggable={hasAudioPart}
          onDragStart={onDragStart('audio')}
          title="オーディオのみをタイムラインにドラッグ"
          style={{ ...chipStyle, opacity: hasAudioPart ? 1 : 0.35, cursor: hasAudioPart ? 'grab' : 'default' }}
        >
          ∿ オーディオのみ
        </div>
        <div style={{ flex: 1 }} />
        <select
          value={zoom}
          onChange={(e) => setZoom(e.target.value as 'fit' | '50' | '100')}
          title="ズームレベル(表示のみ)"
          style={{ fontSize: 11, background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border-light)', borderRadius: 3, padding: '1px 4px' }}
        >
          <option value="fit">全体表示</option>
          <option value="50">50%</option>
          <option value="100">100%</option>
        </select>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }} title="ソースのプレビューは640×360で描画されます">
          プレビュー画質: 1/2
        </span>
      </div>
    </div>
  );
}
