// ============================================================
// Project panel — icon (thumbnail grid) view with breadcrumb
// bin navigation and hover-scrub on video thumbnails.
// ============================================================

import React, { useState } from 'react';
import type { Bin, MediaAsset, VideoProject } from '../../../model/types';
import { LABEL_COLORS } from '../../../model/types';
import { toTimecode } from '../../../engine/timecode';
import { AssetThumb, LabelChip, TypeIcon, cmpName, hasThumb, isScrubbable } from './common';

const THUMB_W = 96;
const THUMB_H = 54;

export interface IconViewProps {
  project: VideoProject;
  query: string;
  currentBinId: string | null;
  onNavigate: (binId: string | null) => void;
  selectedIds: string[];
  onSelectAsset: (e: React.MouseEvent, id: string) => void;
  onOpenAsset: (a: MediaAsset) => void;
  onAssetMenu: (e: React.MouseEvent, a: MediaAsset) => void;
  onBinMenu: (e: React.MouseEvent, b: Bin) => void;
  onDragStartAsset: (e: React.DragEvent, a: MediaAsset) => void;
  onDropAssetOnBin: (assetId: string, binId: string) => void;
  visibleOrder: React.MutableRefObject<string[]>;
}

export default function IconView(p: IconViewProps) {
  const q = p.query.trim().toLowerCase();
  const bins = p.project.bins
    .filter((b) => (b.parentId ?? null) === p.currentBinId && (!q || b.name.toLowerCase().includes(q)))
    .sort(cmpName);
  const assets = p.project.assets
    .filter((a) => (a.binId ?? null) === p.currentBinId && (!q || a.name.toLowerCase().includes(q)))
    .sort(cmpName);
  p.visibleOrder.current = assets.map((a) => a.id);

  // breadcrumb chain: root … current
  const chain: Bin[] = [];
  let cur = p.currentBinId;
  while (cur) {
    const b = p.project.bins.find((x) => x.id === cur);
    if (!b) break;
    chain.unshift(b);
    cur = b.parentId;
  }
  const parentOfCurrent = chain.length > 0 ? chain[chain.length - 1].parentId : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 2, height: 20, padding: '0 8px',
          background: 'var(--bg-panel-header)', borderBottom: '1px solid var(--border)',
          color: 'var(--text-dim)', fontSize: 10, flex: 'none', position: 'sticky', top: 0, zIndex: 2,
          overflow: 'hidden', whiteSpace: 'nowrap',
        }}
      >
        <span
          onClick={() => p.onNavigate(null)}
          title="ルート"
          style={{ cursor: 'pointer', color: p.currentBinId === null ? 'var(--text)' : undefined }}
        >
          {p.project.name || 'ルート'}
        </span>
        {chain.map((b) => (
          <React.Fragment key={b.id}>
            <span style={{ opacity: 0.6 }}>›</span>
            <span
              onClick={() => p.onNavigate(b.id)}
              style={{ cursor: 'pointer', color: b.id === p.currentBinId ? 'var(--text)' : undefined }}
            >
              {b.name}
            </span>
          </React.Fragment>
        ))}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: 8, alignContent: 'flex-start' }}>
        {p.currentBinId !== null && !q && (
          <Card onDoubleClick={() => p.onNavigate(parentOfCurrent)} title="上の階層へ">
            <div style={cardThumbStyle()}>
              <span style={{ fontSize: 16, color: 'var(--text-dim)' }}>‥</span>
            </div>
            <div style={cardNameStyle}>上の階層へ</div>
          </Card>
        )}

        {bins.map((b) => (
          <BinCard
            key={b.id}
            bin={b}
            onOpen={() => p.onNavigate(b.id)}
            onMenu={(e) => p.onBinMenu(e, b)}
            onDropAsset={(assetId) => p.onDropAssetOnBin(assetId, b.id)}
          />
        ))}

        {assets.map((a) => (
          <AssetCard
            key={a.id}
            project={p.project}
            asset={a}
            selected={p.selectedIds.includes(a.id)}
            onClick={(e) => p.onSelectAsset(e, a.id)}
            onDoubleClick={() => p.onOpenAsset(a)}
            onContextMenu={(e) => p.onAssetMenu(e, a)}
            onDragStart={(e) => p.onDragStartAsset(e, a)}
          />
        ))}

        {bins.length === 0 && assets.length === 0 && (
          <div style={{ color: 'var(--text-disabled)', fontSize: 11, padding: 12 }}>
            {q ? '検索に一致する項目がありません。' : 'ビンは空です。'}
          </div>
        )}
      </div>
    </div>
  );
}

const cardNameStyle: React.CSSProperties = {
  width: THUMB_W, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  fontSize: 10, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4,
};

function cardThumbStyle(): React.CSSProperties {
  return {
    width: THUMB_W, height: THUMB_H, background: 'var(--bg-inset)', borderRadius: 2,
    display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
    overflow: 'hidden',
  };
}

function Card({ children, selected, title, ...rest }: React.HTMLAttributes<HTMLDivElement> & {
  selected?: boolean;
  draggable?: boolean;
}) {
  return (
    <div
      {...rest}
      title={title}
      className="wvs-projcard"
      style={{
        padding: 4, borderRadius: 3, cursor: 'default', userSelect: 'none',
        background: selected ? 'rgba(45,140,235,0.28)' : undefined,
        outline: selected ? '1px solid var(--accent)' : '1px solid transparent',
        outlineOffset: -1,
      }}
    >
      {children}
    </div>
  );
}

function BinCard({ bin, onOpen, onMenu, onDropAsset }: {
  bin: Bin;
  onOpen: () => void;
  onMenu: (e: React.MouseEvent) => void;
  onDropAsset: (assetId: string) => void;
}) {
  const [hot, setHot] = useState(false);
  return (
    <div
      className="wvs-projcard"
      onDoubleClick={onOpen}
      onContextMenu={onMenu}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('application/x-wvs-asset')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          setHot(true);
        }
      }}
      onDragLeave={() => setHot(false)}
      onDrop={(e) => {
        setHot(false);
        const raw = e.dataTransfer.getData('application/x-wvs-asset');
        if (!raw) return;
        e.preventDefault();
        e.stopPropagation();
        try {
          const { assetId } = JSON.parse(raw) as { assetId: string };
          if (assetId) onDropAsset(assetId);
        } catch { /* malformed payload */ }
      }}
      style={{
        padding: 4, borderRadius: 3, cursor: 'default', userSelect: 'none',
        background: hot ? 'rgba(45,140,235,0.28)' : undefined,
        outline: hot ? '1px solid var(--accent)' : '1px solid transparent', outlineOffset: -1,
      }}
      title={bin.name}
    >
      <div style={cardThumbStyle()}>
        <TypeIcon kind="bin" size={30} />
      </div>
      <div style={cardNameStyle}>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{bin.name}</span>
      </div>
    </div>
  );
}

function AssetCard({ project, asset, selected, onClick, onDoubleClick, onContextMenu, onDragStart }: {
  project: VideoProject;
  asset: MediaAsset;
  selected: boolean;
  onClick: (e: React.MouseEvent) => void;
  onDoubleClick: () => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const [scrubT, setScrubT] = useState<number | null>(null);
  const scrub = isScrubbable(asset);
  const scrubRange = Math.min(asset.duration, 60);
  return (
    <div
      className="wvs-projcard"
      draggable
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      style={{
        padding: 4, borderRadius: 3, cursor: 'default', userSelect: 'none',
        background: selected ? 'rgba(45,140,235,0.28)' : undefined,
        outline: selected ? '1px solid var(--accent)' : '1px solid transparent', outlineOffset: -1,
      }}
      title={asset.offline ? `${asset.name}(オフライン)` : asset.name}
    >
      <div
        style={cardThumbStyle()}
        onMouseMove={scrub ? (e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const f = Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
          setScrubT(f * scrubRange);
        } : undefined}
        onMouseLeave={scrub ? () => setScrubT(null) : undefined}
      >
        {hasThumb(asset)
          ? <AssetThumb project={project} asset={asset} time={scrubT ?? 1} w={THUMB_W} h={THUMB_H} />
          : <TypeIcon kind={asset.type} size={24} />}
        {scrub && scrubT !== null && (
          <div
            style={{
              position: 'absolute', top: 0, bottom: 0, width: 1,
              left: `${(scrubT / scrubRange) * 100}%`, background: 'var(--accent-bright)',
            }}
          />
        )}
        {asset.offline && (
          <div
            style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: 'rgba(120,20,20,0.55)',
              color: '#ffb0b0', fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
            }}
          >
            オフライン
          </div>
        )}
        {asset.proxyEnabled && (
          <span
            style={{
              position: 'absolute', top: 2, right: 2, fontSize: 8, lineHeight: '10px',
              padding: '0 3px', borderRadius: 2, background: 'var(--accent)', color: '#fff', fontWeight: 700,
            }}
            title="プロキシ有効"
          >
            P
          </span>
        )}
      </div>
      <div style={cardNameStyle}>
        <LabelChip color={LABEL_COLORS[asset.label]} />
        <span
          style={{
            overflow: 'hidden', textOverflow: 'ellipsis',
            color: asset.offline ? 'var(--danger)' : 'var(--text)',
            textDecoration: asset.offline ? 'line-through' : undefined,
          }}
        >
          {asset.name}
        </span>
      </div>
      <div style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', paddingLeft: 20 }}>
        {toTimecode(asset.duration, 30)}
      </div>
    </div>
  );
}
