import React, { useEffect, useState } from 'react';

export interface CtxItem {
  label?: string;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
  shortcut?: string;
  onClick?: () => void;
  children?: CtxItem[];
}

interface MenuProps {
  x: number;
  y: number;
  items: CtxItem[];
  onClose: () => void;
}

/** Right-click context menu. Render conditionally; call onClose to dismiss. */
export function ContextMenu({ x, y, items, onClose }: MenuProps) {
  const [pos, setPos] = useState({ x, y });
  useEffect(() => {
    const w = 240, hEst = items.length * 26 + 12;
    setPos({
      x: Math.min(x, window.innerWidth - w - 8),
      y: Math.min(y, window.innerHeight - Math.min(hEst, 500) - 8),
    });
  }, [x, y, items.length]);
  return (
    <div className="ctx-overlay" onPointerDown={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }}>
      <div
        className="menu-popup"
        style={{ left: pos.x, top: pos.y }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {items.map((it, i) => it.separator ? (
          <div key={i} className="menu-separator" />
        ) : (
          <SubMenuItem key={i} item={it} onClose={onClose} />
        ))}
      </div>
    </div>
  );
}

function SubMenuItem({ item, onClose }: { item: CtxItem; onClose: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`menu-item ${item.disabled ? 'disabled' : ''}`}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => {
        if (item.disabled || item.children) return;
        item.onClick?.();
        onClose();
      }}
      style={{ position: 'relative' }}
    >
      {item.checked && <span className="check">✓</span>}
      {item.label}
      {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
      {item.children && <span style={{ marginLeft: 'auto', paddingLeft: 18 }}>▸</span>}
      {item.children && open && (
        <div className="menu-popup" style={{ position: 'absolute', left: '100%', top: -4 }}>
          {item.children.map((c, i) => c.separator ? (
            <div key={i} className="menu-separator" />
          ) : (
            <SubMenuItem key={i} item={c} onClose={onClose} />
          ))}
        </div>
      )}
    </div>
  );
}

/** Hook helper: manage context-menu open state. */
export function useContextMenu() {
  const [menu, setMenu] = useState<{ x: number; y: number; items: CtxItem[] } | null>(null);
  const openMenu = (e: React.MouseEvent, items: CtxItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY, items });
  };
  const menuEl = menu ? <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} /> : null;
  return { openMenu, menuEl, closeMenu: () => setMenu(null) };
}
