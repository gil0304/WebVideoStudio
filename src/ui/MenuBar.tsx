// ============================================================
// MenuBar — Premiere-style application menu. Click opens a
// dropdown, hovering other titles switches menus, Escape or
// click-away closes. Also mounts all shared dialogs + the
// Home screen so they are always in the tree.
// ============================================================

import { useEffect, useRef, useState } from 'react';
import { useStudio } from '../state/store';
import { APP_MENU_TITLE, buildMenu, MENU_TITLES, type MenuEntry } from './menus/menuDefs';
import { importMediaPicker, openProjectPicker, saveNow } from './menus/menuUtils';
import Dialogs from './dialogs/Dialogs';

export default function MenuBar() {
  const [open, setOpen] = useState<string | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // close on click-away / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.closest('.menubar') || el.closest('.menu-popup'))) return;
      setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // extra file shortcuts owned by the menus package (⌘S save, ⌘I import, ⌘O open)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 's') { e.preventDefault(); saveNow(); }
      else if (key === 'i') { e.preventDefault(); importMediaPicker(); }
      else if (key === 'o') { e.preventDefault(); openProjectPicker(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const anchor = open ? itemRefs.current[open] : null;
  const rect = anchor?.getBoundingClientRect();

  return (
    <>
      <div className="menubar" ref={barRef}>
        {MENU_TITLES.map((t) => (
          <div
            key={t}
            ref={(el) => { itemRefs.current[t] = el; }}
            className={`menubar-item ${open === t ? 'open' : ''}`}
            style={t === APP_MENU_TITLE ? { fontWeight: 700 } : undefined}
            onPointerDown={(e) => { e.preventDefault(); setOpen(open === t ? null : t); }}
            onMouseEnter={() => { if (open && open !== t) setOpen(t); }}
          >
            {t}
          </div>
        ))}
      </div>
      {open && rect && (
        <MenuDropdown menu={open} x={rect.left} y={rect.bottom + 2} onClose={() => setOpen(null)} />
      )}
      <Dialogs />
    </>
  );
}

// ---------------- dropdown ----------------

function MenuDropdown({ menu, x, y, onClose }: { menu: string; x: number; y: number; onClose: () => void }) {
  // full-store subscription is fine here: only mounted while a menu is open
  const state = useStudio();
  const items = buildMenu(menu, state);
  const left = Math.min(x, window.innerWidth - 268);
  return (
    <div className="menu-popup" style={{ left, top: y, minWidth: 240 }}>
      <MenuList items={items} onClose={onClose} />
    </div>
  );
}

function MenuList({ items, onClose }: { items: MenuEntry[]; onClose: () => void }) {
  return (
    <>
      {items.map((it, i) => it.separator
        ? <div key={i} className="menu-separator" />
        : <MenuRow key={`${it.label}_${i}`} item={it} onClose={onClose} />)}
    </>
  );
}

function MenuRow({ item, onClose }: { item: MenuEntry; onClose: () => void }) {
  const [sub, setSub] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const hasChildren = !!item.children && item.children.length > 0;
  return (
    <div
      ref={rowRef}
      className={`menu-item ${item.disabled ? 'disabled' : ''}`}
      title={item.tooltip}
      style={{ position: 'relative' }}
      onMouseEnter={() => setSub(true)}
      onMouseLeave={() => setSub(false)}
      onClick={(e) => {
        if (item.disabled || hasChildren) return;
        e.stopPropagation();
        item.onClick?.();
        onClose();
      }}
    >
      {item.checked && <span className="check">✓</span>}
      <span>{item.label}</span>
      {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
      {hasChildren && <span style={{ marginLeft: 'auto', paddingLeft: 28, fontSize: 10, color: 'var(--text-dim)' }}>▸</span>}
      {hasChildren && sub && !item.disabled && (
        <div
          className="menu-popup"
          style={{ position: 'absolute', left: '100%', top: -5, minWidth: 200 }}
          onClick={(e) => e.stopPropagation()}
        >
          <MenuList items={item.children!} onClose={onClose} />
        </div>
      )}
    </div>
  );
}
