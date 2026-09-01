// ============================================================
// Lumetri Color panel — slider UI over the 'lumetri' effect
// instance of the first selected clip (Basic Correction /
// Creative), plus a Vignette section driving a separate
// 'vignette' effect instance (auto-added on first adjustment).
// ============================================================

import type { ReactNode } from 'react';
import { findClip } from '../../model/types';
import { useStudio, getActiveSequence, getPlayhead, type PropTarget } from '../../state/store';
import { getEffectDef, createEffectInstance } from '../../engine/effects';
import { evalNum } from '../../engine/keyframes';
import { DragValue } from '../components/DragValue';
import { ControlsCss, Section } from './controls/shared';

function LumetriCss() {
  return (
    <style>{`
      .wvs-lum-row { display: flex; align-items: center; gap: 8px; padding: 2px 10px 2px 12px; min-height: 22px; font-size: 11px; }
      .wvs-lum-row:hover { background: rgba(255,255,255,0.025); }
      .wvs-lum-label { flex: 0 0 96px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: default; }
      .wvs-lum-row input[type=range] { flex: 1; min-width: 40px; height: 14px; accent-color: var(--accent); background: transparent; cursor: ew-resize; }
      .wvs-lum-sub { padding: 4px 10px 1px 12px; font-size: 10px; font-weight: 600; letter-spacing: 0.4px; color: var(--text-dim); text-transform: uppercase; }
      .wvs-lum-select-row { display: flex; align-items: center; gap: 8px; padding: 3px 10px 3px 12px; font-size: 11px; }
      .wvs-lum-select-row select { flex: 1; }
    `}</style>
  );
}

function SliderRow({ label, value, min, max, step = 1, onChange, onReset, begin, end }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  onReset: () => void;
  begin: () => void;
  end: () => void;
}) {
  const precision = step >= 1 ? 0 : 2;
  return (
    <div className="wvs-lum-row">
      <span className="wvs-lum-label" title="ダブルクリックでリセット" onDoubleClick={onReset}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onPointerDown={begin}
        onPointerUp={end}
        onPointerCancel={end}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
      <DragValue
        value={value}
        min={min}
        max={max}
        step={step}
        precision={precision}
        width={44}
        onChange={onChange}
        onDragStart={begin}
        onDragEnd={end}
      />
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="wvs-ec-scroll">
      <ControlsCss />
      <div className="wvs-ec-empty">{children}</div>
    </div>
  );
}

export default function LumetriPanel() {
  const s = useStudio();
  const seq = getActiveSequence(s);
  const playhead = getPlayhead(s);

  const selId = s.ui.selection[0];
  const found = selId ? findClip(seq, selId) : null;

  if (!found) return <Empty>クリップが選択されていません</Empty>;
  const { clip, track } = found;
  if (track.type !== 'video') return <Empty>カラー調整するビデオクリップを選択してください</Empty>;

  const clipDur = Math.max(0, clip.end - clip.start);
  const localTime = Math.min(Math.max(playhead - clip.start, 0), clipDur);
  const inst = clip.effects.find((e) => e.effectId === 'lumetri');

  if (!inst) {
    return (
      <div className="wvs-ec-scroll">
        <ControlsCss />
        <div className="wvs-ec-empty">
          <div style={{ marginBottom: 10 }}>{clip.name} にはLumetriカラーが適用されていません。</div>
          <button className="btn primary" onClick={() => s.addEffectToClips([clip.id], 'lumetri')}>
            Lumetriカラーを追加
          </button>
        </div>
      </div>
    );
  }

  const lumDef = getEffectDef('lumetri')!;
  const vigDef = getEffectDef('vignette')!;
  const defOf = (key: string): number => {
    const d = lumDef.params.find((p) => p.key === key)?.default;
    return typeof d === 'number' ? d : 0;
  };

  const begin = () => s.beginTransaction('Lumetri Color');
  const end = () => s.endTransaction();

  const val = (key: string): number => {
    const p = inst.params[key];
    return p ? evalNum(p, localTime) : defOf(key);
  };
  const setVal = (key: string) => (v: number) => {
    const target: PropTarget = { kind: 'effect', instanceId: inst.id, key };
    s.setPropValue(clip.id, target, v, localTime);
  };
  const resetVal = (key: string) => () => setVal(key)(defOf(key));

  // -- vignette: separate effect instance, auto-added on first adjustment --
  const vig = clip.effects.find((e) => e.effectId === 'vignette');
  const vigDefOf = (key: string): number => {
    const d = vigDef.params.find((p) => p.key === key)?.default;
    return typeof d === 'number' ? d : 0;
  };
  const vigVal = (key: string): number => {
    const p = vig?.params[key];
    return p ? evalNum(p, localTime) : vigDefOf(key);
  };
  const setVig = (key: string) => (v: number) => {
    const st = useStudio.getState();
    const f = findClip(getActiveSequence(st), clip.id);
    const vi = f?.clip.effects.find((e) => e.effectId === 'vignette');
    if (vi) {
      st.setPropValue(clip.id, { kind: 'effect', instanceId: vi.id, key }, v, localTime);
    } else {
      st.mutate('Vignette', (draft) => {
        const dSeq = draft.sequences.find((sq) => sq.id === st.ui.activeSequenceId) ?? draft.sequences[0];
        const df = findClip(dSeq, clip.id);
        if (!df) return;
        const ni = createEffectInstance('vignette');
        if (ni.params[key]) ni.params[key].value = v;
        df.clip.effects.push(ni);
      });
    }
  };
  const resetVig = (key: string) => () => { if (vig) setVig(key)(vigDefOf(key)); };

  const sr = (label: string, key: string, min: number, max: number, step = 1) => (
    <SliderRow
      label={label}
      value={val(key)}
      min={min}
      max={max}
      step={step}
      onChange={setVal(key)}
      onReset={resetVal(key)}
      begin={begin}
      end={end}
    />
  );

  const lookOptions = lumDef.params.find((p) => p.key === 'look')?.options ?? [];

  return (
    <div className="wvs-ec-scroll">
      <ControlsCss />
      <LumetriCss />
      <div className="wvs-ec-head">
        <span className="name">Lumetriカラー · {clip.name}</span>
      </div>

      <Section title="基本補正">
        <div className="wvs-lum-sub">ホワイトバランス</div>
        {sr('色温度', 'temperature', -100, 100)}
        {sr('色かぶり補正', 'tint', -100, 100)}
        <div className="wvs-lum-sub">階調</div>
        {sr('露光量', 'exposure', -3, 3, 0.05)}
        {sr('コントラスト', 'contrast', -100, 100)}
        {sr('ハイライト', 'highlights', -100, 100)}
        {sr('シャドウ', 'shadows', -100, 100)}
        {sr('白レベル', 'whites', -100, 100)}
        {sr('黒レベル', 'blacks', -100, 100)}
        <div style={{ height: 4 }} />
        {sr('彩度', 'saturation', 0, 200)}
      </Section>

      <Section title="クリエイティブ">
        <div className="wvs-lum-select-row">
          <span className="wvs-lum-label" onDoubleClick={resetVal('look')}>ルック</span>
          <select
            value={Math.round(val('look'))}
            onChange={(e) => setVal('look')(parseInt(e.target.value, 10))}
          >
            {lookOptions.map((o, i) => <option key={i} value={i}>{o}</option>)}
          </select>
        </div>
        {sr('自然な彩度', 'vibrance', -100, 100)}
      </Section>

      <Section title="ビネット">
        <SliderRow label="適用量" value={vigVal('amount')} min={-100} max={100}
          onChange={setVig('amount')} onReset={resetVig('amount')} begin={begin} end={end} />
        <SliderRow label="中間点" value={vigVal('midpoint')} min={0} max={100}
          onChange={setVig('midpoint')} onReset={resetVig('midpoint')} begin={begin} end={end} />
        <SliderRow label="ぼかし" value={vigVal('feather')} min={0} max={100}
          onChange={setVig('feather')} onReset={resetVig('feather')} begin={begin} end={end} />
      </Section>
      <div style={{ height: 12 }} />
    </div>
  );
}
