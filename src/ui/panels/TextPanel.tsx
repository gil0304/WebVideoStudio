// ============================================================
// Essential Graphics panel — "Browse" tab with graphic templates
// (built at the playhead on the top video track) and an "Edit"
// tab with the text-layer list + full typographic / transform
// properties for the selected layer of the selected graphic clip.
// ============================================================

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { TextLayer, TextLayerKind } from '../../model/types';
import { findClip } from '../../model/types';
import { useStudio, getActiveSequence, getPlayhead } from '../../state/store';
import { defaultTextLayer } from '../../model/clipFactory';
import { snapToFrame } from '../../engine/timecode';
import { DragValue } from '../components/DragValue';
import { ControlsCss, cssColorToHex } from './controls/shared';

// ---------------- fonts ----------------

const FONTS: { label: string; value: string }[] = [
  { label: 'Helvetica Neue', value: '"Helvetica Neue", Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Futura', value: 'Futura, "Trebuchet MS", sans-serif' },
  { label: 'Avenir Next', value: '"Avenir Next", "Segoe UI", sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times New Roman', value: '"Times New Roman", Times, serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Impact', value: 'Impact, "Arial Black", sans-serif' },
  { label: 'Hiragino Sans', value: '"Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif' },
  { label: 'Hiragino Mincho ProN', value: '"Hiragino Mincho ProN", serif' },
  { label: 'SF Mono', value: '"SF Mono", Menlo, monospace' },
];

const WEIGHTS = [300, 400, 500, 600, 700, 800, 900];

const KIND_ICON: Record<TextLayerKind, string> = { text: 'T', rect: '▭', ellipse: '◯', line: '─' };

/** レイヤー種別の表示名(レイヤー一覧のツールチップ用)。 */
const KIND_NAMES: Record<TextLayerKind, string> = { text: 'テキスト', rect: '長方形', ellipse: '楕円形', line: '線' };

const ALIGN_TITLES: Record<'left' | 'center' | 'right', string> = {
  left: '左揃え', center: '中央揃え', right: '右揃え',
};

// ---------------- templates (Browse tab) ----------------

interface GfxTemplate {
  name: string;
  build: () => TextLayer[];
  preview: ReactNode;
}

// 注: レイヤーの `text`(映像に描画される文字)は原文のまま。`name`(レイヤー一覧の表示名)のみ日本語化する。
const TEMPLATES: GfxTemplate[] = [
  {
    name: 'ローワーサード',
    build: () => [
      defaultTextLayer({ kind: 'rect', name: '背景板', text: undefined, x: 430, y: 920, width: 560, height: 92, fill: 'rgba(8,10,18,0.72)' }),
      defaultTextLayer({ kind: 'rect', name: 'アクセントバー', text: undefined, x: 176, y: 920, width: 6, height: 92, fill: '#2d8ceb' }),
      defaultTextLayer({ name: '名前', text: 'NAME SURNAME', fontSize: 44, fontWeight: 700, letterSpacing: 6, align: 'left', x: 320, y: 902, fill: '#ffffff' }),
      defaultTextLayer({ name: '肩書き', text: 'Job Title', fontSize: 26, fontWeight: 400, letterSpacing: 3, align: 'left', x: 320, y: 944, fill: '#9fd8ff' }),
    ],
    preview: (
      <>
        <div style={{ position: 'absolute', left: '10%', bottom: '14%', width: '42%', height: '18%', background: 'rgba(255,255,255,0.14)', borderLeft: '2px solid var(--accent-bright)' }} />
        <div style={{ position: 'absolute', left: '14%', bottom: '23%', width: '26%', height: '4%', background: '#dfe6ee' }} />
        <div style={{ position: 'absolute', left: '14%', bottom: '17%', width: '18%', height: '3%', background: '#7fb6e8' }} />
      </>
    ),
  },
  {
    name: 'センタータイトル',
    build: () => [
      defaultTextLayer({ name: 'タイトル', text: 'MAIN TITLE', fontSize: 120, fontWeight: 800, letterSpacing: 18, x: 960, y: 510, fill: '#ffffff', shadow: true, shadowBlur: 30, shadowColor: 'rgba(0,0,0,0.6)' }),
      defaultTextLayer({ kind: 'rect', name: '罫線', text: undefined, x: 960, y: 566, width: 420, height: 3, fill: '#2d8ceb' }),
      defaultTextLayer({ name: 'サブタイトル', text: 'A SHORT SUBTITLE', fontSize: 34, fontWeight: 500, letterSpacing: 10, x: 960, y: 615, fill: '#c9d6e2' }),
    ],
    preview: (
      <>
        <div style={{ position: 'absolute', left: '24%', top: '38%', width: '52%', height: '8%', background: '#e8edf3' }} />
        <div style={{ position: 'absolute', left: '38%', top: '52%', width: '24%', height: '2.5%', background: 'var(--accent-bright)' }} />
        <div style={{ position: 'absolute', left: '33%', top: '59%', width: '34%', height: '4%', background: '#9aa8b8' }} />
      </>
    ),
  },
  {
    name: 'キャプションボックス',
    build: () => [
      defaultTextLayer({ name: 'キャプション', text: 'Your caption text here', fontSize: 40, fontWeight: 500, x: 960, y: 950, fill: '#ffffff', bgEnabled: true, bgColor: 'rgba(0,0,0,0.65)', bgPadding: 18 }),
    ],
    preview: (
      <>
        <div style={{ position: 'absolute', left: '22%', bottom: '9%', width: '56%', height: '14%', background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 2 }} />
        <div style={{ position: 'absolute', left: '28%', bottom: '13.5%', width: '44%', height: '4%', background: '#d8dee6' }} />
      </>
    ),
  },
  {
    name: 'エンドカード',
    build: () => [
      defaultTextLayer({ kind: 'rect', name: '背景', text: undefined, x: 960, y: 540, width: 1920, height: 1080, fill: 'rgba(6,8,14,0.92)' }),
      defaultTextLayer({ name: 'お礼', text: 'THANKS FOR WATCHING', fontSize: 88, fontWeight: 800, letterSpacing: 12, x: 960, y: 470, fill: '#ffffff' }),
      defaultTextLayer({ name: 'CTA', text: 'SUBSCRIBE • LIKE • SHARE', fontSize: 36, fontWeight: 600, letterSpacing: 8, x: 960, y: 590, fill: '#4da3ff' }),
    ],
    preview: (
      <>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
        <div style={{ position: 'absolute', left: '20%', top: '36%', width: '60%', height: '7%', background: '#e8edf3' }} />
        <div style={{ position: 'absolute', left: '30%', top: '50%', width: '40%', height: '4%', background: 'var(--accent-bright)' }} />
      </>
    ),
  },
];

// ---------------- scoped styles ----------------

function TextCss() {
  return (
    <style>{`
      .wvs-tp-tabs { display: flex; border-bottom: 1px solid var(--border); background: var(--bg-panel-header); position: sticky; top: 0; z-index: 3; }
      .wvs-tp-tab { padding: 5px 14px; font-size: 11px; color: var(--text-dim); cursor: pointer; border-bottom: 2px solid transparent; }
      .wvs-tp-tab.active { color: var(--text-bright); border-bottom-color: var(--accent); }
      .wvs-tp-tab:hover:not(.active) { color: var(--text); }
      .wvs-tp-cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; padding: 10px; }
      .wvs-tp-card { cursor: pointer; border: 1px solid var(--border-light); border-radius: 3px; overflow: hidden; background: var(--bg-inset); }
      .wvs-tp-card:hover { border-color: var(--accent); }
      .wvs-tp-card .prev { position: relative; aspect-ratio: 16 / 9; background: linear-gradient(135deg, #23303e 0%, #17202b 60%, #101820 100%); }
      .wvs-tp-card .cap { padding: 4px 6px; font-size: 10px; color: var(--text); border-top: 1px solid var(--border); }
      .wvs-tp-toolbar { display: flex; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--border); }
      .wvs-tp-layers { border-bottom: 1px solid var(--border); max-height: 180px; overflow-y: auto; }
      .wvs-tp-layer { display: flex; align-items: center; gap: 5px; padding: 2px 6px; min-height: 22px; font-size: 11px; cursor: default; }
      .wvs-tp-layer:hover { background: rgba(255,255,255,0.03); }
      .wvs-tp-layer.sel { background: rgba(45,140,235,0.22); }
      .wvs-tp-layer .kind { width: 14px; flex: none; text-align: center; color: var(--text-dim); font-size: 10px; }
      .wvs-tp-layer .nm { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .wvs-tp-layer .nm.hidden-l { color: var(--text-disabled); }
      .wvs-tp-layer input.nm-edit { flex: 1; min-width: 0; font-size: 11px; }
      .wvs-tp-layer .ops { display: none; gap: 1px; flex: none; }
      .wvs-tp-layer:hover .ops, .wvs-tp-layer.sel .ops { display: inline-flex; }
      .wvs-tp-layer .ops button, .wvs-tp-layer .eye { width: 16px; height: 16px; padding: 0; font-size: 9px; color: var(--text-dim); display: inline-flex; align-items: center; justify-content: center; }
      .wvs-tp-layer .ops button:hover:not(:disabled), .wvs-tp-layer .eye:hover { color: var(--text-bright); }
      .wvs-tp-layer .ops button:disabled { color: var(--text-disabled); cursor: default; }
      .wvs-tp-layer .eye { flex: none; }
      .wvs-tp-layer .eye.off { color: var(--text-disabled); }
      .wvs-tp-prow { display: flex; align-items: center; gap: 8px; padding: 2px 10px; min-height: 22px; font-size: 11px; }
      .wvs-tp-prow:hover { background: rgba(255,255,255,0.025); }
      .wvs-tp-plabel { flex: 0 0 86px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .wvs-tp-pctl { flex: 1; display: flex; align-items: center; gap: 8px; min-width: 0; }
      .wvs-tp-pctl select { flex: 1; min-width: 0; }
      .wvs-tp-sub { padding: 6px 10px 2px; font-size: 10px; font-weight: 600; letter-spacing: 0.4px; color: var(--text-dim); text-transform: uppercase; border-top: 1px solid var(--border); margin-top: 4px; }
      .wvs-tp-ta { width: 100%; min-height: 52px; resize: vertical; font-size: 11px; font-family: var(--font-ui); }
      .wvs-tp-align { width: 22px; height: 18px; padding: 0; display: inline-flex; align-items: center; justify-content: center; color: var(--text-dim); border: 1px solid var(--border-light); border-radius: 2px; background: var(--bg-input); }
      .wvs-tp-align.on { color: var(--accent-bright); border-color: var(--accent); }
      .wvs-tp-italic { width: 22px; height: 18px; padding: 0; font-style: italic; font-family: Georgia, serif; font-size: 12px; color: var(--text-dim); border: 1px solid var(--border-light); border-radius: 2px; background: var(--bg-input); }
      .wvs-tp-italic.on { color: var(--accent-bright); border-color: var(--accent); }
    `}</style>
  );
}

// ---------------- small pieces ----------------

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.1">
      {off
        ? <line x1="2" y1="6" x2="10" y2="6" />
        : (
          <>
            <path d="M1 6 C 2.8 3.4, 9.2 3.4, 11 6 C 9.2 8.6, 2.8 8.6, 1 6 Z" />
            <circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" />
          </>
        )}
    </svg>
  );
}

function AlignIcon({ a }: { a: 'left' | 'center' | 'right' }) {
  const w = (i: number) => [8, 5, 8][i];
  const x = (i: number) => (a === 'left' ? 1 : a === 'right' ? 9 - w(i) : (10 - w(i)) / 2);
  return (
    <svg width="10" height="10" viewBox="0 0 10 10">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={x(i)} y={1.5 + i * 3} width={w(i)} height="1.6" fill="currentColor" />
      ))}
    </svg>
  );
}

function EditableName({ name, muted, onCommit }: { name: string; muted: boolean; onCommit: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(name);
  if (!editing) {
    return (
      <span
        className={`nm ${muted ? 'hidden-l' : ''}`}
        title="ダブルクリックで名前を変更"
        onDoubleClick={() => { setText(name); setEditing(true); }}
      >
        {name}
      </span>
    );
  }
  return (
    <input
      className="nm-edit"
      autoFocus
      value={text}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={() => {
        if (text.trim() && text !== name) onCommit(text.trim());
        setEditing(false);
      }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

function PropRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="wvs-tp-prow">
      <span className="wvs-tp-plabel">{label}</span>
      <span className="wvs-tp-pctl">{children}</span>
    </div>
  );
}

// ---------------- layer properties ----------------

function LayerProperties({ clipId, layer }: { clipId: string; layer: TextLayer }) {
  const s = useStudio();
  const typing = useRef(false);
  const patch = (p: Partial<TextLayer>) => s.patchTextLayer(clipId, layer.id, p, 'Edit Text');
  const begin = () => s.beginTransaction('Edit Text');
  const end = () => s.endTransaction();

  const num = (label: string, key: keyof TextLayer, value: number, opts: { min?: number; max?: number; step?: number; precision?: number; suffix?: string } = {}) => (
    <PropRow label={label}>
      <DragValue
        value={value}
        min={opts.min}
        max={opts.max}
        step={opts.step ?? 1}
        precision={opts.precision ?? (opts.step && opts.step < 1 ? 2 : 0)}
        suffix={opts.suffix ?? ''}
        onChange={(v) => patch({ [key]: v } as Partial<TextLayer>)}
        onDragStart={begin}
        onDragEnd={end}
      />
    </PropRow>
  );

  const color = (label: string, key: keyof TextLayer, value: string) => (
    <PropRow label={label}>
      <input
        type="color"
        className="wvs-color-input"
        value={cssColorToHex(value)}
        onChange={(e) => patch({ [key]: e.target.value } as Partial<TextLayer>)}
      />
    </PropRow>
  );

  const isText = layer.kind === 'text';
  const fontKnown = FONTS.some((f) => f.value === layer.fontFamily);

  return (
    <>
      {isText && (
        <>
          <div className="wvs-tp-sub">テキスト</div>
          <div style={{ padding: '2px 10px 4px' }}>
            <textarea
              className="wvs-tp-ta"
              value={layer.text ?? ''}
              onChange={(e) => {
                if (!typing.current) { begin(); typing.current = true; }
                patch({ text: e.target.value });
              }}
              onBlur={() => { if (typing.current) { end(); typing.current = false; } }}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
          <PropRow label="フォント">
            <select value={layer.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value })}>
              {!fontKnown && <option value={layer.fontFamily}>{layer.fontFamily.split(',')[0].replace(/"/g, '')}</option>}
              {FONTS.map((f) => <option key={f.label} value={f.value}>{f.label}</option>)}
            </select>
          </PropRow>
          <PropRow label="ウェイト">
            <select
              style={{ flex: '0 0 64px' }}
              value={layer.fontWeight}
              onChange={(e) => patch({ fontWeight: parseInt(e.target.value, 10) })}
            >
              {WEIGHTS.map((w) => <option key={w} value={w}>{w}</option>)}
            </select>
            <button
              className={`wvs-tp-italic ${layer.fontStyle === 'italic' ? 'on' : ''}`}
              title="イタリック"
              onClick={() => patch({ fontStyle: layer.fontStyle === 'italic' ? 'normal' : 'italic' })}
            >I</button>
          </PropRow>
          {num('サイズ', 'fontSize', layer.fontSize, { min: 8, max: 400 })}
          {num('字間', 'letterSpacing', layer.letterSpacing, { min: -20, max: 200, step: 0.5, precision: 1, suffix: ' px' })}
          {num('行送り', 'lineHeight', layer.lineHeight, { min: 0.8, max: 3, step: 0.05, precision: 2 })}
          <PropRow label="整列">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                className={`wvs-tp-align ${layer.align === a ? 'on' : ''}`}
                title={ALIGN_TITLES[a]}
                onClick={() => patch({ align: a })}
              >
                <AlignIcon a={a} />
              </button>
            ))}
          </PropRow>
        </>
      )}

      <div className="wvs-tp-sub">アピアランス</div>
      {color('塗り', 'fill', layer.fill)}
      <PropRow label="境界線">
        <input
          type="color"
          className="wvs-color-input"
          value={cssColorToHex(layer.strokeColor)}
          onChange={(e) => patch({ strokeColor: e.target.value })}
        />
        <DragValue
          value={layer.strokeWidth}
          min={0}
          max={100}
          step={1}
          precision={0}
          suffix=" px"
          onChange={(v) => patch({ strokeWidth: v })}
          onDragStart={begin}
          onDragEnd={end}
        />
      </PropRow>

      <div className="wvs-tp-sub">シャドウ</div>
      <PropRow label="シャドウ">
        <label className="wvs-ec-check">
          <input type="checkbox" checked={layer.shadow} onChange={(e) => patch({ shadow: e.target.checked })} />
          有効
        </label>
      </PropRow>
      {layer.shadow && (
        <>
          {color('カラー', 'shadowColor', layer.shadowColor)}
          {num('ぼかし', 'shadowBlur', layer.shadowBlur, { min: 0, max: 200, suffix: ' px' })}
          {num('オフセットX', 'shadowOffsetX', layer.shadowOffsetX, { min: -200, max: 200, suffix: ' px' })}
          {num('オフセットY', 'shadowOffsetY', layer.shadowOffsetY, { min: -200, max: 200, suffix: ' px' })}
        </>
      )}

      {isText && (
        <>
          <div className="wvs-tp-sub">背景</div>
          <PropRow label="背景">
            <label className="wvs-ec-check">
              <input type="checkbox" checked={layer.bgEnabled} onChange={(e) => patch({ bgEnabled: e.target.checked })} />
              有効
            </label>
          </PropRow>
          {layer.bgEnabled && (
            <>
              {color('カラー', 'bgColor', layer.bgColor)}
              {num('余白', 'bgPadding', layer.bgPadding, { min: 0, max: 200, suffix: ' px' })}
            </>
          )}
        </>
      )}

      <div className="wvs-tp-sub">トランスフォーム</div>
      <PropRow label="位置">
        <DragValue value={layer.x} step={1} precision={0} onChange={(v) => patch({ x: v })} onDragStart={begin} onDragEnd={end} />
        <DragValue value={layer.y} step={1} precision={0} onChange={(v) => patch({ y: v })} onDragStart={begin} onDragEnd={end} />
      </PropRow>
      {!isText && (
        <PropRow label="サイズ">
          <DragValue value={layer.width} min={1} max={4000} step={1} precision={0} onChange={(v) => patch({ width: v })} onDragStart={begin} onDragEnd={end} />
          <DragValue value={layer.height} min={1} max={4000} step={1} precision={0} onChange={(v) => patch({ height: v })} onDragStart={begin} onDragEnd={end} />
        </PropRow>
      )}
      {num('不透明度', 'opacity', layer.opacity, { min: 0, max: 100, suffix: '%' })}
      <div style={{ height: 12 }} />
    </>
  );
}

// ---------------- edit tab ----------------

function EditTab({ clipId, layers }: { clipId: string; layers: TextLayer[] }) {
  const s = useStudio();
  const selId = s.ui.selectedTextLayerId;
  const selected = layers.find((l) => l.id === selId) ?? null;

  const addLayer = (patch: Partial<TextLayer>) => {
    s.addTextLayer(clipId, patch);
    const st = useStudio.getState();
    const f = findClip(getActiveSequence(st), clipId);
    const ls = f?.clip.textLayers;
    if (ls && ls.length > 0) st.setUi({ selectedTextLayerId: ls[ls.length - 1].id });
  };

  const moveLayer = (from: number, to: number) => {
    if (to < 0 || to >= layers.length) return;
    const sid = s.ui.activeSequenceId;
    s.mutate('Reorder Layers', (draft) => {
      const seq = draft.sequences.find((q) => q.id === sid) ?? draft.sequences[0];
      const f = findClip(seq, clipId);
      const ls = f?.clip.textLayers;
      if (!ls) return;
      const [item] = ls.splice(from, 1);
      ls.splice(to, 0, item);
    });
  };

  const removeLayer = (layerId: string) => {
    s.removeTextLayer(clipId, layerId);
    if (selId === layerId) s.setUi({ selectedTextLayerId: null });
  };

  // Display topmost (last drawn) layer first, like Premiere.
  const displayed = layers.map((l, i) => ({ layer: l, idx: i })).reverse();

  return (
    <>
      <div className="wvs-tp-toolbar">
        {/* text は映像に描画される内容なので原文のまま。name はレイヤー一覧の表示名。 */}
        <button className="wvs-mini-btn" onClick={() => addLayer({ kind: 'text', text: 'New Text', name: '新規テキスト' })}>+テキスト</button>
        <button className="wvs-mini-btn" onClick={() => addLayer({ kind: 'rect', name: '長方形', text: undefined, width: 400, height: 200, fill: '#2d8ceb' })}>+長方形</button>
        <button className="wvs-mini-btn" onClick={() => addLayer({ kind: 'ellipse', name: '楕円形', text: undefined, width: 300, height: 300, fill: '#2d8ceb' })}>+楕円形</button>
      </div>
      <div className="wvs-tp-layers">
        {displayed.length === 0 && (
          <div className="wvs-ec-empty" style={{ padding: '12px' }}>レイヤーがありません。上のボタンから追加してください。</div>
        )}
        {displayed.map(({ layer, idx }) => (
          <div
            key={layer.id}
            className={`wvs-tp-layer ${layer.id === selId ? 'sel' : ''}`}
            onClick={() => s.setUi({ selectedTextLayerId: layer.id })}
          >
            <button
              className={`eye ${layer.visible ? '' : 'off'}`}
              title={layer.visible ? 'レイヤーを非表示' : 'レイヤーを表示'}
              onClick={(e) => { e.stopPropagation(); s.patchTextLayer(clipId, layer.id, { visible: !layer.visible }, 'Edit Text'); }}
            >
              <EyeIcon off={!layer.visible} />
            </button>
            <span className="kind" title={KIND_NAMES[layer.kind]}>{KIND_ICON[layer.kind]}</span>
            <EditableName
              name={layer.name}
              muted={!layer.visible}
              onCommit={(n) => s.patchTextLayer(clipId, layer.id, { name: n }, 'Edit Text')}
            />
            <span className="ops" onClick={(e) => e.stopPropagation()}>
              <button title="上へ移動" disabled={idx === layers.length - 1} onClick={() => moveLayer(idx, idx + 1)}>↑</button>
              <button title="下へ移動" disabled={idx === 0} onClick={() => moveLayer(idx, idx - 1)}>↓</button>
              <button title="レイヤーを削除" onClick={() => removeLayer(layer.id)}>×</button>
            </span>
          </div>
        ))}
      </div>
      {selected
        ? <LayerProperties clipId={clipId} layer={selected} />
        : <div className="wvs-ec-empty">プロパティを編集するレイヤーを選択してください。</div>}
    </>
  );
}

// ---------------- panel ----------------

export default function TextPanel() {
  const s = useStudio();
  const seq = getActiveSequence(s);
  const playhead = getPlayhead(s);

  const selId = s.ui.selection[0];
  const found = selId ? findClip(seq, selId) : null;
  const graphicClip = found && found.clip.textLayers ? found.clip : null;

  const [tab, setTab] = useState<'browse' | 'edit'>(graphicClip ? 'edit' : 'browse');

  const applyTemplate = (tpl: GfxTemplate) => {
    const st = useStudio.getState();
    const ph = getPlayhead(st);
    const sid = st.ui.activeSequenceId;
    st.addGraphicClip(ph, tpl.name);
    st.mutate('Apply Template', (draft) => {
      const dSeq = draft.sequences.find((q) => q.id === sid) ?? draft.sequences[0];
      const track = dSeq.videoTracks[dSeq.videoTracks.length - 1];
      if (!track) return;
      const t = snapToFrame(Math.max(0, ph), 30);
      const at = track.clips.filter((c) => t >= c.start - 1e-6 && t < c.end + 1e-6);
      const clip = at[at.length - 1];
      if (!clip || !clip.textLayers) return;
      clip.textLayers = tpl.build();
      clip.name = tpl.name;
    });
    // select the freshly built clip + its primary text layer, jump to Edit
    const st2 = useStudio.getState();
    const seq2 = getActiveSequence(st2);
    const track2 = seq2.videoTracks[seq2.videoTracks.length - 1];
    const t = snapToFrame(Math.max(0, ph), 30);
    const at2 = track2 ? track2.clips.filter((c) => t >= c.start - 1e-6 && t < c.end + 1e-6) : [];
    const clip2 = at2[at2.length - 1];
    if (clip2) {
      st2.setSelection([clip2.id]);
      const primary = clip2.textLayers?.find((l) => l.kind === 'text') ?? clip2.textLayers?.[0];
      st2.setUi({ selectedTextLayerId: primary?.id ?? null });
    }
    setTab('edit');
  };

  return (
    <div className="wvs-ec-scroll">
      <ControlsCss />
      <TextCss />
      <div className="wvs-tp-tabs">
        <span className={`wvs-tp-tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>参照</span>
        <span className={`wvs-tp-tab ${tab === 'edit' ? 'active' : ''}`} onClick={() => setTab('edit')}>編集</span>
      </div>

      {tab === 'browse' && (
        <>
          <div className="wvs-tp-cards">
            {TEMPLATES.map((tpl) => (
              <div key={tpl.name} className="wvs-tp-card" title={`${playhead.toFixed(2)}秒に「${tpl.name}」を追加`} onClick={() => applyTemplate(tpl)}>
                <div className="prev">{tpl.preview}</div>
                <div className="cap">{tpl.name}</div>
              </div>
            ))}
          </div>
          <div className="wvs-ec-empty" style={{ paddingTop: 0 }}>
            テンプレートをクリックすると、最上位のビデオトラックの再生ヘッド位置に追加されます。
          </div>
        </>
      )}

      {tab === 'edit' && (
        graphicClip
          ? (
            <>
              <div className="wvs-ec-head" style={{ position: 'static' }}>
                <span className="name">{graphicClip.name}</span>
                <span className="wvs-dim" style={{ marginLeft: 'auto', fontSize: 10 }}>
                  {graphicClip.textLayers!.length}レイヤー
                </span>
              </div>
              <EditTab clipId={graphicClip.id} layers={graphicClip.textLayers!} />
            </>
          )
          : <div className="wvs-ec-empty">レイヤーを編集するには、タイムラインでグラフィッククリップを選択してください。</div>
      )}
    </div>
  );
}
