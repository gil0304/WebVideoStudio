// ============================================================
// Effects panel — searchable, collapsible browser of video /
// audio effects and transitions. Rows drag onto timeline clips
// (cross-panel mime contract) or apply on double-click.
// ============================================================

import React, { useMemo, useState } from 'react';
import { useStudio } from '../../state/store';
import { AUDIO_EFFECT_DEFS, VIDEO_EFFECT_DEFS } from '../../engine/effects';

interface EffectLeaf {
  kind: 'effect';
  id: string;
  name: string;
  category: 'video' | 'audio';
}
interface TransitionLeaf {
  kind: 'transition';
  type: string;
  name: string;
  category: 'video' | 'audio';
}
type Leaf = EffectLeaf | TransitionLeaf;

interface Group { name: string; items: Leaf[] }
interface Section { name: string; groups: Group[] }

/**
 * Effect display names / group names come straight from the effect defs
 * (already localized in src/engine/effects.ts) — never hardcoded here.
 */
function groupEffects(defs: typeof VIDEO_EFFECT_DEFS): Group[] {
  const map = new Map<string, Leaf[]>();
  for (const d of defs) {
    const list = map.get(d.group) ?? [];
    list.push({ kind: 'effect', id: d.id, name: d.name, category: d.category });
    map.set(d.group, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'ja'))
    .map(([name, items]) => ({ name, items: items.sort((a, b) => a.name.localeCompare(b.name, 'ja')) }));
}

const vt = (type: string, name: string): Leaf => ({ kind: 'transition', type, name, category: 'video' });
const at = (type: string, name: string): Leaf => ({ kind: 'transition', type, name, category: 'audio' });

const SECTIONS: Section[] = [
  { name: 'ビデオエフェクト', groups: groupEffects(VIDEO_EFFECT_DEFS) },
  { name: 'オーディオエフェクト', groups: groupEffects(AUDIO_EFFECT_DEFS) },
  {
    name: 'ビデオトランジション',
    groups: [
      {
        name: 'ディゾルブ',
        items: [
          vt('cross-dissolve', 'クロスディゾルブ'),
          vt('blur-dissolve', 'ブラーディゾルブ'),
          vt('dip-to-black', '暗転'),
          vt('dip-to-white', '明転'),
        ],
      },
      { name: 'ワイプ', items: [vt('wipe', 'ワイプ'), vt('iris', 'アイリス')] },
      { name: 'スライド', items: [vt('slide', 'スライド'), vt('push', 'プッシュ')] },
      { name: 'ズーム', items: [vt('zoom', 'ズーム')] },
    ],
  },
  {
    name: 'オーディオトランジション',
    groups: [
      {
        name: 'クロスフェード',
        items: [
          at('constant-gain', 'コンスタントゲイン'),
          at('constant-power', 'コンスタントパワー'),
          at('exponential-fade', '指数フェード'),
        ],
      },
    ],
  },
];

export default function EffectsPanel() {
  const selection = useStudio((s) => s.ui.selection);
  const addEffectToClips = useStudio((s) => s.addEffectToClips);
  const addTransition = useStudio((s) => s.addTransition);

  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const s of SECTIONS) init[s.name] = true;
    return init;
  });

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return SECTIONS;
    return SECTIONS
      .map((s) => ({
        ...s,
        groups: s.groups
          .map((g) => ({ ...g, items: g.items.filter((it) => it.name.toLowerCase().includes(q)) }))
          .filter((g) => g.items.length > 0),
      }))
      .filter((s) => s.groups.length > 0);
  }, [q]);

  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: !o[key] }));
  const isOpen = (key: string) => (q ? true : !!open[key]);

  const applyLeaf = (leaf: Leaf) => {
    if (selection.length === 0) return;
    if (leaf.kind === 'effect') {
      addEffectToClips(selection, leaf.id);
    } else {
      for (const id of selection) addTransition(id, 'in', leaf.type, 1);
    }
  };

  const dragLeaf = (e: React.DragEvent, leaf: Leaf) => {
    if (leaf.kind === 'effect') {
      e.dataTransfer.setData('application/x-wvs-effect', JSON.stringify({ effectId: leaf.id }));
    } else {
      e.dataTransfer.setData('application/x-wvs-transition', JSON.stringify({ type: leaf.type, category: leaf.category }));
    }
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11, color: 'var(--text)' }}>
      <style>{`
        .wvs-fxrow:hover { background: var(--bg-hover); }
        .wvs-fxrow:active { background: var(--accent); color: #fff; }
      `}</style>

      <div style={{ padding: '3px 6px', borderBottom: '1px solid var(--border)', flex: 'none' }}>
        <input
          type="text"
          placeholder="検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', height: 20, fontSize: 11 }}
        />
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '2px 0' }}>
        {filtered.map((section) => (
          <div key={section.name}>
            <FolderRow
              label={section.name}
              depth={0}
              open={isOpen(section.name)}
              onToggle={() => toggle(section.name)}
              bold
            />
            {isOpen(section.name) && section.groups.map((group) => {
              const gKey = `${section.name}/${group.name}`;
              return (
                <div key={gKey}>
                  <FolderRow
                    label={group.name}
                    depth={1}
                    open={isOpen(gKey)}
                    onToggle={() => toggle(gKey)}
                  />
                  {isOpen(gKey) && group.items.map((leaf) => (
                    <LeafRow
                      key={leaf.kind === 'effect' ? leaf.id : `${leaf.category}:${leaf.type}`}
                      leaf={leaf}
                      onDoubleClick={() => applyLeaf(leaf)}
                      onDragStart={(e) => dragLeaf(e, leaf)}
                    />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
        {filtered.length === 0 && (
          <div style={{ color: 'var(--text-disabled)', padding: 12 }}>検索に一致するエフェクトがありません。</div>
        )}
      </div>
    </div>
  );
}

function FolderRow({ label, depth, open, onToggle, bold }: {
  label: string;
  depth: number;
  open: boolean;
  onToggle: () => void;
  bold?: boolean;
}) {
  return (
    <div
      className="wvs-fxrow"
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, height: 22,
        paddingLeft: 8 + depth * 14, cursor: 'default', userSelect: 'none',
        fontWeight: bold ? 600 : 400,
        color: bold ? 'var(--text-bright)' : 'var(--text)',
      }}
    >
      <span style={{ width: 9, color: 'var(--text-dim)', fontSize: 9, flex: 'none' }}>
        {open ? '▾' : '▸'}
      </span>
      <svg width="13" height="13" viewBox="0 0 16 16" style={{ flex: 'none' }}>
        <path
          fill="#c9a45c"
          d="M1 3.5C1 2.7 1.7 2 2.5 2h3.2l1.4 1.8h6.4c.8 0 1.5.7 1.5 1.5v7.2c0 .8-.7 1.5-1.5 1.5h-11C1.7 14 1 13.3 1 12.5v-9z"
        />
      </svg>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
    </div>
  );
}

function LeafRow({ leaf, onDoubleClick, onDragStart }: {
  leaf: Leaf;
  onDoubleClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const isTransition = leaf.kind === 'transition';
  return (
    <div
      className="wvs-fxrow"
      draggable
      onDoubleClick={onDoubleClick}
      onDragStart={onDragStart}
      title={isTransition
        ? 'クリップの端にドラッグ、またはダブルクリックで選択中のクリップに適用'
        : 'クリップにドラッグ、またはダブルクリックで選択中のクリップに適用'}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, height: 21,
        paddingLeft: 8 + 2 * 14, paddingRight: 8, cursor: 'default', userSelect: 'none',
      }}
    >
      <span style={{ width: 9, flex: 'none' }} />
      {isTransition ? (
        <svg width="13" height="13" viewBox="0 0 16 16" style={{ flex: 'none' }}>
          <rect x="1.5" y="4" width="13" height="8" rx="1" fill="none" stroke="var(--text-dim)" />
          <path d="M1.5 12 14.5 4" stroke="var(--text-dim)" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 16 16" style={{ flex: 'none' }}>
          <rect x="1.5" y="2.5" width="13" height="11" rx="1.5" fill="none" stroke="var(--text-dim)" />
          <text x="8" y="11" textAnchor="middle" fontSize="7.5" fontStyle="italic" fill="var(--text-dim)">fx</text>
        </svg>
      )}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{leaf.name}</span>
      {leaf.kind === 'effect' && leaf.category === 'video' && (
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 3, flex: 'none' }}>
          <Badge text="32" color="#c7b45a" title="32bitカラー対応" />
          <Badge text="GPU" color="#9a57b5" title="GPUアクセラレーション対応" />
        </span>
      )}
    </div>
  );
}

function Badge({ text, color, title }: { text: string; color: string; title: string }) {
  return (
    <span
      title={title}
      style={{
        fontSize: 8, lineHeight: '11px', padding: '0 3px', borderRadius: 2,
        border: `1px solid ${color}`, color, opacity: 0.75, fontWeight: 600,
      }}
    >
      {text}
    </span>
  );
}
