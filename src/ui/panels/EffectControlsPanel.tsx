// ============================================================
// Effect Controls panel — intrinsic Motion / Opacity / Time
// Remapping (video) or Volume / Panner (audio) plus the applied
// effect stack for the first selected clip, with per-property
// keyframing and a right-hand mini keyframe timeline.
// ============================================================

import type { BlendMode, MaskShape } from '../../model/types';
import { findClip, clipSourceOut } from '../../model/types';
import { useStudio, getActiveSequence, getPlayhead } from '../../state/store';
import { toTimecode } from '../../engine/timecode';
import { useContextMenu } from '../components/ContextMenu';
import {
  ControlsCss, Section, NumberPropRow, VecPropRow, StaticRow, type RowCtx,
} from './controls/shared';
import { EffectInstanceSection } from './controls/EffectRows';

const BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'soft-light', 'hard-light',
  'lighten', 'darken', 'color-dodge', 'color-burn', 'difference', 'exclusion',
  'hue', 'color', 'luminosity',
];

/** 描画モードの表示名(用語集準拠)。キーは CSS の合成モード値なので変更しない。 */
const BLEND_LABELS: Record<BlendMode, string> = {
  'normal': '通常',
  'multiply': '乗算',
  'screen': 'スクリーン',
  'overlay': 'オーバーレイ',
  'soft-light': 'ソフトライト',
  'hard-light': 'ハードライト',
  'lighten': '比較(明)',
  'darken': '比較(暗)',
  'color-dodge': '覆い焼きカラー',
  'color-burn': '焼き込みカラー',
  'difference': '差の絶対値',
  'exclusion': '除外',
  'hue': '色相',
  'color': 'カラー',
  'luminosity': '輝度',
};

function MaskRows({ mask, idx, ctx }: { mask: MaskShape; idx: number; ctx: RowCtx }) {
  const s = useStudio();
  const kindName = mask.type === 'ellipse' ? '楕円形' : '長方形';
  const norm = { min: 0, max: 1, step: 0.005, precision: 3 };
  return (
    <>
      <StaticRow
        label={<span style={{ color: 'var(--text-bright)' }}>マスク({kindName}) {idx + 1}</span>}
        indent={1}
        ctx={ctx}
      >
        <label className="wvs-ec-check">
          <input
            type="checkbox"
            checked={mask.inverted}
            onChange={(e) => s.patchMask(ctx.clipId, mask.id, { inverted: e.target.checked })}
          />
          反転
        </label>
        <button title="マスクを削除" onClick={() => s.removeMask(ctx.clipId, mask.id)}>×</button>
      </StaticRow>
      <StaticRow label="マスクパス" indent={2} ctx={ctx}>
        <span className="wvs-dim">{kindName}シェイプ</span>
      </StaticRow>
      <NumberPropRow label="マスクの中心X" clipId={ctx.clipId} ctx={ctx} p={mask.cx}
        target={{ kind: 'mask', maskId: mask.id, key: 'cx' }} indent={2} {...norm} />
      <NumberPropRow label="マスクの中心Y" clipId={ctx.clipId} ctx={ctx} p={mask.cy}
        target={{ kind: 'mask', maskId: mask.id, key: 'cy' }} indent={2} {...norm} />
      <NumberPropRow label="マスクの半径X" clipId={ctx.clipId} ctx={ctx} p={mask.rx}
        target={{ kind: 'mask', maskId: mask.id, key: 'rx' }} indent={2} {...norm} />
      <NumberPropRow label="マスクの半径Y" clipId={ctx.clipId} ctx={ctx} p={mask.ry}
        target={{ kind: 'mask', maskId: mask.id, key: 'ry' }} indent={2} {...norm} />
      <NumberPropRow label="マスクの境界のぼかし" clipId={ctx.clipId} ctx={ctx} p={mask.feather}
        target={{ kind: 'mask', maskId: mask.id, key: 'feather' }} indent={2}
        min={0} max={500} step={1} suffix=" px" />
      <NumberPropRow label="マスクの不透明度" clipId={ctx.clipId} ctx={ctx} p={mask.opacity}
        target={{ kind: 'mask', maskId: mask.id, key: 'opacity' }} indent={2}
        min={0} max={100} step={1} suffix="%" />
    </>
  );
}

export default function EffectControlsPanel() {
  const s = useStudio();
  const seq = getActiveSequence(s);
  const playhead = getPlayhead(s);
  const { openMenu, menuEl } = useContextMenu();

  const selId = s.ui.selection[0];
  const found = selId ? findClip(seq, selId) : null;

  if (!found) {
    return (
      <div className="wvs-ec-scroll">
        <ControlsCss />
        <div className="wvs-ec-empty">クリップが選択されていません</div>
      </div>
    );
  }

  const { clip, track } = found;
  const clipDur = Math.max(0, clip.end - clip.start);
  const localTime = Math.min(Math.max(playhead - clip.start, 0), clipDur);
  const isVideo = track.type === 'video';
  const ctx: RowCtx = { clipId: clip.id, clipStart: clip.start, clipDur, localTime, openMenu };

  return (
    <div className="wvs-ec-scroll">
      <ControlsCss />
      <div className="wvs-ec-head">
        <span className="name">{seq.name} · {clip.name}</span>
        <span className="timecode dim" style={{ marginLeft: 'auto', fontSize: 10 }}>
          {toTimecode(clip.inPoint, 30)} – {toTimecode(clipSourceOut(clip), 30)}
        </span>
      </div>

      {isVideo && (
        <>
          <Section title="モーション">
            <VecPropRow label="位置" clipId={clip.id} ctx={ctx} p={clip.position}
              target={{ kind: 'intrinsic', key: 'position' }} step={1} precision={1} />
            <NumberPropRow label="スケール" clipId={clip.id} ctx={ctx} p={clip.scale}
              target={{ kind: 'intrinsic', key: 'scale' }} min={0} max={1000} step={1} />
            <NumberPropRow label="スケール(幅)" clipId={clip.id} ctx={ctx} p={clip.scaleWidth}
              target={{ kind: 'intrinsic', key: 'scaleWidth' }} min={0} max={1000} step={1}
              disabled={clip.uniformScale} />
            <StaticRow label="" ctx={ctx}>
              <label className="wvs-ec-check">
                <input
                  type="checkbox"
                  checked={clip.uniformScale}
                  onChange={(e) => s.patchClip(clip.id, { uniformScale: e.target.checked }, 'Uniform Scale')}
                />
                縦横比を固定
              </label>
            </StaticRow>
            <NumberPropRow label="回転" clipId={clip.id} ctx={ctx} p={clip.rotation}
              target={{ kind: 'intrinsic', key: 'rotation' }} step={1} suffix="°" />
            <VecPropRow label="アンカーポイント" clipId={clip.id} ctx={ctx} p={clip.anchor}
              target={{ kind: 'intrinsic', key: 'anchor' }} step={1} precision={1} />
            <StaticRow label="ちらつき防止フィルター" ctx={ctx}>
              <span className="wvs-val-disabled" title="未対応">0.00</span>
            </StaticRow>
          </Section>

          <Section title="不透明度">
            <NumberPropRow label="不透明度" clipId={clip.id} ctx={ctx} p={clip.opacity}
              target={{ kind: 'intrinsic', key: 'opacity' }} min={0} max={100} step={1} suffix="%" />
            <StaticRow label="描画モード" ctx={ctx}>
              <select
                value={clip.blendMode}
                onChange={(e) => s.patchClip(clip.id, { blendMode: e.target.value as BlendMode }, 'Blend Mode')}
              >
                {BLEND_MODES.map((m) => <option key={m} value={m}>{BLEND_LABELS[m]}</option>)}
              </select>
            </StaticRow>
            <StaticRow label="マスク" ctx={ctx}>
              <button className="wvs-mini-btn" onClick={() => s.addMask(clip.id, 'ellipse')}>楕円形マスクを追加</button>
              <button className="wvs-mini-btn" onClick={() => s.addMask(clip.id, 'rectangle')}>長方形マスクを追加</button>
            </StaticRow>
            {clip.masks.map((m, i) => <MaskRows key={m.id} mask={m} idx={i} ctx={ctx} />)}
          </Section>

          <Section title="時間補間">
            <StaticRow label="速度" ctx={ctx}>
              <span className="wvs-dim">{Math.round(clip.speed * 100)}%</span>
              <span
                className="wvs-link"
                onClick={() => s.setUi({ openDialog: 'speed-duration', dialogPayload: clip.id })}
              >
                速度・デュレーション…
              </span>
            </StaticRow>
          </Section>
        </>
      )}

      {!isVideo && (
        <Section title="オーディオ">
          <Section title="ボリューム">
            <NumberPropRow label="レベル" clipId={clip.id} ctx={ctx} p={clip.volume}
              target={{ kind: 'intrinsic', key: 'volume' }} min={-60} max={6} step={0.1} precision={1}
              suffix=" dB" indent={1} />
          </Section>
          <Section title="パンナー">
            <NumberPropRow label="パン" clipId={clip.id} ctx={ctx} p={clip.pan}
              target={{ kind: 'intrinsic', key: 'pan' }} min={-100} max={100} step={1} indent={1} />
          </Section>
        </Section>
      )}

      {clip.effects.map((inst, i) => (
        <EffectInstanceSection key={inst.id} inst={inst} idx={i} count={clip.effects.length} ctx={ctx} />
      ))}

      {menuEl}
    </div>
  );
}
