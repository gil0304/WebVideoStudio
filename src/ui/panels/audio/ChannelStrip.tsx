// ============================================================
// Audio Mixer building blocks — vertical dB fader, stereo level
// meter (real analyser data via audioEngine.getMeters()) and a
// generic channel strip layout shared by the Track / Clip mixers.
// ============================================================

import React, { useEffect, useRef } from 'react';
import { DragValue } from '../../components/DragValue';
import { audioEngine } from '../../../engine/audioEngine';

export const DB_MIN = -60;
export const DB_MAX = 6;

const clampDb = (v: number) => Math.max(DB_MIN, Math.min(DB_MAX, v));

// One getMeters() call per animation frame shared by every meter instance.
let meterCache: { at: number; data: { tracks: Record<string, number>; master: number } } | null = null;
function sampleMeters(now: number) {
  if (!meterCache || now - meterCache.at > 6) meterCache = { at: now, data: audioEngine.getMeters() };
  return meterCache.data;
}

// ---------------- level meter ----------------

interface MeterProps {
  /** Track id, or 'master'. */
  source: string;
  playing: boolean;
  height?: number;
}

/** Stereo bar meter fed by the realtime analysers. Polls only while playing. */
export function LevelMeter({ source, playing, height = 140 }: MeterProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dispRef = useRef(0);
  const peakRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;

    const norm = (rms: number) => {
      // rms 0..1 → dBFS → 0..1 of bar height (floor at -60 dB)
      const db = 20 * Math.log10(Math.max(rms, 1e-4));
      return Math.max(0, Math.min(1, (db + 60) / 60));
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#101010';
      ctx.fillRect(0, 0, w, h);
      const lvl = norm(dispRef.current);
      const peak = norm(peakRef.current);
      const grad = ctx.createLinearGradient(0, h, 0, 0);
      grad.addColorStop(0, '#3fae5a');
      grad.addColorStop(0.62, '#3fae5a');
      grad.addColorStop(0.82, '#d9c545');
      grad.addColorStop(1, '#d94545');
      ctx.fillStyle = grad;
      const bw = Math.floor((w - 2) / 2);
      const bh = Math.round(lvl * h);
      ctx.fillRect(0, h - bh, bw, bh);          // L
      ctx.fillRect(bw + 2, h - bh, bw, bh);     // R
      if (peak > 0.01) {
        ctx.fillStyle = peak > 0.92 ? '#ff5252' : '#cfcfcf';
        ctx.fillRect(0, Math.max(0, h - Math.round(peak * h) - 1), w, 1);
      }
    };

    if (!playing) {
      dispRef.current = 0;
      peakRef.current = 0;
      draw();
      return;
    }
    let raf = 0;
    const loop = (now: number) => {
      const m = sampleMeters(now);
      const v = source === 'master' ? m.master : m.tracks[source] ?? 0;
      dispRef.current = Math.max(v, dispRef.current * 0.92);   // smooth decay
      peakRef.current = Math.max(v, peakRef.current * 0.996);  // peak hold, slow release
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, source, height]);

  return (
    <canvas
      ref={canvasRef}
      width={10}
      height={height}
      style={{ width: 10, height, borderRadius: 2, flex: 'none' }}
    />
  );
}

// ---------------- fader ----------------

interface FaderProps {
  db: number;
  onStart?: () => void;
  onChange: (db: number) => void;
  onEnd?: () => void;
  height?: number;
  disabled?: boolean;
}

/** Vertical dB fader, linear in dB from -60 to +6. */
export function Fader({ db, onStart, onChange, onEnd, height = 140, disabled }: FaderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);

  const dbFromY = (clientY: number): number => {
    const rect = trackRef.current!.getBoundingClientRect();
    const frac = 1 - (clientY - rect.top) / rect.height;
    return clampDb(Math.round((DB_MIN + frac * (DB_MAX - DB_MIN)) * 10) / 10);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    onStart?.();
    onChange(dbFromY(e.clientY));
    const move = (ev: PointerEvent) => onChange(dbFromY(ev.clientY));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onEnd?.();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const frac = (clampDb(db) - DB_MIN) / (DB_MAX - DB_MIN);
  const zeroFrac = (0 - DB_MIN) / (DB_MAX - DB_MIN);
  const thumbY = (1 - frac) * height;

  return (
    <div
      ref={trackRef}
      onPointerDown={onPointerDown}
      style={{
        position: 'relative', width: 18, height, cursor: disabled ? 'default' : 'ns-resize',
        flex: 'none', opacity: disabled ? 0.35 : 1,
      }}
      title={disabled ? undefined : 'ドラッグしてレベルを調整'}
    >
      {/* groove */}
      <div style={{
        position: 'absolute', left: 8, top: 0, bottom: 0, width: 2,
        background: 'var(--bg-inset)', borderRadius: 1,
      }} />
      {/* 0 dB tick */}
      <div style={{
        position: 'absolute', left: 3, right: 3, top: (1 - zeroFrac) * height,
        height: 1, background: 'var(--border-light)',
      }} />
      {/* thumb */}
      <div style={{
        position: 'absolute', left: 1, top: thumbY - 5, width: 16, height: 10,
        background: '#5a5a5a', border: '1px solid #1a1a1a', borderRadius: 2,
        boxShadow: '0 1px 2px rgba(0,0,0,0.5)',
      }}>
        <div style={{ position: 'absolute', left: 2, right: 2, top: 4, height: 1, background: '#c8c8c8' }} />
      </div>
    </div>
  );
}

// ---------------- channel strip ----------------

interface PanBinding {
  value: number;
  onStart?: () => void;
  onChange: (v: number) => void;
  onEnd?: () => void;
}
interface FaderBinding {
  db: number;
  onStart?: () => void;
  onChange: (db: number) => void;
  onEnd?: () => void;
}

interface StripProps {
  name: string;
  /** null → hide pan control (Master). */
  pan: PanBinding | null;
  /** null → no fader (Master strip). */
  fader: FaderBinding | null;
  dbText: string;
  muted?: boolean;
  solo?: boolean;
  onMute?: () => void;
  onSolo?: () => void;
  meterSource: string;
  playing: boolean;
  disabled?: boolean;
}

const msBtn = (active: boolean, color: string): React.CSSProperties => ({
  width: 18, height: 16, lineHeight: '14px', fontSize: 10, fontWeight: 700,
  borderRadius: 2, border: '1px solid var(--border-light)', cursor: 'pointer',
  background: active ? color : 'var(--bg-input)',
  color: active ? '#111' : 'var(--text-dim)',
  padding: 0, textAlign: 'center',
});

/** One mixer channel strip (name / pan / M-S / fader + meter / dB readout). */
export function ChannelStrip({
  name, pan, fader, dbText, muted, solo, onMute, onSolo, meterSource, playing, disabled,
}: StripProps) {
  return (
    <div style={{
      width: 72, flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 5, padding: '6px 3px', background: 'var(--bg-track)',
      border: '1px solid var(--border)', borderRadius: 4,
    }}>
      <div title={name} style={{
        fontSize: 11, color: disabled ? 'var(--text-disabled)' : 'var(--text)',
        maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', height: 14,
      }}>
        {name}
      </div>

      {/* pan */}
      <div
        title={pan && !disabled ? 'パン(ドラッグして調整)' : undefined}
        style={{ height: 16, display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, color: 'var(--text-dim)' }}
      >
        {pan && !disabled ? (
          <>
            <span>パン</span>
            <DragValue
              value={pan.value}
              min={-100} max={100} step={1} precision={0} width={26}
              onDragStart={pan.onStart}
              onChange={pan.onChange}
              onDragEnd={pan.onEnd}
            />
          </>
        ) : <span style={{ color: 'var(--text-disabled)' }}>{pan === null ? 'マスター' : '—'}</span>}
      </div>

      {/* mute / solo */}
      <div style={{ height: 16, display: 'flex', gap: 4 }}>
        {onMute || onSolo ? (
          <>
            <button title="ミュート" style={msBtn(!!muted, '#4cae5f')} onClick={onMute}>M</button>
            <button title="ソロ" style={msBtn(!!solo, '#d9c545')} onClick={onSolo}>S</button>
          </>
        ) : null}
      </div>

      {/* fader + meter */}
      <div style={{ display: 'flex', gap: 5, alignItems: 'flex-end' }}>
        {fader && !disabled
          ? <Fader db={fader.db} onStart={fader.onStart} onChange={fader.onChange} onEnd={fader.onEnd} />
          : <div style={{ width: 18, height: 140, flex: 'none' }} />}
        <LevelMeter source={meterSource} playing={playing} />
      </div>

      <div className="timecode" style={{ fontSize: 10 }}>{dbText}</div>
    </div>
  );
}

/** Format a dB value for the strip readout. */
export function formatDb(db: number): string {
  if (db <= DB_MIN + 1) return '-∞ dB';
  return `${db > 0 ? '+' : ''}${db.toFixed(1)} dB`;
}
