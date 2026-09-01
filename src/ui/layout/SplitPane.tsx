import React, { useCallback, useRef, useState } from 'react';

interface Props {
  direction: 'h' | 'v';
  initial: number; // fraction 0..1 of first pane
  min?: number;
  max?: number;
  a: React.ReactNode;
  b: React.ReactNode;
}

/** Resizable two-pane splitter. */
export function SplitPane({ direction, initial, min = 0.1, max = 0.9, a, b }: Props) {
  const [frac, setFrac] = useState(initial);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const onMove = (ev: PointerEvent) => {
      const pos = direction === 'h'
        ? (ev.clientX - rect.left) / rect.width
        : (ev.clientY - rect.top) / rect.height;
      setFrac(Math.max(min, Math.min(max, pos)));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [direction, min, max]);

  return (
    <div ref={ref} className={`split ${direction}`} style={{ flex: 1, minHeight: 0, minWidth: 0 }}>
      <div className="split-a" style={{ flex: `${frac} 1 0` }}>{a}</div>
      <div className={`splitter ${dragging ? 'dragging' : ''}`} onPointerDown={onPointerDown} />
      <div className="split-b" style={{ flex: `${1 - frac} 1 0` }}>{b}</div>
    </div>
  );
}
