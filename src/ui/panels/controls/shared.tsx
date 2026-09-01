// ============================================================
// Shared building blocks for Effect Controls / Lumetri / Text
// panels: collapsible sections, Premiere-style property rows
// with stopwatch + keyframe navigation, and the right-hand
// mini keyframe timeline strip.
// ============================================================

import { useRef, useState } from 'react';
import type { ReactNode, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Interp, Prop } from '../../../model/types';
import type { CtxItem } from '../../components/ContextMenu';
import { DragValue } from '../../components/DragValue';
import { useStudio, type PropTarget } from '../../../state/store';
import { evalNum, evalVec } from '../../../engine/keyframes';
import { snapToFrame } from '../../../engine/timecode';

export type OpenMenu = (e: ReactMouseEvent, items: CtxItem[]) => void;

/** Common per-clip row context passed down to every property row. */
export interface RowCtx {
  clipId: string;
  clipStart: number;
  clipDur: number;
  localTime: number;
  openMenu: OpenMenu;
}

const HALF_FRAME = 1 / 60;

// ---------------- color helpers ----------------

export const rgbToHex = (v: number[]): string =>
  '#' + [0, 1, 2].map((i) => Math.round(Math.max(0, Math.min(255, v[i] ?? 0))).toString(16).padStart(2, '0')).join('');

export const hexToRgb = (hex: string): number[] => {
  const m = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) || 0);
};

/** Best-effort conversion of a CSS color string to #rrggbb for <input type=color>. */
export function cssColorToHex(c: string): string {
  if (!c) return '#ffffff';
  if (c.startsWith('#')) {
    if (c.length === 4) return '#' + [...c.slice(1, 4)].map((ch) => ch + ch).join('');
    return c.slice(0, 7);
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map((s) => parseFloat(s));
    return rgbToHex(parts);
  }
  return '#ffffff';
}

// ---------------- scoped styles ----------------

export function ControlsCss() {
  return (
    <style>{`
      .wvs-ec-scroll { position: absolute; inset: 0; overflow-y: auto; overflow-x: hidden; }
      .wvs-ec-head { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-bottom: 1px solid var(--border); background: var(--bg-panel-header); position: sticky; top: 0; z-index: 3; }
      .wvs-ec-head .name { font-size: 11px; color: var(--text-bright); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .wvs-ec-row { display: flex; align-items: stretch; min-height: 21px; font-size: 11px; }
      .wvs-ec-row:hover { background: rgba(255,255,255,0.025); }
      /* Japanese labels are longer than the English ones: let a wide control (blend
         select, mask buttons) wrap under the label instead of eliding the label. */
      .wvs-ec-left { flex: 1 1 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 4px; min-width: 0; padding-right: 6px; }
      .wvs-ec-label { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1 1 auto; min-width: 5.5em; }
      .wvs-ec-left select { max-width: 100%; }
      .wvs-ec-vals { margin-left: auto; display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 4px 6px; padding: 2px 0; white-space: nowrap; }
      .wvs-ec-nav { display: flex; align-items: center; width: 52px; flex: none; justify-content: flex-end; }
      .wvs-ec-nav button { width: 16px; height: 16px; padding: 0; font-size: 8px; color: var(--text-dim); display: inline-flex; align-items: center; justify-content: center; }
      .wvs-ec-nav button:hover:not(:disabled) { color: var(--accent-bright); }
      .wvs-ec-nav button:disabled { color: var(--text-disabled); cursor: default; }
      .wvs-ec-nav button.kf-on { color: var(--accent-bright); }
      .wvs-ec-strip { flex: 0 0 clamp(96px, 28%, 260px); position: relative; border-left: 1px solid var(--border); background: var(--bg-inset); overflow: hidden; }
      .wvs-ec-ph { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--playhead); opacity: 0.9; pointer-events: none; }
      .wvs-kfd { position: absolute; top: 50%; width: 9px; height: 9px; margin: -4.5px 0 0 -4.5px; cursor: ew-resize; z-index: 2; }
      .wvs-kfd svg { display: block; }
      .wvs-kfd:hover svg path { fill: var(--accent-bright); }
      .wvs-sw { width: 16px; height: 16px; padding: 0; flex: none; color: var(--text-dim); display: inline-flex; align-items: center; justify-content: center; }
      .wvs-sw.on { color: var(--accent-bright); }
      .wvs-sw:disabled { color: var(--text-disabled); cursor: default; }
      .wvs-sw-sp { width: 16px; flex: none; }
      .wvs-ec-sechead { display: flex; align-items: center; gap: 4px; min-height: 22px; font-size: 11px; font-weight: 600; color: var(--text-bright); background: var(--bg-panel-header); border-top: 1px solid var(--border); padding: 0 4px 0 2px; cursor: default; }
      .wvs-ec-sechead .tri { width: 12px; flex: none; font-size: 8px; color: var(--text-dim); display: inline-flex; justify-content: center; transition: transform 0.08s; }
      .wvs-ec-sechead .tri.open { transform: rotate(90deg); }
      .wvs-ec-sechead .sec-right { margin-left: auto; display: flex; align-items: center; gap: 2px; }
      .wvs-ec-sechead .sec-right button { font-size: 10px; padding: 1px 3px; color: var(--text-dim); border-radius: 2px; }
      .wvs-ec-sechead .sec-right button:hover:not(:disabled) { color: var(--text-bright); background: var(--bg-hover); }
      .wvs-ec-sechead .sec-right button:disabled { color: var(--text-disabled); cursor: default; }
      .wvs-ec-sechead .sec-right button.fx-on { color: var(--accent-bright); }
      .wvs-mini-btn { background: var(--bg-hover); border: 1px solid var(--border-light); border-radius: 3px; padding: 1px 7px; font-size: 10px; cursor: pointer; white-space: nowrap; }
      .wvs-mini-btn:hover { background: #464646; }
      .wvs-val-disabled { color: var(--text-disabled); font-size: 11px; }
      .wvs-dim { color: var(--text-dim); }
      .wvs-link { color: var(--accent-bright); cursor: pointer; }
      .wvs-link:hover { text-decoration: underline; }
      .wvs-ec-empty { padding: 24px 12px; text-align: center; color: var(--text-dim); font-size: 11px; }
      .wvs-ec-check { display: inline-flex; align-items: center; gap: 5px; cursor: pointer; color: var(--text); }
      .wvs-color-input { width: 32px; height: 15px; padding: 0; border: 1px solid var(--border-light); border-radius: 2px; background: none; cursor: pointer; }
    `}</style>
  );
}

// ---------------- icons ----------------

export function IconStopwatch() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
      <circle cx="6" cy="7.2" r="3.9" />
      <line x1="6" y1="7.2" x2="6" y2="4.6" />
      <line x1="4.2" y1="0.9" x2="7.8" y2="0.9" />
      <line x1="6" y1="0.9" x2="6" y2="3" />
    </svg>
  );
}

function DiamondSvg({ filled, color }: { filled: boolean; color: string }) {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10">
      <path d="M5 0.6 L9.4 5 L5 9.4 L0.6 5 Z" fill={filled ? color : 'none'} stroke={color} strokeWidth="1.1" />
    </svg>
  );
}

// ---------------- sections ----------------

export function Section({ title, children, defaultOpen = true, right, dimTitle }: {
  title: string;
  children?: ReactNode;
  defaultOpen?: boolean;
  right?: ReactNode;
  dimTitle?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div className="wvs-ec-sechead" onClick={() => setOpen(!open)}>
        <span className={`tri ${open ? 'open' : ''}`}>▶</span>
        <span style={dimTitle ? { color: 'var(--text-dim)' } : undefined}>{title}</span>
        {right && <span className="sec-right" onClick={(e) => e.stopPropagation()}>{right}</span>}
      </div>
      {open && children}
    </div>
  );
}

// ---------------- generic row shell ----------------

export function RowShell({ indent = 0, stopwatch, label, controls, nav, strip }: {
  indent?: number;
  stopwatch?: ReactNode;
  label: ReactNode;
  controls?: ReactNode;
  nav?: ReactNode;
  strip?: ReactNode;
}) {
  return (
    <div className="wvs-ec-row">
      <div className="wvs-ec-left" style={{ paddingLeft: 6 + indent * 14 }}>
        {stopwatch ?? <span className="wvs-sw-sp" />}
        <span className="wvs-ec-label">{label}</span>
        <span className="wvs-ec-vals">{controls}</span>
        <span className="wvs-ec-nav">{nav}</span>
      </div>
      <div className="wvs-ec-strip">{strip}</div>
    </div>
  );
}

// ---------------- keyframe nav (◀ ◆ ▶) ----------------

function KfNav({ clipId, target, p, ctx }: { clipId: string; target: PropTarget; p: Prop; ctx: RowCtx }) {
  const s = useStudio();
  const { localTime, clipStart } = ctx;
  const onKf = p.keyframes.find((k) => Math.abs(k.time - localTime) < HALF_FRAME);
  const prevKf = p.keyframes.filter((k) => k.time < localTime - HALF_FRAME).sort((a, b) => b.time - a.time)[0];
  const nextKf = p.keyframes.filter((k) => k.time > localTime + HALF_FRAME).sort((a, b) => a.time - b.time)[0];
  return (
    <>
      <button title="前のキーフレームへ移動" disabled={!prevKf}
        onClick={() => prevKf && s.setPlayhead(clipStart + prevKf.time)}>◀</button>
      <button
        title={onKf ? 'キーフレームを削除' : 'キーフレームを追加'}
        className={onKf ? 'kf-on' : ''}
        onClick={() => onKf
          ? s.removeKeyframe(clipId, target, onKf.id)
          : s.addKeyframe(clipId, target, localTime)}
      >
        <DiamondSvg filled={!!onKf} color="currentColor" />
      </button>
      <button title="次のキーフレームへ移動" disabled={!nextKf}
        onClick={() => nextKf && s.setPlayhead(clipStart + nextKf.time)}>▶</button>
    </>
  );
}

// ---------------- mini keyframe timeline strip ----------------

const INTERP_ITEMS: { label: string; value: Interp }[] = [
  { label: 'リニア', value: 'linear' },
  { label: 'ベジェ', value: 'bezier' },
  { label: 'イーズイン', value: 'easeIn' },
  { label: 'イーズアウト', value: 'easeOut' },
  { label: 'イーズインアウト', value: 'easeInOut' },
  { label: '停止', value: 'hold' },
];

/** 補間法の表示名(キーフレームのツールチップ用)。 */
const interpLabel = (i: Interp): string =>
  INTERP_ITEMS.find((it) => it.value === i)?.label ?? i;

export function KfStrip({ clipId, target, p, ctx }: {
  clipId: string;
  target?: PropTarget;
  p?: Prop;
  ctx: RowCtx;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const { clipDur, localTime, openMenu } = ctx;
  const frac = clipDur > 0 ? Math.min(1, Math.max(0, localTime / clipDur)) : 0;

  const dragDiamond = (e: ReactPointerEvent, kfId: string, startTime: number) => {
    if (e.button !== 0 || !target) return;
    e.preventDefault();
    e.stopPropagation();
    const width = Math.max(1, stripRef.current?.clientWidth ?? 100);
    const startX = e.clientX;
    let started = false;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!started && Math.abs(dx) < 2) return;
      if (!started) {
        started = true;
        useStudio.getState().beginTransaction('Move Keyframe');
      }
      const nt = Math.max(0, Math.min(clipDur, snapToFrame(startTime + (dx / width) * clipDur, 30)));
      useStudio.getState().moveKeyframe(clipId, target, kfId, nt);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (started) useStudio.getState().endTransaction();
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const diamondMenu = (e: ReactMouseEvent, kfId: string, interp: Interp) => {
    if (!target) return;
    openMenu(e, [
      {
        label: '補間法',
        children: INTERP_ITEMS.map((it) => ({
          label: it.label,
          checked: interp === it.value,
          onClick: () => useStudio.getState().setKeyframeInterp(clipId, target, kfId, it.value),
        })),
      },
      { separator: true },
      { label: '削除', onClick: () => useStudio.getState().removeKeyframe(clipId, target, kfId) },
    ]);
  };

  return (
    <div ref={stripRef} style={{ position: 'absolute', inset: 0 }}>
      <div className="wvs-ec-ph" style={{ left: `${(frac * 100).toFixed(3)}%` }} />
      {p?.animated && target && p.keyframes.map((k) => (
        <div
          key={k.id}
          className="wvs-kfd"
          style={{ left: `${clipDur > 0 ? Math.min(100, Math.max(0, (k.time / clipDur) * 100)) : 0}%` }}
          title={`${k.time.toFixed(2)}秒(${interpLabel(k.interpolation)})`}
          onPointerDown={(e) => dragDiamond(e, k.id, k.time)}
          onContextMenu={(e) => diamondMenu(e, k.id, k.interpolation)}
        >
          <DiamondSvg filled color={k.interpolation === 'hold' ? 'var(--warning)' : '#bfc8d4'} />
        </div>
      ))}
    </div>
  );
}

// ---------------- stopwatch button ----------------

function Stopwatch({ animated, disabled, onClick }: { animated: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className={`wvs-sw ${animated ? 'on' : ''}`}
      disabled={disabled}
      title="アニメーションのオン/オフ"
      onClick={onClick}
    >
      <IconStopwatch />
    </button>
  );
}

// ---------------- animatable rows ----------------

const stepPrecision = (step: number): number => (step >= 1 ? 1 : step >= 0.05 ? 2 : 3);

export function NumberPropRow({ label, clipId, target, p, ctx, min, max, step = 1, precision, suffix = '', indent = 0, disabled, undoLabel }: {
  label: string;
  clipId: string;
  target: PropTarget;
  p: Prop;
  ctx: RowCtx;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  suffix?: string;
  indent?: number;
  disabled?: boolean;
  undoLabel?: string;
}) {
  const s = useStudio();
  const value = evalNum(p, ctx.localTime);
  const prec = precision ?? stepPrecision(step);
  return (
    <RowShell
      indent={indent}
      stopwatch={<Stopwatch animated={p.animated} disabled={disabled}
        onClick={() => s.toggleAnimated(clipId, target, ctx.localTime)} />}
      label={label}
      controls={disabled
        ? <span className="wvs-val-disabled">{value.toFixed(prec)}{suffix}</span>
        : (
          <DragValue
            value={value}
            min={min}
            max={max}
            step={step}
            precision={prec}
            suffix={suffix}
            onChange={(v) => s.setPropValue(clipId, target, v, ctx.localTime)}
            onDragStart={() => s.beginTransaction(undoLabel ?? 'Set Property')}
            onDragEnd={() => s.endTransaction()}
          />
        )}
      nav={p.animated && !disabled ? <KfNav clipId={clipId} target={target} p={p} ctx={ctx} /> : null}
      strip={<KfStrip clipId={clipId} target={target} p={p} ctx={ctx} />}
    />
  );
}

export function VecPropRow({ label, clipId, target, p, ctx, min, max, step = 1, precision, indent = 0, undoLabel }: {
  label: string;
  clipId: string;
  target: PropTarget;
  p: Prop;
  ctx: RowCtx;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  indent?: number;
  undoLabel?: string;
}) {
  const s = useStudio();
  const vec = evalVec(p, ctx.localTime);
  const prec = precision ?? stepPrecision(step);
  const setComp = (i: 0 | 1) => (v: number) => {
    const cur = [...vec];
    cur[i] = v;
    s.setPropValue(clipId, target, cur, ctx.localTime);
  };
  const dragProps = {
    min, max, step,
    precision: prec,
    onDragStart: () => s.beginTransaction(undoLabel ?? 'Set Property'),
    onDragEnd: () => s.endTransaction(),
  };
  return (
    <RowShell
      indent={indent}
      stopwatch={<Stopwatch animated={p.animated}
        onClick={() => s.toggleAnimated(clipId, target, ctx.localTime)} />}
      label={label}
      controls={
        <>
          <DragValue value={vec[0] ?? 0} onChange={setComp(0)} {...dragProps} />
          <DragValue value={vec[1] ?? 0} onChange={setComp(1)} {...dragProps} />
        </>
      }
      nav={p.animated ? <KfNav clipId={clipId} target={target} p={p} ctx={ctx} /> : null}
      strip={<KfStrip clipId={clipId} target={target} p={p} ctx={ctx} />}
    />
  );
}

/** Non-animatable row (select / checkbox / color / labels). Strip shows only the playhead. */
export function StaticRow({ label, indent = 0, ctx, children }: {
  label: ReactNode;
  indent?: number;
  ctx: RowCtx;
  children?: ReactNode;
}) {
  return (
    <RowShell
      indent={indent}
      label={label}
      controls={children}
      strip={<KfStrip clipId={ctx.clipId} ctx={ctx} />}
    />
  );
}
