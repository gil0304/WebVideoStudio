// ============================================================
// Captions panel — caption list editing (in/out/text), SRT/VTT
// import & export, burn-in visibility toggle and caption style.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStudio, useActiveSequence, usePlayhead, parseSubtitles } from '../../state/store';
import { toTimecode, parseTimecode, snapToFrame } from '../../engine/timecode';
import { captionsToSrt, captionsToVtt, downloadBlob } from '../../engine/exporter';
import { DragValue } from '../components/DragValue';

const FPS = 30;
const MIN_DUR = 1 / FPS;

const toolBtn: CSSProperties = {
  fontSize: 11, padding: '3px 8px', background: 'var(--bg-input)',
  border: '1px solid var(--border-light)', borderRadius: 3, cursor: 'pointer',
  whiteSpace: 'nowrap',
};

const label11: CSSProperties = { fontSize: 11, color: 'var(--text-dim)' };

// ---------------- timecode input ----------------

function TimecodeInput({ value, onCommit, title }: { value: number; onCommit: (t: number) => void; title: string }) {
  const [text, setText] = useState(() => toTimecode(value, FPS));
  const cancelRef = useRef(false);
  useEffect(() => { setText(toTimecode(value, FPS)); }, [value]);
  return (
    <input
      type="text"
      title={title}
      value={text}
      className="timecode"
      style={{ width: 76, fontSize: 10, padding: '2px 4px', textAlign: 'center', flex: 'none' }}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') { cancelRef.current = true; (e.target as HTMLInputElement).blur(); }
      }}
      onBlur={() => {
        if (cancelRef.current) {
          cancelRef.current = false;
          setText(toTimecode(value, FPS));
          return;
        }
        const t = parseTimecode(text, FPS);
        if (t != null && t >= 0) onCommit(snapToFrame(t, FPS));
        else setText(toTimecode(value, FPS));
      }}
    />
  );
}

// ---------------- style editor ----------------

function StyleSection() {
  const seq = useActiveSequence();
  const setCaptionStyle = useStudio((s) => s.setCaptionStyle);
  const [open, setOpen] = useState(false);
  const st = seq.captionStyle;

  const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' };
  const lab: CSSProperties = { ...label11, width: 64, flex: 'none', whiteSpace: 'nowrap' };

  return (
    <div style={{ flex: 'none', borderTop: '1px solid var(--border)', padding: '4px 8px 8px' }}>
      <div
        style={{ fontSize: 11, color: 'var(--text)', cursor: 'pointer', padding: '3px 0', userSelect: 'none' }}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ display: 'inline-block', width: 12, color: 'var(--text-dim)' }}>{open ? '▾' : '▸'}</span>
        キャプションスタイル
      </div>
      {open && (
        <div style={{ paddingLeft: 12 }}>
          <div style={row}>
            <span style={lab}>サイズ</span>
            <DragValue
              value={st.fontSize} min={16} max={120} step={1} precision={0} suffix=" px" width={52}
              onChange={(v) => setCaptionStyle({ fontSize: Math.round(v) })}
            />
          </div>
          <div style={row}>
            <span style={lab}>文字色</span>
            <input
              type="color"
              value={st.color}
              style={{ width: 36, height: 18, padding: 0, border: '1px solid var(--border-light)', background: 'transparent', cursor: 'pointer' }}
              onChange={(e) => setCaptionStyle({ color: e.target.value })}
            />
          </div>
          <div style={row}>
            <span style={lab}>背景色</span>
            <input
              type="color"
              value={st.bgColor}
              style={{ width: 36, height: 18, padding: 0, border: '1px solid var(--border-light)', background: 'transparent', cursor: 'pointer' }}
              onChange={(e) => setCaptionStyle({ bgColor: e.target.value })}
            />
            <input
              type="range"
              min={0} max={1} step={0.05}
              value={st.bgOpacity}
              style={{ flex: 1, minWidth: 40 }}
              title="背景の不透明度"
              onChange={(e) => setCaptionStyle({ bgOpacity: parseFloat(e.target.value) })}
            />
            <span style={{ ...label11, width: 30, textAlign: 'right' }}>{Math.round(st.bgOpacity * 100)}%</span>
          </div>
          <div style={row}>
            <span style={lab}>位置</span>
            <select value={st.position} onChange={(e) => setCaptionStyle({ position: e.target.value as 'top' | 'bottom' })}>
              <option value="bottom">下</option>
              <option value="top">上</option>
            </select>
          </div>
          <div style={row}>
            <span style={lab}>縁取り</span>
            <select value={st.edge} onChange={(e) => setCaptionStyle({ edge: e.target.value as 'none' | 'shadow' | 'outline' })}>
              <option value="none">なし</option>
              <option value="shadow">シャドウ</option>
              <option value="outline">アウトライン</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------- panel ----------------

export default function CaptionsPanel() {
  const seq = useActiveSequence();
  const playhead = usePlayhead();
  const playing = useStudio((s) => s.ui.playing);
  const addCaption = useStudio((s) => s.addCaption);
  const patchCaption = useStudio((s) => s.patchCaption);
  const removeCaption = useStudio((s) => s.removeCaption);
  const toggleCaptionsVisible = useStudio((s) => s.toggleCaptionsVisible);
  const importCaptions = useStudio((s) => s.importCaptions);
  const setPlayhead = useStudio((s) => s.setPlayhead);

  const fileRef = useRef<HTMLInputElement | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const activeId = seq.captions.find((c) => playhead >= c.start && playhead < c.end)?.id ?? null;

  useEffect(() => {
    if (playing && activeId) rowRefs.current[activeId]?.scrollIntoView({ block: 'nearest' });
  }, [playing, activeId]);

  const onImportFile = async (file: File | undefined) => {
    if (!file) return;
    const text = await file.text();
    const items = parseSubtitles(text);
    if (items.length > 0) importCaptions(items);
    if (fileRef.current) fileRef.current.value = '';
  };

  const grow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* toolbar */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 5, padding: '5px 8px', flex: 'none',
        alignItems: 'center', borderBottom: '1px solid var(--border)', background: 'var(--bg-panel-header)',
      }}>
        <button style={toolBtn} onClick={() => addCaption(playhead, playhead + 2, '新しいキャプション')}>+ キャプションを追加</button>
        <button style={toolBtn} onClick={() => fileRef.current?.click()}>SRT/VTTを読み込み</button>
        <input
          ref={fileRef} type="file" accept=".srt,.vtt" style={{ display: 'none' }}
          onChange={(e) => { void onImportFile(e.target.files?.[0]); }}
        />
        <button style={{ ...toolBtn, opacity: seq.captions.length ? 1 : 0.4 }} disabled={seq.captions.length === 0}
          onClick={() => downloadBlob(new Blob([captionsToSrt(seq)], { type: 'text/plain' }), `${seq.name}.srt`)}>
          SRTを書き出し
        </button>
        <button style={{ ...toolBtn, opacity: seq.captions.length ? 1 : 0.4 }} disabled={seq.captions.length === 0}
          onClick={() => downloadBlob(new Blob([captionsToVtt(seq)], { type: 'text/vtt' }), `${seq.name}.vtt`)}>
          VTTを書き出し
        </button>
        <button
          style={{ ...toolBtn, opacity: 0.45, cursor: 'not-allowed' }}
          disabled
          title="音声認識には文字起こしバックエンドが必要です。このビルドには含まれていません"
        >
          シーケンスを自動文字起こし
        </button>
        <label style={{
          ...label11, display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
          marginLeft: 'auto', whiteSpace: 'nowrap',
        }}>
          <input type="checkbox" checked={seq.captionsVisible} onChange={toggleCaptionsVisible} />
          キャプションを表示(焼き込みプレビュー)
        </label>
      </div>

      {/* caption list */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {seq.captions.length === 0 && (
          <div style={{ padding: 14, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            キャプションはまだありません。<br />
            <b>+ キャプションを追加</b>で再生ヘッドの位置に作成するか、SRT/VTTファイルを読み込んでください。
          </div>
        )}
        {seq.captions.map((c) => {
          const active = c.id === activeId;
          return (
            <div
              key={c.id}
              ref={(el) => { rowRefs.current[c.id] = el; }}
              onClick={() => setPlayhead(c.start)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 6, padding: '5px 8px',
                borderBottom: '1px solid var(--border)', cursor: 'pointer',
                background: active ? 'rgba(45,140,235,0.14)' : 'transparent',
                borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 'none' }}>
                <TimecodeInput
                  title="インポイント"
                  value={c.start}
                  onCommit={(t) => patchCaption(c.id, { start: Math.min(t, c.end - MIN_DUR) })}
                />
                <TimecodeInput
                  title="アウトポイント"
                  value={c.end}
                  onCommit={(t) => patchCaption(c.id, { end: Math.max(t, c.start + MIN_DUR) })}
                />
              </div>
              <textarea
                rows={1}
                value={c.text}
                ref={grow}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={(e) => e.stopPropagation()}
                onChange={(e) => { patchCaption(c.id, { text: e.target.value }); grow(e.target); }}
                style={{
                  flex: 1, minWidth: 0, resize: 'none', overflow: 'hidden', fontSize: 12,
                  lineHeight: 1.35, minHeight: 24,
                }}
              />
              <button
                title="キャプションを削除"
                onClick={(e) => { e.stopPropagation(); removeCaption(c.id); }}
                style={{ flex: 'none', color: 'var(--text-dim)', fontSize: 13, padding: '2px 4px', lineHeight: 1 }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <StyleSection />
    </div>
  );
}
