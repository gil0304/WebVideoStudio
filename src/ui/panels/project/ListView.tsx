// ============================================================
// Project panel — hierarchical list view (bins + assets with
// 名前 / デュレーション / fps / タイプ / コーデック columns).
// ============================================================

import React, { useState } from 'react';
import type { Bin, MediaAsset, VideoProject } from '../../../model/types';
import { ASSET_TYPE_NAMES_JA, LABEL_COLORS } from '../../../model/types';
import { toTimecode } from '../../../engine/timecode';
import { AssetThumb, LabelChip, TypeIcon, codecOf, hasThumb } from './common';

export type SortKey = 'name' | 'duration' | 'fps' | 'type';
export interface SortState { key: SortKey; asc: boolean }

interface Row {
  kind: 'bin' | 'asset';
  id: string;
  depth: number;
  bin?: Bin;
  asset?: MediaAsset;
}

// Japanese headers are wider than the English ones — デュレーション / タイプ need room.
const COLS = 'minmax(150px, 1fr) 96px 48px 88px 94px';

function cmpAssets(sort: SortState) {
  const dir = sort.asc ? 1 : -1;
  return (a: MediaAsset, b: MediaAsset): number => {
    switch (sort.key) {
      case 'duration': return (a.duration - b.duration) * dir;
      case 'fps': return ((a.frameRate ?? 0) - (b.frameRate ?? 0)) * dir;
      case 'type': return (
        ASSET_TYPE_NAMES_JA[a.type].localeCompare(ASSET_TYPE_NAMES_JA[b.type], 'ja') * dir
        || a.name.localeCompare(b.name, 'ja') * dir
      );
      default: return a.name.localeCompare(b.name, 'ja') * dir;
    }
  };
}

function buildRows(project: VideoProject, openBins: Record<string, boolean>, query: string, sort: SortState): Row[] {
  const q = query.trim().toLowerCase();
  const cmp = cmpAssets(sort);
  if (q) {
    return project.assets
      .filter((a) => a.name.toLowerCase().includes(q))
      .sort(cmp)
      .map((a) => ({ kind: 'asset' as const, id: a.id, depth: 0, asset: a }));
  }
  const rows: Row[] = [];
  const emit = (parentId: string | null, depth: number) => {
    const bins = project.bins
      .filter((b) => b.parentId === parentId)
      .sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    for (const b of bins) {
      rows.push({ kind: 'bin', id: b.id, depth, bin: b });
      if (openBins[b.id]) emit(b.id, depth + 1);
    }
    const assets = project.assets.filter((a) => (a.binId ?? null) === parentId).sort(cmp);
    for (const a of assets) rows.push({ kind: 'asset', id: a.id, depth, asset: a });
  };
  emit(null, 0);
  return rows;
}

export interface ListViewProps {
  project: VideoProject;
  query: string;
  sort: SortState;
  onSort: (key: SortKey) => void;
  openBins: Record<string, boolean>;
  onToggleBin: (id: string) => void;
  selectedIds: string[];
  onSelectAsset: (e: React.MouseEvent, id: string) => void;
  onOpenAsset: (a: MediaAsset) => void;
  onAssetMenu: (e: React.MouseEvent, a: MediaAsset) => void;
  onBinMenu: (e: React.MouseEvent, b: Bin) => void;
  onDragStartAsset: (e: React.DragEvent, a: MediaAsset) => void;
  onDropAssetOnBin: (assetId: string, binId: string) => void;
  visibleOrder: React.MutableRefObject<string[]>;
}

export default function ListView(p: ListViewProps) {
  const [dropBin, setDropBin] = useState<string | null>(null);
  const rows = buildRows(p.project, p.openBins, p.query, p.sort);
  p.visibleOrder.current = rows.filter((r) => r.kind === 'asset').map((r) => r.id);

  const headCell = (label: string, key?: SortKey) => (
    <div
      key={label}
      onClick={key ? () => p.onSort(key) : undefined}
      style={{
        padding: '0 6px', cursor: key ? 'pointer' : 'default', userSelect: 'none',
        display: 'flex', alignItems: 'center', gap: 3, overflow: 'hidden', whiteSpace: 'nowrap',
      }}
    >
      {label}
      {key && p.sort.key === key && <span style={{ fontSize: 8 }}>{p.sort.asc ? '▲' : '▼'}</span>}
    </div>
  );

  return (
    <div style={{ minWidth: 480 }}>
      <div
        style={{
          display: 'grid', gridTemplateColumns: COLS, height: 20, alignItems: 'center',
          background: 'var(--bg-panel-header)', borderBottom: '1px solid var(--border)',
          color: 'var(--text-dim)', fontSize: 10, position: 'sticky', top: 0, zIndex: 2,
        }}
      >
        {headCell('名前', 'name')}
        {headCell('デュレーション', 'duration')}
        {headCell('fps', 'fps')}
        {headCell('タイプ', 'type')}
        {headCell('コーデック')}
      </div>

      {rows.map((row) => row.kind === 'bin' ? (
        <BinRow
          key={row.id}
          bin={row.bin!}
          depth={row.depth}
          open={!!p.openBins[row.id]}
          highlight={dropBin === row.id}
          onToggle={() => p.onToggleBin(row.id)}
          onMenu={(e) => p.onBinMenu(e, row.bin!)}
          onDragOver={(e) => {
            if (e.dataTransfer.types.includes('application/x-wvs-asset')) {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              setDropBin(row.id);
            }
          }}
          onDragLeave={() => setDropBin((cur) => (cur === row.id ? null : cur))}
          onDrop={(e) => {
            setDropBin(null);
            const raw = e.dataTransfer.getData('application/x-wvs-asset');
            if (!raw) return;
            e.preventDefault();
            e.stopPropagation();
            try {
              const { assetId } = JSON.parse(raw) as { assetId: string };
              if (assetId) p.onDropAssetOnBin(assetId, row.id);
            } catch { /* malformed payload */ }
          }}
        />
      ) : (
        <AssetRow
          key={row.id}
          project={p.project}
          asset={row.asset!}
          depth={row.depth}
          selected={p.selectedIds.includes(row.id)}
          onClick={(e) => p.onSelectAsset(e, row.id)}
          onDoubleClick={() => p.onOpenAsset(row.asset!)}
          onContextMenu={(e) => p.onAssetMenu(e, row.asset!)}
          onDragStart={(e) => p.onDragStartAsset(e, row.asset!)}
        />
      ))}
    </div>
  );
}

function BinRow({ bin, depth, open, highlight, onToggle, onMenu, onDragOver, onDragLeave, onDrop }: {
  bin: Bin;
  depth: number;
  open: boolean;
  highlight: boolean;
  onToggle: () => void;
  onMenu: (e: React.MouseEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  return (
    <div
      className="wvs-projrow"
      onClick={onToggle}
      onContextMenu={onMenu}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      style={{
        display: 'flex', alignItems: 'center', gap: 5, height: 22,
        paddingLeft: 6 + depth * 14, cursor: 'default', userSelect: 'none',
        background: highlight ? 'rgba(45,140,235,0.25)' : undefined,
        outline: highlight ? '1px solid var(--accent)' : undefined, outlineOffset: -1,
      }}
    >
      <span style={{ width: 9, color: 'var(--text-dim)', fontSize: 9, flex: 'none' }}>
        {open ? '▾' : '▸'}
      </span>
      <TypeIcon kind="bin" />
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bin.name}</span>
    </div>
  );
}

function AssetRow({ project, asset, depth, selected, onClick, onDoubleClick, onContextMenu, onDragStart }: {
  project: VideoProject;
  asset: MediaAsset;
  depth: number;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const cell: React.CSSProperties = {
    padding: '0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
    color: selected ? '#fff' : 'var(--text-dim)',
  };
  return (
    <div
      className={`wvs-projrow ${selected ? 'sel' : ''}`}
      draggable
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      style={{
        display: 'grid', gridTemplateColumns: COLS, alignItems: 'center', height: 22,
        cursor: 'default', userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, paddingLeft: 6 + depth * 14 + 14, minWidth: 0 }}>
        <LabelChip color={LABEL_COLORS[asset.label]} />
        {hasThumb(asset)
          ? <AssetThumb project={project} asset={asset} time={1} w={26} h={15} />
          : <TypeIcon kind={asset.type} />}
        <span
          style={{
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: asset.offline ? 'var(--danger)' : selected ? '#fff' : 'var(--text)',
            textDecoration: asset.offline ? 'line-through' : undefined,
          }}
          title={asset.offline ? `${asset.name}(オフライン)` : asset.name}
        >
          {asset.name}
        </span>
        {asset.proxyEnabled && (
          <span
            style={{
              flex: 'none', fontSize: 8, lineHeight: '10px', padding: '0 3px', borderRadius: 2,
              background: 'var(--accent)', color: '#fff', fontWeight: 700,
            }}
            title="プロキシ有効"
          >
            P
          </span>
        )}
      </div>
      <div style={{ ...cell, fontFamily: 'var(--font-mono)', fontSize: 10 }}>{toTimecode(asset.duration, 30)}</div>
      <div style={cell}>{asset.frameRate ?? '—'}</div>
      <div style={cell}>{ASSET_TYPE_NAMES_JA[asset.type]}</div>
      <div style={cell}>{codecOf(asset)}</div>
    </div>
  );
}
