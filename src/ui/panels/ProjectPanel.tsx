// ============================================================
// Project panel — media browser: searchable bin tree (list
// view) / thumbnail grid (icon view), import, drag & drop to
// the timeline, asset management context menu.
// ============================================================

import React, { useMemo, useRef, useState } from 'react';
import { useStudio } from '../../state/store';
import type { Bin, LabelColor, MediaAsset } from '../../model/types';
import { LABEL_NAMES_JA } from '../../model/types';
import { uid } from '../../model/ids';
import { getAssetThumbnail } from '../../engine/renderer';
import { sharedMedia } from '../../engine/playback';
import { useContextMenu, type CtxItem } from '../components/ContextMenu';
import ListView, { type SortKey, type SortState } from './project/ListView';
import IconView from './project/IconView';
import { hasThumb } from './project/common';

const LABEL_KEYS = Object.keys(LABEL_NAMES_JA) as LabelColor[];

/** Default names for items this panel creates (display text — store labels stay English). */
const NEW_BIN_NAME = '新規ビン';

export default function ProjectPanel() {
  const project = useStudio((s) => s.project);
  const viewMode = useStudio((s) => s.ui.projectViewMode);
  const selectedIds = useStudio((s) => s.ui.selectedAssetIds);
  const currentBinId = useStudio((s) => s.ui.currentBinId);
  const openBins = useStudio((s) => s.ui.openBins);
  const setUi = useStudio((s) => s.setUi);
  const mutate = useStudio((s) => s.mutate);
  const importFiles = useStudio((s) => s.importFiles);
  const createBin = useStudio((s) => s.createBin);
  const renameAsset = useStudio((s) => s.renameAsset);
  const renameBin = useStudio((s) => s.renameBin);
  const deleteAssets = useStudio((s) => s.deleteAssets);
  const deleteBin = useStudio((s) => s.deleteBin);
  const moveAssetToBin = useStudio((s) => s.moveAssetToBin);
  const setAssetLabel = useStudio((s) => s.setAssetLabel);
  const duplicateSequenceAsset = useStudio((s) => s.duplicateSequenceAsset);
  const openInSource = useStudio((s) => s.openInSource);
  const setActiveSequence = useStudio((s) => s.setActiveSequence);

  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'name', asc: true });
  const { openMenu, menuEl } = useContextMenu();
  const fileRef = useRef<HTMLInputElement>(null);
  const visibleOrder = useRef<string[]>([]);
  const lastClicked = useRef<string | null>(null);

  // ---------- selection ----------

  const selectAsset = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey && lastClicked.current) {
      const order = visibleOrder.current;
      const a = order.indexOf(lastClicked.current);
      const b = order.indexOf(id);
      if (a >= 0 && b >= 0) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setUi({ selectedAssetIds: order.slice(lo, hi + 1) });
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      setUi({
        selectedAssetIds: selectedIds.includes(id)
          ? selectedIds.filter((x) => x !== id)
          : [...selectedIds, id],
      });
    } else {
      setUi({ selectedAssetIds: [id] });
    }
    lastClicked.current = id;
  };

  const openAsset = (a: MediaAsset) => {
    if (a.type === 'sequence' && a.sequenceId) setActiveSequence(a.sequenceId);
    else if (a.type !== 'adjustment') openInSource(a.id);
  };

  // ---------- asset operations ----------

  const targetIds = (a: MediaAsset) => (selectedIds.includes(a.id) ? selectedIds : [a.id]);

  const duplicateAssets = (ids: string[]) => {
    const seqIds = ids.filter((id) => project.assets.find((x) => x.id === id)?.type === 'sequence');
    const plainIds = ids.filter((id) => {
      const a = project.assets.find((x) => x.id === id);
      return a && a.type !== 'sequence';
    });
    for (const id of seqIds) duplicateSequenceAsset(id);
    if (plainIds.length > 0) {
      mutate('Duplicate', (p) => {
        for (const id of plainIds) {
          const src = p.assets.find((x) => x.id === id);
          if (!src) continue;
          const copy = structuredClone(src);
          copy.id = uid('asset');
          copy.name = `${src.name} コピー`;
          p.assets.push(copy);
        }
      });
    }
  };

  const toggleProxy = (ids: string[]) => {
    mutate('Toggle Proxy', (p) => {
      for (const a of p.assets) if (ids.includes(a.id)) a.proxyEnabled = !a.proxyEnabled;
    });
  };

  const setOffline = (ids: string[], offline: boolean) => {
    mutate(offline ? 'Make Offline' : 'Restore Media', (p) => {
      for (const a of p.assets) if (ids.includes(a.id)) a.offline = offline;
    });
  };

  const newAdjustmentLayer = () => {
    mutate('New Adjustment Layer', (p) => {
      p.assets.push({
        id: uid('asset'), name: '調整レイヤー', type: 'adjustment',
        sourcePath: '(adjustment)', duration: 60, width: 1920, height: 1080,
        label: 'purple', binId: currentBinId, metadata: {},
      });
    });
  };

  // ---------- menus ----------

  const newItemMenu = (e: React.MouseEvent) => openMenu(e, [
    { label: 'シーケンス…', onClick: () => setUi({ openDialog: 'new-sequence' }) },
    { label: '調整レイヤー', onClick: newAdjustmentLayer },
  ]);

  const assetMenu = (e: React.MouseEvent, a: MediaAsset) => {
    if (!selectedIds.includes(a.id)) setUi({ selectedAssetIds: [a.id] });
    const ids = targetIds(a);
    const items: CtxItem[] = [
      {
        label: 'ソースモニターで開く',
        disabled: a.type === 'adjustment',
        onClick: () => openAsset(a),
      },
      { separator: true },
      { label: '新規ビン', onClick: () => createBin(NEW_BIN_NAME, currentBinId) },
      { label: '新規シーケンス…', onClick: () => setUi({ openDialog: 'new-sequence' }) },
      { separator: true },
      {
        label: '名前を変更…',
        onClick: () => {
          const name = window.prompt('名前を変更', a.name);
          if (name && name.trim()) renameAsset(a.id, name.trim());
        },
      },
      { label: '複製', onClick: () => duplicateAssets(ids) },
      { label: '削除', onClick: () => { deleteAssets(ids); setUi({ selectedAssetIds: [] }); } },
      { separator: true },
      {
        label: 'ラベル',
        children: LABEL_KEYS.map((color) => ({
          label: LABEL_NAMES_JA[color],
          checked: a.label === color,
          onClick: () => setAssetLabel(ids, color),
        })),
      },
      {
        label: 'プロキシ',
        children: [{
          label: 'プロキシの切り替え',
          checked: !!a.proxyEnabled,
          onClick: () => toggleProxy(ids),
        }],
      },
      { separator: true },
      a.offline
        ? { label: '復元', onClick: () => setOffline(ids, false) }
        : { label: 'オフラインにする', onClick: () => setOffline(ids, true) },
    ];
    openMenu(e, items);
  };

  const binMenu = (e: React.MouseEvent, b: Bin) => {
    openMenu(e, [
      { label: 'ビンを開く', onClick: () => setUi({ currentBinId: b.id, projectViewMode: 'icon' }) },
      { label: '新規ビン', onClick: () => createBin(NEW_BIN_NAME, b.id) },
      { separator: true },
      {
        label: '名前を変更…',
        onClick: () => {
          const name = window.prompt('ビン名を変更', b.name);
          if (name && name.trim()) renameBin(b.id, name.trim());
        },
      },
      { label: '削除', onClick: () => deleteBin(b.id) },
    ]);
  };

  const backgroundMenu = (e: React.MouseEvent) => {
    openMenu(e, [
      { label: '新規ビン', onClick: () => createBin(NEW_BIN_NAME, currentBinId) },
      { label: '新規シーケンス…', onClick: () => setUi({ openDialog: 'new-sequence' }) },
      { label: '新規調整レイヤー', onClick: newAdjustmentLayer },
      { separator: true },
      { label: '読み込み…', onClick: () => fileRef.current?.click() },
    ]);
  };

  // ---------- drag out ----------

  const dragStartAsset = (e: React.DragEvent, a: MediaAsset) => {
    e.dataTransfer.setData('application/x-wvs-asset', JSON.stringify({ assetId: a.id }));
    e.dataTransfer.effectAllowed = 'copyMove';
    if (hasThumb(a)) {
      const cv = getAssetThumbnail(project, a, 1, 80, 45, sharedMedia);
      if (cv) e.dataTransfer.setDragImage(cv, 40, 22);
    }
  };

  // ---------- footer count ----------

  const itemCount = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = project.assets;
    if (viewMode === 'icon') list = list.filter((a) => (a.binId ?? null) === currentBinId);
    if (q) list = list.filter((a) => a.name.toLowerCase().includes(q));
    return list.length;
  }, [project.assets, viewMode, currentBinId, query]);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%', fontSize: 11, color: 'var(--text)' }}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }
      }}
      onDrop={(e) => {
        if (e.dataTransfer.files.length > 0) {
          e.preventDefault();
          void importFiles(e.dataTransfer.files);
        }
      }}
    >
      <style>{`
        .wvs-projrow:hover { background: var(--bg-hover); }
        .wvs-projrow.sel { background: var(--accent); color: #fff; }
        .wvs-projrow.sel:hover { background: var(--accent); }
        .wvs-projcard:hover { background: var(--bg-hover); }
      `}</style>

      {/* header row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 3, padding: '3px 6px',
          borderBottom: '1px solid var(--border)', flex: 'none',
        }}
      >
        <input
          type="text"
          placeholder="検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ flex: 1, minWidth: 40, height: 20, fontSize: 11 }}
        />
        <button
          className={`icon-btn ${viewMode === 'list' ? 'toggled' : ''}`}
          title="リスト表示"
          onClick={() => setUi({ projectViewMode: 'list' })}
        >
          <svg width="13" height="13" viewBox="0 0 16 16">
            <path d="M2 3.5h12M2 8h12M2 12.5h12" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        </button>
        <button
          className={`icon-btn ${viewMode === 'icon' ? 'toggled' : ''}`}
          title="アイコン表示"
          onClick={() => setUi({ projectViewMode: 'icon' })}
        >
          <svg width="13" height="13" viewBox="0 0 16 16">
            <rect x="2" y="2" width="5" height="5" fill="currentColor" />
            <rect x="9" y="2" width="5" height="5" fill="currentColor" />
            <rect x="2" y="9" width="5" height="5" fill="currentColor" />
            <rect x="9" y="9" width="5" height="5" fill="currentColor" />
          </svg>
        </button>
        <button
          className="icon-btn"
          title="新規ビン"
          onClick={() => createBin(NEW_BIN_NAME, currentBinId)}
        >
          <svg width="14" height="14" viewBox="0 0 16 16">
            <path
              fill="none" stroke="currentColor"
              d="M1.5 4C1.5 3.2 2.2 2.5 3 2.5h2.7l1.4 1.8h6c.8 0 1.4.6 1.4 1.4v6.3c0 .8-.6 1.5-1.4 1.5H3c-.8 0-1.5-.7-1.5-1.5V4z"
            />
            <path d="M8 7v4M6 9h4" stroke="currentColor" strokeWidth="1.2" />
          </svg>
        </button>
        <button className="icon-btn" title="新規項目" onClick={newItemMenu} style={{ width: 'auto', padding: '0 5px', gap: 2 }}>
          <svg width="11" height="11" viewBox="0 0 16 16">
            <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.8" />
          </svg>
          <span style={{ fontSize: 8 }}>▾</span>
        </button>
        <button
          className="btn"
          title="読み込み"
          style={{ height: 20, padding: '0 8px', fontSize: 11, whiteSpace: 'nowrap', flex: 'none' }}
          onClick={() => fileRef.current?.click()}
        >
          読み込み
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) void importFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {/* body */}
      <div
        style={{ flex: 1, minHeight: 0, overflow: 'auto' }}
        onContextMenu={backgroundMenu}
        onClick={(e) => {
          if (e.target === e.currentTarget) setUi({ selectedAssetIds: [] });
        }}
      >
        {viewMode === 'list' ? (
          <ListView
            project={project}
            query={query}
            sort={sort}
            onSort={(key: SortKey) => setSort((s) => (s.key === key ? { key, asc: !s.asc } : { key, asc: true }))}
            openBins={openBins}
            onToggleBin={(id) => setUi({ openBins: { ...openBins, [id]: !openBins[id] } })}
            selectedIds={selectedIds}
            onSelectAsset={selectAsset}
            onOpenAsset={openAsset}
            onAssetMenu={assetMenu}
            onBinMenu={binMenu}
            onDragStartAsset={dragStartAsset}
            onDropAssetOnBin={(assetId, binId) => moveAssetToBin(assetId, binId)}
            visibleOrder={visibleOrder}
          />
        ) : (
          <IconView
            project={project}
            query={query}
            currentBinId={currentBinId}
            onNavigate={(binId) => setUi({ currentBinId: binId, selectedAssetIds: [] })}
            selectedIds={selectedIds}
            onSelectAsset={selectAsset}
            onOpenAsset={openAsset}
            onAssetMenu={assetMenu}
            onBinMenu={binMenu}
            onDragStartAsset={dragStartAsset}
            onDropAssetOnBin={(assetId, binId) => moveAssetToBin(assetId, binId)}
            visibleOrder={visibleOrder}
          />
        )}
      </div>

      {/* footer */}
      <div
        style={{
          flex: 'none', height: 20, display: 'flex', alignItems: 'center',
          padding: '0 8px', borderTop: '1px solid var(--border)',
          color: 'var(--text-dim)', fontSize: 10, gap: 8,
        }}
      >
        <span>{itemCount}項目</span>
        {selectedIds.length > 0 && <span>{selectedIds.length}項目を選択</span>}
      </div>

      {menuEl}
    </div>
  );
}
