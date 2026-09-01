// ============================================================
// Export mode — full-screen Premiere-style Export tab shown
// when ui.exportOpen. Left column: presets + settings. Center:
// preview frame rendered live from the edit graph. Footer runs
// the real WebCodecs export pipeline (exporter.ts).
//
// exporter.ts reports its progress phase in English (engine code
// is not localized); PHASE_JA maps those strings for display.
// ============================================================

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useStudio, useActiveSequence, usePlayhead } from '../../state/store';
import { sequenceDuration, type Sequence } from '../../model/types';
import {
  captionsToSrt, downloadBlob, ExportCancelled, exportSequence,
  type ExportProgress, type ExportSettings,
} from '../../engine/exporter';
import { renderSequenceFrame } from '../../engine/renderer';
import { sharedMedia, sharedPool } from '../../engine/playback';
import { toTimecode } from '../../engine/timecode';
import { DragValue } from '../components/DragValue';
import { toast } from '../menus/menuUtils';

type Fmt = ExportSettings['format'];

const FORMAT_OPTIONS: { id: Fmt; label: string }[] = [
  { id: 'mp4', label: 'H.264 (.mp4)' },
  { id: 'webm', label: 'WebM VP9 (.webm)' },
  { id: 'wav', label: 'WAVオーディオ (.wav)' },
  { id: 'png', label: 'PNG静止画 (.png)' },
  { id: 'png-seq', label: 'PNG連番 (.zip)' },
  { id: 'srt', label: 'SRTキャプション (.srt)' },
  { id: 'vtt', label: 'VTTキャプション (.vtt)' },
  { id: 'project', label: 'プロジェクト (.json)' },
];

const EXT: Record<Fmt, string> = {
  mp4: 'mp4', webm: 'webm', wav: 'wav', png: 'png',
  'png-seq': 'zip', srt: 'srt', vtt: 'vtt', project: 'wvs.json',
};

/** English progress phases emitted by engine/exporter.ts → Japanese display text. */
const PHASE_JA: Record<string, string> = {
  'Mixing audio': 'オーディオをミックス中',
  'Writing WAV': 'WAVを書き込み中',
  'Rendering & encoding': 'レンダリング/エンコード中',
  'Rendering frames': 'フレームをレンダリング中',
  'Packing ZIP': 'ZIPを作成中',
  'Finalizing': '最終処理中',
  'Complete': '完了',
};

const phaseJa = (p: string | undefined): string => (p ? PHASE_JA[p] ?? p : '準備中…');

const WEBCODECS_WARNING = '動画の書き出しには WebCodecs 対応ブラウザー(Chrome / Edge)が必要です';

interface PresetValues {
  format: Fmt;
  width?: number;
  height?: number;
  fps?: number;
  videoMbps?: number;
  audioKbps?: number;
}

const PRESETS: { name: string; apply: (seq: Sequence) => PresetValues }[] = [
  { name: 'ソースに合わせる', apply: (q) => ({ format: 'mp4', width: q.width, height: q.height, fps: q.frameRate, videoMbps: 12, audioKbps: 192 }) },
  { name: 'YouTube 1080p フルHD', apply: () => ({ format: 'mp4', width: 1920, height: 1080, fps: 30, videoMbps: 16, audioKbps: 256 }) },
  { name: 'Web 720p', apply: () => ({ format: 'mp4', width: 1280, height: 720, fps: 30, videoMbps: 8, audioKbps: 192 }) },
  { name: 'ドラフト 480p', apply: () => ({ format: 'mp4', width: 854, height: 480, fps: 30, videoMbps: 2.5, audioKbps: 128 }) },
  { name: 'オーディオのみ(WAV)', apply: () => ({ format: 'wav' }) },
  { name: 'PNG連番', apply: (q) => ({ format: 'png-seq', width: q.width, height: q.height, fps: q.frameRate }) },
];

const evenPx = (v: number) => Math.max(16, Math.round(v / 2) * 2);
const mmss = (t: number) => {
  const s = Math.max(0, Math.round(t));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

export default function ExportDialog() {
  const open = useStudio((s) => s.ui.exportOpen);
  if (!open) return null;
  return <ExportView />;
}

// ---------------- small building blocks ----------------

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{
        fontSize: 11, letterSpacing: 1.2, color: 'var(--text-dim)',
        borderBottom: '1px solid var(--border-light)', paddingBottom: 4, marginBottom: 10,
      }}>{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      {/* wider than the English original: Japanese labels need the room */}
      <div style={{ width: 112, flex: 'none', color: 'var(--text-dim)' }}>{label}</div>
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', flexWrap: 'wrap',
        gap: 6, rowGap: 6, minWidth: 0,
      }}>{children}</div>
    </div>
  );
}

function Check({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, opacity: disabled ? 0.45 : 1, cursor: 'pointer' }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------------- main view ----------------

function ExportView() {
  const setUi = useStudio((s) => s.setUi);
  const project = useStudio((s) => s.project);
  const seq = useActiveSequence();
  const playhead = usePlayhead();
  const seqIn = useStudio((s) => s.ui.seqIn[s.ui.activeSequenceId] ?? null);
  const seqOut = useStudio((s) => s.ui.seqOut[s.ui.activeSequenceId] ?? null);

  // --- settings state (dialog remounts each time it opens) ---
  const [fileName, setFileName] = useState(() => seq.name);
  const [preset, setPreset] = useState(0);
  const [format, setFormat] = useState<Fmt>('mp4');
  const [width, setWidth] = useState(() => evenPx(seq.width));
  const [height, setHeight] = useState(() => evenPx(seq.height));
  const [fps, setFps] = useState(() => ([24, 25, 30, 60].includes(seq.frameRate) ? seq.frameRate : 30));
  const [videoMbps, setVideoMbps] = useState(12);
  const [audioKbps, setAudioKbps] = useState(192);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [aspectLock, setAspectLock] = useState(true);
  const [moreOpen, setMoreOpen] = useState(false);
  const [burnCaptions, setBurnCaptions] = useState(true);
  const [sidecarSrt, setSidecarSrt] = useState(false);
  const [rangeMode, setRangeMode] = useState<'entire' | 'inout'>('entire');

  // --- run state ---
  const [phase, setPhase] = useState<'settings' | 'exporting' | 'done'>('settings');
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ file: string; bytes: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const webCodecsOk = typeof VideoEncoder !== 'undefined';
  const isVideo = format === 'mp4' || format === 'webm';
  const hasFrameSettings = isVideo || format === 'png' || format === 'png-seq';
  const capCount = seq.captions.length;

  const seqDur = Math.max(0.1, sequenceDuration(seq));
  const hasInOut = seqIn != null || seqOut != null;
  const rangeStart = rangeMode === 'inout' ? Math.max(0, seqIn ?? 0) : 0;
  const rangeEnd = rangeMode === 'inout' ? Math.min(seqDur, seqOut ?? seqDur) : seqDur;
  const duration = Math.max(0, rangeEnd - rangeStart);

  const custom = () => setPreset(-1);
  const applyPreset = (idx: number) => {
    setPreset(idx);
    const p = PRESETS[idx]?.apply(seq);
    if (!p) return;
    setFormat(p.format);
    if (p.width) setWidth(evenPx(p.width));
    if (p.height) setHeight(evenPx(p.height));
    if (p.fps) setFps(p.fps);
    if (p.videoMbps) setVideoMbps(p.videoMbps);
    if (p.audioKbps) setAudioKbps(p.audioKbps);
  };

  const changeW = (v: number) => {
    const w = evenPx(v);
    if (aspectLock && width > 0) setHeight(evenPx(w * height / width));
    setWidth(w);
    custom();
  };
  const changeH = (v: number) => {
    const h = evenPx(v);
    if (aspectLock && height > 0) setWidth(evenPx(h * width / height));
    setHeight(h);
    custom();
  };

  // --- preview frame ---
  const previewRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas) return;
    const aw = hasFrameSettings ? width : seq.width;
    const ah = hasFrameSettings ? height : seq.height;
    const pw = 720;
    const ph = Math.max(2, Math.round(pw * ah / Math.max(1, aw)));
    if (canvas.width !== pw || canvas.height !== ph) { canvas.width = pw; canvas.height = ph; }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const renderSeq: Sequence = burnCaptions ? seq : { ...seq, captionsVisible: false };
    void renderSequenceFrame(ctx, project, renderSeq, playhead, {
      width: Math.max(2, Math.round(seq.width / 2)),
      height: Math.max(2, Math.round(seq.height / 2)),
      pool: sharedPool,
      media: sharedMedia,
    }).catch(() => { /* preview render best-effort */ });
  }, [project, seq, playhead, burnCaptions, width, height, hasFrameSettings]);

  // Escape closes (settings phase only)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phase !== 'exporting') setUi({ exportOpen: false });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, setUi]);

  const close = () => {
    abortRef.current?.abort();
    setUi({ exportOpen: false });
  };

  // --- export run ---
  const startExport = async () => {
    const settings: ExportSettings = {
      format,
      width, height, fps,
      videoBitrate: Math.round(videoMbps * 1e6),
      audioBitrate: audioKbps * 1000,
      includeAudio,
      burnCaptions,
      rangeStart, rangeEnd,
      fileName: fileName.trim() || seq.name,
    };
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setProgress(null);
    setPhase('exporting');
    try {
      const { blob, extension } = await exportSequence(project, seq, settings, setProgress, ctrl.signal);
      const outName = `${settings.fileName}.${extension}`;
      downloadBlob(blob, outName);
      if (sidecarSrt && format !== 'srt' && format !== 'vtt' && capCount > 0) {
        downloadBlob(new Blob([captionsToSrt(seq)], { type: 'text/plain' }), `${settings.fileName}.srt`);
      }
      setDoneInfo({ file: outName, bytes: blob.size });
      setPhase('done');
    } catch (e) {
      setPhase('settings');
      if (e instanceof ExportCancelled) toast('書き出しをキャンセルしました');
      else toast(`書き出しに失敗しました — ${(e as Error).message}`);
    }
  };

  const exportBlocked =
    (isVideo && !webCodecsOk) ||
    ((format === 'srt' || format === 'vtt') && capCount === 0) ||
    duration <= 0;

  // --- output summary line ---
  const outputSummary =
    format === 'mp4' ? `H.264 · ${width}×${height} · ${fps}fps · ${videoMbps}Mbps${includeAudio ? ` · AAC ${audioKbps}kbps` : ''}`
    : format === 'webm' ? `VP9 · ${width}×${height} · ${fps}fps · ${videoMbps}Mbps${includeAudio ? ` · Opus ${audioKbps}kbps` : ''}`
    : format === 'wav' ? 'WAV · PCM 16bit · 48kHz ステレオ'
    : format === 'png' ? `PNG静止画 · ${width}×${height}(範囲の開始フレーム)`
    : format === 'png-seq' ? `PNG連番 · ${width}×${height} @ ${fps}fps(.zip)`
    : format === 'srt' || format === 'vtt' ? `キャプション${capCount}項目 · ${format.toUpperCase()}`
    : 'プロジェクトデータ · JSON';

  const estimatedMb = isVideo
    ? ((videoMbps * 1e6 + (includeAudio ? audioKbps * 1000 : 0)) * duration) / 8e6
    : null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1900, background: 'var(--bg-app)', display: 'flex', flexDirection: 'column' }}>
      {/* header */}
      <div style={{
        height: 42, flex: 'none', display: 'flex', alignItems: 'center', gap: 12, padding: '0 14px',
        background: 'var(--bg-panel-header)', borderBottom: '1px solid var(--border)',
      }}>
        <div style={{ fontWeight: 700, letterSpacing: 1.5, color: 'var(--text-bright)', flex: 'none' }}>書き出し</div>
        <div style={{ color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {(fileName.trim() || seq.name)}.{EXT[format]}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn" title="書き出しを閉じる" onClick={close} style={{ padding: '2px 10px' }}>✕</button>
      </div>

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* left column */}
        <div style={{
          width: 372, flex: 'none', overflowY: 'auto', padding: 14,
          background: 'var(--bg-panel)', borderRight: '1px solid var(--border)',
        }}>
          {phase === 'settings' && (
            <>
              {!webCodecsOk && (
                <div style={{
                  border: '1px solid var(--warning)', color: 'var(--warning)', borderRadius: 4,
                  padding: '8px 10px', marginBottom: 14, lineHeight: 1.5,
                }}>
                  {WEBCODECS_WARNING}。WAV / PNG / キャプション / プロジェクトの書き出しは引き続き利用できます。
                </div>
              )}

              <Section title="設定">
                <Field label="ファイル名">
                  <input type="text" value={fileName} style={{ flex: 1, minWidth: 120 }} onChange={(e) => setFileName(e.target.value)} />
                </Field>
                <Field label="保存先">
                  <span style={{ color: 'var(--text-dim)' }}>ブラウザーのダウンロード</span>
                </Field>
                <Field label="プリセット">
                  <select value={preset} style={{ flex: 1, minWidth: 120 }} onChange={(e) => applyPreset(parseInt(e.target.value, 10))}>
                    {preset === -1 && <option value={-1}>カスタム</option>}
                    {PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
                  </select>
                </Field>
                <Field label="形式">
                  <select value={format} style={{ flex: 1, minWidth: 120 }} onChange={(e) => { setFormat(e.target.value as Fmt); custom(); }}>
                    {FORMAT_OPTIONS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
                  </select>
                </Field>
              </Section>

              {hasFrameSettings && (
                <Section title="ビデオ">
                  <Field label="フレームサイズ">
                    <input
                      type="number" value={width} style={{ width: 66 }} min={16} step={2}
                      onChange={(e) => changeW(parseInt(e.target.value, 10) || width)}
                    />
                    <span style={{ color: 'var(--text-dim)' }}>×</span>
                    <input
                      type="number" value={height} style={{ width: 66 }} min={16} step={2}
                      onChange={(e) => changeH(parseInt(e.target.value, 10) || height)}
                    />
                    <Check label="縦横比を固定" checked={aspectLock} onChange={setAspectLock} />
                  </Field>
                  <Field label="フレームレート">
                    <select value={fps} onChange={(e) => { setFps(parseInt(e.target.value, 10)); custom(); }}>
                      {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f}fps</option>)}
                    </select>
                  </Field>
                  {isVideo && (
                    <Field label="ビットレート">
                      <DragValue
                        value={videoMbps} min={2} max={50} step={0.5} precision={1} width={54}
                        onChange={(v) => { setVideoMbps(Math.round(v * 10) / 10); custom(); }}
                      />
                      <span style={{ color: 'var(--text-dim)' }}>Mbps</span>
                    </Field>
                  )}
                  <div
                    style={{ color: 'var(--text-dim)', cursor: 'pointer', margin: '4px 0 2px', userSelect: 'none' }}
                    onClick={() => setMoreOpen(!moreOpen)}
                  >
                    {moreOpen ? '▾' : '▸'} 詳細
                  </div>
                  {moreOpen && (
                    <div style={{ paddingLeft: 14, color: 'var(--text-dim)', lineHeight: 1.7 }}>
                      <div>キーフレーム間隔: 2秒ごと(固定)</div>
                      <div>ハードウェアアクセラレーション: 自動(WebCodecs)</div>
                      {format === 'png-seq' && <div>PNG連番は最大1800フレームまでです。</div>}
                    </div>
                  )}
                </Section>
              )}

              {(isVideo || format === 'wav') && (
                <Section title="オーディオ">
                  {format === 'wav'
                    ? <div style={{ color: 'var(--text-dim)', lineHeight: 1.6 }}>非圧縮PCM 16bit · 48kHz · シーケンスのステレオミックスダウン。</div>
                    : (
                      <>
                        <div style={{ marginBottom: 8 }}>
                          <Check label="オーディオを書き出す" checked={includeAudio} onChange={(v) => { setIncludeAudio(v); custom(); }} />
                        </div>
                        <Field label="ビットレート">
                          <select
                            value={audioKbps} disabled={!includeAudio}
                            onChange={(e) => { setAudioKbps(parseInt(e.target.value, 10)); custom(); }}
                          >
                            {[128, 192, 256].map((k) => <option key={k} value={k}>{k}kbps</option>)}
                          </select>
                        </Field>
                      </>
                    )}
                </Section>
              )}

              {format !== 'srt' && format !== 'vtt' && format !== 'project' && format !== 'wav' && (
                <Section title="キャプション">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Check label="キャプションを映像に焼き込む" checked={burnCaptions} onChange={setBurnCaptions} disabled={capCount === 0} />
                    <Check label="SRTファイルも別途書き出す" checked={sidecarSrt} onChange={setSidecarSrt} disabled={capCount === 0} />
                    <div style={{ color: 'var(--text-dim)' }}>このシーケンスのキャプション: {capCount}項目</div>
                  </div>
                </Section>
              )}

              <Section title="範囲">
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, cursor: 'pointer' }}>
                  <input type="radio" name="exp-range" checked={rangeMode === 'entire'} onChange={() => setRangeMode('entire')} />
                  シーケンス全体
                  <span className="timecode dim" style={{ marginLeft: 'auto' }}>{toTimecode(seqDur, seq.frameRate)}</span>
                </label>
                <label style={{
                  display: 'flex', alignItems: 'center', gap: 6, cursor: hasInOut ? 'pointer' : 'default',
                  opacity: hasInOut ? 1 : 0.45,
                }}>
                  <input
                    type="radio" name="exp-range" disabled={!hasInOut}
                    checked={rangeMode === 'inout'} onChange={() => setRangeMode('inout')}
                  />
                  インからアウト
                  <span className="timecode dim" style={{ marginLeft: 'auto' }}>
                    {hasInOut ? `${toTimecode(Math.max(0, seqIn ?? 0), seq.frameRate)} – ${toTimecode(Math.min(seqDur, seqOut ?? seqDur), seq.frameRate)}` : '未設定'}
                  </span>
                </label>
              </Section>
            </>
          )}

          {phase === 'exporting' && (
            <div style={{ paddingTop: 30, textAlign: 'center' }}>
              <div style={{ fontSize: 34, fontWeight: 700, color: 'var(--text-bright)', fontFamily: 'var(--font-mono)' }}>
                {Math.round((progress?.fraction ?? 0) * 100)}%
              </div>
              <div style={{
                height: 6, borderRadius: 3, background: 'var(--bg-inset)', margin: '16px 6px',
                border: '1px solid var(--border)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', width: `${(progress?.fraction ?? 0) * 100}%`,
                  background: 'var(--accent)', transition: 'width 160ms linear',
                }} />
              </div>
              <div style={{ color: 'var(--text-bright)', marginBottom: 6 }}>{phaseJa(progress?.phase)}</div>
              {progress && progress.totalFrames > 1 && (
                <div style={{ color: 'var(--text-dim)', marginBottom: 6 }}>
                  フレーム {Math.min(progress.frame, progress.totalFrames)} / {progress.totalFrames}
                </div>
              )}
              <div style={{ color: 'var(--text-dim)' }}>
                経過 {mmss(progress?.elapsed ?? 0)} · 残り {mmss(progress?.estimatedRemaining ?? 0)}
              </div>
              <button
                className="btn" style={{ marginTop: 22 }}
                onClick={() => abortRef.current?.abort()}
              >
                書き出しをキャンセル
              </button>
            </div>
          )}

          {phase === 'done' && doneInfo && (
            <div style={{ paddingTop: 40, textAlign: 'center' }}>
              <div style={{
                width: 46, height: 46, margin: '0 auto', borderRadius: '50%',
                border: '2px solid #3a8a5f', color: '#3a8a5f', fontSize: 24, lineHeight: '42px',
              }}>✓</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-bright)', marginTop: 14 }}>
                書き出しが完了しました
              </div>
              <div style={{ color: 'var(--text-dim)', marginTop: 6 }}>ダウンロードフォルダーに保存しました</div>
              <div style={{
                marginTop: 16, padding: '8px 10px', border: '1px solid var(--border-light)', borderRadius: 4,
                background: 'var(--bg-inset)', fontFamily: 'var(--font-mono)', fontSize: 11,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {doneInfo.file} · {(doneInfo.bytes / 1e6).toFixed(doneInfo.bytes < 1e6 ? 2 : 1)} MB
              </div>
              <button className="btn" style={{ marginTop: 18 }} onClick={() => setPhase('settings')}>
                続けて書き出す
              </button>
            </div>
          )}
        </div>

        {/* preview */}
        <div style={{
          flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', background: 'var(--bg-inset)', padding: 24,
        }}>
          <canvas
            ref={previewRef}
            style={{
              maxWidth: '100%', maxHeight: 'calc(100% - 110px)', objectFit: 'contain',
              background: '#000', border: '1px solid var(--border-light)', boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
            }}
          />
          <div style={{ marginTop: 16, textAlign: 'center', lineHeight: 1.9, fontSize: 11 }}>
            <div style={{ color: 'var(--text-dim)' }}>
              ソース: {seq.name} — {seq.width}×{seq.height} / {seq.frameRate}fps
            </div>
            <div style={{ color: 'var(--text)' }}>出力: {outputSummary}</div>
            <div style={{ color: 'var(--text-dim)' }}>
              デュレーション <span className="timecode">{toTimecode(duration, seq.frameRate)}</span>
              {estimatedMb != null && <> · 推定ファイルサイズ ≈ {estimatedMb < 1 ? estimatedMb.toFixed(2) : estimatedMb.toFixed(1)} MB</>}
            </div>
          </div>
        </div>
      </div>

      {/* footer */}
      <div style={{
        height: 50, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        gap: 8, padding: '0 16px', background: 'var(--bg-panel-header)', borderTop: '1px solid var(--border)',
      }}>
        {phase === 'settings' && (
          <>
            <button className="btn" onClick={close}>キャンセル</button>
            <button
              className="btn primary"
              disabled={exportBlocked}
              title={exportBlocked
                ? (isVideo && !webCodecsOk ? WEBCODECS_WARNING
                  : duration <= 0 ? '書き出す範囲が空です'
                  : 'このシーケンスにはキャプションがありません')
                : undefined}
              onClick={() => void startExport()}
            >
              書き出し
            </button>
          </>
        )}
        {phase === 'exporting' && (
          <button className="btn" onClick={() => abortRef.current?.abort()}>キャンセル</button>
        )}
        {phase === 'done' && (
          <button className="btn primary" onClick={() => setUi({ exportOpen: false })}>完了</button>
        )}
      </div>
    </div>
  );
}
