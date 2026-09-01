// ============================================================
// Effect instance sections for the Effect Controls panel:
// header row (enable / reset / reorder / remove) + one row per
// parameter, typed by the effect definition.
// ============================================================

import type { EffectInstance, EffectParamDef } from '../../../model/types';
import { useStudio, type PropTarget } from '../../../state/store';
import { getEffectDef } from '../../../engine/effects';
import { evalNum, evalVec } from '../../../engine/keyframes';
import {
  NumberPropRow, VecPropRow, StaticRow, Section,
  hexToRgb, rgbToHex, type RowCtx,
} from './shared';

function EffectParamRow({ pd, inst, ctx }: { pd: EffectParamDef; inst: EffectInstance; ctx: RowCtx }) {
  const s = useStudio();
  const p = inst.params[pd.key];
  if (!p) return null;
  const target: PropTarget = { kind: 'effect', instanceId: inst.id, key: pd.key };

  switch (pd.type) {
    case 'number':
    case 'angle':
      return (
        <NumberPropRow
          label={pd.name}
          clipId={ctx.clipId}
          target={target}
          p={p}
          ctx={ctx}
          min={pd.min}
          max={pd.max}
          step={pd.step ?? 1}
          suffix={pd.type === 'angle' ? '°' : pd.unit ? ` ${pd.unit}` : ''}
          indent={1}
        />
      );
    case 'point':
      return (
        <VecPropRow
          label={pd.name}
          clipId={ctx.clipId}
          target={target}
          p={p}
          ctx={ctx}
          min={pd.min}
          max={pd.max}
          step={pd.step ?? 1}
          indent={1}
        />
      );
    case 'color':
      return (
        <StaticRow label={pd.name} indent={1} ctx={ctx}>
          <input
            type="color"
            className="wvs-color-input"
            value={rgbToHex(evalVec(p, ctx.localTime))}
            onChange={(e) => s.setPropValue(ctx.clipId, target, hexToRgb(e.target.value), ctx.localTime)}
          />
        </StaticRow>
      );
    case 'select':
      return (
        <StaticRow label={pd.name} indent={1} ctx={ctx}>
          <select
            value={Math.round(evalNum(p, ctx.localTime))}
            onChange={(e) => s.setPropValue(ctx.clipId, target, parseInt(e.target.value, 10), ctx.localTime)}
          >
            {(pd.options ?? []).map((o, i) => <option key={i} value={i}>{o}</option>)}
          </select>
        </StaticRow>
      );
    case 'checkbox':
      return (
        <StaticRow label={pd.name} indent={1} ctx={ctx}>
          <input
            type="checkbox"
            checked={evalNum(p, ctx.localTime) > 0.5}
            onChange={(e) => s.setPropValue(ctx.clipId, target, e.target.checked ? 1 : 0, ctx.localTime)}
          />
        </StaticRow>
      );
    default:
      return null;
  }
}

export function EffectInstanceSection({ inst, idx, count, ctx }: {
  inst: EffectInstance;
  idx: number;
  count: number;
  ctx: RowCtx;
}) {
  const s = useStudio();
  const def = getEffectDef(inst.effectId);

  const reset = () => {
    if (!def) return;
    s.beginTransaction(`Reset ${def.name}`);
    for (const pd of def.params) {
      s.setPropValue(
        ctx.clipId,
        { kind: 'effect', instanceId: inst.id, key: pd.key },
        structuredClone(pd.default),
        ctx.localTime,
      );
    }
    s.endTransaction();
  };

  const header = (
    <>
      <button
        className={inst.enabled ? 'fx-on' : ''}
        title={inst.enabled ? 'エフェクトを無効にする' : 'エフェクトを有効にする'}
        onClick={() => s.toggleEffect(ctx.clipId, inst.id)}
        style={{ fontStyle: 'italic', fontWeight: 700 }}
      >fx</button>
      <button title="パラメーターをリセット" onClick={reset}>↺</button>
      <button title="上へ移動" disabled={idx === 0} onClick={() => s.moveEffect(ctx.clipId, idx, idx - 1)}>↑</button>
      <button title="下へ移動" disabled={idx === count - 1} onClick={() => s.moveEffect(ctx.clipId, idx, idx + 1)}>↓</button>
      <button title="エフェクトを削除" onClick={() => s.removeEffect(ctx.clipId, inst.id)}>×</button>
    </>
  );

  return (
    <Section title={def?.name ?? inst.effectId} right={header} dimTitle={!inst.enabled}>
      {def?.params.map((pd) => <EffectParamRow key={pd.key} pd={pd} inst={inst} ctx={ctx} />)}
      {def && def.params.length === 0 && (
        <StaticRow label={<span className="wvs-dim">パラメーターはありません</span>} indent={1} ctx={ctx} />
      )}
    </Section>
  );
}
