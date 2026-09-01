// ============================================================
// Program Monitor — live render target of the active sequence
// (playback.attach on a fixed 960×540 canvas), with transport,
// in/out marks, lift/extract, playback resolution, safe
// margins / transparency grid overlays, frame export and the
// direct-manipulation overlay for clips & text layers.
// ============================================================

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStudio, useActiveSequence, usePlayhead, getActiveSequence, getPlayhead } from '../../state/store';
import { playback } from '../../engine/playback';
import { toTimecode, snapToFrame } from '../../engine/timecode';
import { sequenceDuration } from '../../model/types';
import { exportSequence, defaultExportSettings, downloadBlob } from '../../engine/exporter';
import { useContextMenu } from '../components/ContextMenu';
import { ScrubBar, TBtn, fitRect, type Rect } from './monitors/shared';
import { SafeMarginsOverlay, FpsIndicator, ManipulationOverlay } from './monitors/ProgramOverlay';

const RESOLUTIONS: { label: string; value: number }[] = [
  { label: 'フル', value: 1 },
  { label: '1/2', value: 0.5 },
  { label: '1/4', value: 0.25 },
  { label: '1/8', value: 0.125 },
];

export default function ProgramMonitor() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [va, setVa] = useState<Rect>({ x: 0, y: 0, w: 0, h: 0 });
  const { openMenu, menuEl } = useContextMenu();

  const seq = useActiveSequence();
  const playhead = usePlayhead();
  const playing = useStudio((s) => s.ui.playing);
  const loop = useStudio((s) => s.ui.loop);
  const resolution = useStudio((s) => s.ui.playbackResolution);
  const showSafeMargins = useStudio((s) => s.ui.showSafeMargins);
  const transparencyGrid = useStudio((s) => s.ui.transparencyGrid);
  const seqIn = useStudio((s) => s.ui.seqIn[s.ui.activeSequenceId] ?? null);
  const seqOut = useStudio((s) => s.ui.seqOut[s.ui.activeSequenceId] ?? null);

  const togglePlay = useStudio((s) => s.togglePlay);
  const stepFrames = useStudio((s) => s.stepFrames);
  const setPlayhead = useStudio((s) => s.setPlayhead);
  const setPlaying = useStudio((s) => s.setPlaying);
  const setLoop = useStudio((s) => s.setLoop);
  const setPlaybackResolution = useStudio((s) => s.setPlaybackResolution);
  const setUi = useStudio((s) => s.setUi);
  const setSeqIn = useStudio((s) => s.setSeqIn);
  const setSeqOut = useStudio((s) => s.setSeqOut);
  const goToPrevEdit = useStudio((s) => s.goToPrevEdit);
  const goToNextEdit = useStudio((s) => s.goToNextEdit);
  const goToPrevMarker = useStudio((s) => s.goToPrevMarker);
  const goToNextMarker = useStudio((s) => s.goToNextMarker);
  const addMarker = useStudio((s) => s.addMarker);
  const liftRange = useStudio((s) => s.liftRange);
  const extractRange = useStudio((s) => s.extractRange);

  // ---- playback attach (contract: one 960×540 canvas on mount) ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 960;
    canvas.height = 540;
    playback.attach(canvas);
    return () => playback.detach();
  }, []);

  // ---- measure the letterboxed video area inside the viewer ----
  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const wr = wrap.getBoundingClientRect();
    const cr = canvas.getBoundingClientRect();
    // renderer letterboxes the sequence inside the 960×540 buffer
    const inner = fitRect(seq.width, seq.height, cr.width, cr.height);
    setVa((prev) => {
      const next: Rect = {
        x: cr.left - wr.left + inner.x,
        y: cr.top - wr.top + inner.y,
        w: inner.w,
        h: inner.h,
      };
      const same = Math.abs(prev.x - next.x) < 0.5 && Math.abs(prev.y - next.y) < 0.5
        && Math.abs(prev.w - next.w) < 0.5 && Math.abs(prev.h - next.h) < 0.5;
      return same ? prev : next;
    });
  }, [seq.width, seq.height]);

  useEffect(() => {
    measure();
    const wrap = wrapRef.current;
    if (!wrap) return;
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    if (canvasRef.current) ro.observe(canvasRef.current);
    return () => ro.disconnect();
  }, [measure]);

  const fps = seq.frameRate;
  const dur = Math.max(sequenceDuration(seq), 0.001);
  const hasRange = seqIn != null && seqOut != null && seqOut > seqIn;
  const rangeDur = hasRange ? seqOut - seqIn : dur;

  const onScrub = (t: number, phase: 'start' | 'move' | 'end') => {
    if (phase === 'start') setPlaying(false);
    setPlayhead(t);
  };

  const exportFrame = () => {
    const s = useStudio.getState();
    const sq = getActiveSequence(s);
    const ph = getPlayhead(s);
    void exportSequence(
      s.project, sq,
      { ...defaultExportSettings(sq), format: 'png', rangeStart: ph },
      () => {},
      new AbortController().signal,
    ).then((r) => downloadBlob(r.blob, `${sq.name}_frame.png`))
      .catch(() => setUi({ statusMessage: 'フレームの書き出しに失敗しました' }));
  };

  const openSettings = (e: React.MouseEvent) => {
    openMenu(e, [
      { label: 'セーフマージン', checked: showSafeMargins, onClick: () => setUi({ showSafeMargins: !showSafeMargins }) },
      { label: '透明グリッド', checked: transparencyGrid, onClick: () => setUi({ transparencyGrid: !transparencyGrid }) },
      { label: 'ループ再生', checked: loop, onClick: () => setLoop(!loop) },
      { separator: true },
      {
        label: '再生時の解像度',
        children: RESOLUTIONS.map((r) => ({
          label: r.label, checked: resolution === r.value, onClick: () => setPlaybackResolution(r.value),
        })),
      },
      { separator: true },
      { label: 'フレームを書き出し…', onClick: exportFrame },
      { separator: true },
      { label: 'マルチカメラ(未対応)', disabled: true },
      { label: '比較表示(未対応)', disabled: true },
    ]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--bg-inset)' }}>
      {/* viewer */}
      <div
        ref={wrapRef}
        style={{
          flex: 1, minHeight: 0, position: 'relative', display: 'flex',
          alignItems: 'center', justifyContent: 'center', padding: 8, overflow: 'hidden',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{ maxWidth: '100%', maxHeight: '100%', background: '#000', aspectRatio: '16/9' }}
          onClick={() => togglePlay()}
        />
        {showSafeMargins && va.w > 4 && <SafeMarginsOverlay va={va} />}
        {va.w > 4 && <ManipulationOverlay seq={seq} va={va} playhead={playhead} />}
        <FpsIndicator />
      </div>

      {/* scrub bar with in/out range band */}
      <ScrubBar
        duration={dur}
        time={Math.min(playhead, dur)}
        inPoint={seqIn}
        outPoint={seqOut}
        fps={fps}
        onScrub={onScrub}
        onSetIn={(t) => setSeqIn(t)}
        onSetOut={(t) => setSeqOut(t)}
      />

      {/* transport row */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 2, padding: '3px 8px 2px', flexWrap: 'wrap' }}>
        <span className="timecode" title="現在の時間">{toTimecode(playhead, fps)}</span>
        <div style={{ flex: 1 }} />
        <TBtn label="{" title="インをマーク (I)" onClick={() => setSeqIn(snapToFrame(playhead, fps))} />
        <TBtn label="}" title="アウトをマーク (O)" onClick={() => setSeqOut(snapToFrame(playhead, fps))} />
        <TBtn label="⇤" title="インへ移動" onClick={() => { if (seqIn != null) { setPlaying(false); setPlayhead(seqIn); } }} disabled={seqIn == null} />
        <TBtn label="⇥" title="アウトへ移動" onClick={() => { if (seqOut != null) { setPlaying(false); setPlayhead(seqOut); } }} disabled={seqOut == null} />
        <span style={{ width: 6 }} />
        <TBtn label="◄◆" title="前のマーカーへ移動" onClick={goToPrevMarker} wide />
        <TBtn label="◆" title="マーカーを追加 (M)" onClick={() => addMarker()} />
        <TBtn label="◆►" title="次のマーカーへ移動" onClick={goToNextMarker} wide />
        <span style={{ width: 6 }} />
        <TBtn label="⏮" title="前の編集点へ移動 (↑)" onClick={goToPrevEdit} />
        <TBtn label="◀︎" title="1フレーム前へ (←)" onClick={() => stepFrames(-1)} />
        <TBtn label={playing ? '⏸' : '▶'} title="再生/一時停止 (Space)" onClick={togglePlay} fontSize={15} />
        <TBtn label="▶︎" title="1フレーム後へ (→)" onClick={() => stepFrames(1)} />
        <TBtn label="⏭" title="次の編集点へ移動 (↓)" onClick={goToNextEdit} />
        <TBtn label="↻" title="ループ再生" onClick={() => setLoop(!loop)} toggled={loop} />
        <span style={{ width: 6 }} />
        <TBtn label="リフト" title="リフト(ターゲットトラックの内容を削除し、間隔を残す) (;)" onClick={liftRange} disabled={!hasRange} wide />
        <TBtn label="抽出" title="抽出(内容を削除して間隔を詰める) (')" onClick={extractRange} disabled={!hasRange} wide />
        <div style={{ flex: 1 }} />
        <span className="timecode dim" title={hasRange ? 'インからアウトのデュレーション' : 'シーケンスのデュレーション'}>
          {toTimecode(rangeDur, fps)}
        </span>
      </div>

      {/* view controls row */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, padding: '2px 8px 6px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{seq.width}×{seq.height} · {fps}fps</span>
        <div style={{ flex: 1 }} />
        <select
          value={String(resolution)}
          onChange={(e) => setPlaybackResolution(parseFloat(e.target.value))}
          title="再生時の解像度"
          style={{ fontSize: 11, background: 'var(--bg-input)', color: 'var(--text)', border: '1px solid var(--border-light)', borderRadius: 3, padding: '1px 4px' }}
        >
          {RESOLUTIONS.map((r) => (
            <option key={r.label} value={String(r.value)}>{r.label}</option>
          ))}
        </select>
        <TBtn
          label="▣"
          title="セーフマージン(アクション90% / タイトル80%)"
          onClick={() => setUi({ showSafeMargins: !showSafeMargins })}
          toggled={showSafeMargins}
        />
        <TBtn
          label="▦"
          title="透明グリッド"
          onClick={() => setUi({ transparencyGrid: !transparencyGrid })}
          toggled={transparencyGrid}
        />
        <TBtn label="フレームを書き出し" title="現在のフレームをPNGとして書き出し" onClick={exportFrame} wide />
        <button className="icon-btn" title="モニター設定" onClick={openSettings}>⚙</button>
      </div>
      {menuEl}
    </div>
  );
}
