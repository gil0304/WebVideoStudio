import React, { useCallback, useRef, useState } from 'react';

interface Props {
  value: number;
  onChange: (v: number) => void;
  /** Called once when a scrub drag starts / ends (wrap in an undo transaction). */
  onDragStart?: () => void;
  onDragEnd?: () => void;
  min?: number;
  max?: number;
  step?: number;
  precision?: number;
  suffix?: string;
  width?: number;
}

/** Premiere-style scrubbable number ("hot text"). Drag to change, click to type. */
export function DragValue({ value, onChange, onDragStart, onDragEnd, min = -Infinity, max = Infinity, step = 1, precision = 1, suffix = '', width }: Props) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const moved = useRef(false);

  const clamp = useCallback((v: number) => Math.max(min, Math.min(max, v)), [min, max]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (editing) return;
    e.preventDefault();
    moved.current = false;
    const startX = e.clientX;
    const startV = value;
    let started = false;
    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      if (!moved.current && Math.abs(dx) < 3) return;
      if (!started) { started = true; onDragStart?.(); }
      moved.current = true;
      const scale = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      onChange(clamp(startV + dx * step * scale * 0.5));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (started) onDragEnd?.();
      if (!moved.current) {
        setText(String(Number(value.toFixed(precision + 2))));
        setEditing(true);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [editing, value, step, clamp, onChange, onDragStart, onDragEnd, precision]);

  if (editing) {
    return (
      <input
        type="text"
        autoFocus
        value={text}
        style={{ width: width ?? 56, textAlign: 'right' }}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={() => {
          const v = parseFloat(text);
          if (!isNaN(v)) onChange(clamp(v));
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
  return (
    <span className="drag-value" onPointerDown={onPointerDown} style={{ minWidth: width, display: 'inline-block', textAlign: 'right' }}>
      {Number(value.toFixed(precision)).toLocaleString('en-US', { maximumFractionDigits: precision })}{suffix}
    </span>
  );
}
