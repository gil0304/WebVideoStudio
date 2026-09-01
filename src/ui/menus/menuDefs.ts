// ============================================================
// Menu bar definitions — one builder per top-level menu. Built
// fresh each time a menu opens so enabled/checked states track
// the live store.
//
// Menu titles are the Japanese display strings and double as the
// switch keys for buildMenu(). Values written into the store
// (workspace ids, dialog ids, mutate labels) stay English.
// ============================================================

import type { StudioState } from '../../state/store';
import { getActiveSequence, getPlayhead } from '../../state/store';
import { findClip, getAsset, sequenceDuration } from '../../model/types';
import { exportProjectFile } from '../../state/persistence';
import {
  cutSelection, exportCaptions, importMediaPicker, nearestMarker, newProject,
  newShape, openProjectPicker, pasteAttributes, revertProject, saveCopy, saveNow, toast,
} from './menuUtils';
import { historyLabelJa } from './historyLabelsJa';

export interface MenuEntry {
  label?: string;
  separator?: boolean;
  disabled?: boolean;
  checked?: boolean;
  shortcut?: string;
  tooltip?: string;
  onClick?: () => void;
  children?: MenuEntry[];
}

/** Leading entry is the application menu (product name — not translated). */
export const APP_MENU_TITLE = 'Web Video Studio';

export const MENU_TITLES = [
  APP_MENU_TITLE, 'ファイル', '編集', 'クリップ', 'シーケンス', 'マーカー', 'グラフィック', 'ウィンドウ', 'ヘルプ',
] as const;

/** `id` is the value stored in ui.workspace (English); `label` is what the user sees. */
const WORKSPACES: { id: string; label: string }[] = [
  { id: 'Assembly', label: 'アセンブリ' },
  { id: 'Editing', label: '編集' },
  { id: 'Color', label: 'カラー' },
  { id: 'Effects', label: 'エフェクト' },
  { id: 'Audio', label: 'オーディオ' },
  { id: 'Graphics', label: 'グラフィック' },
  { id: 'Captions', label: 'キャプション' },
  { id: 'Review', label: 'レビュー' },
];

const PANELS = [
  'プロジェクト', 'エフェクト', 'エフェクトコントロール', 'Lumetriカラー', 'エッセンシャルサウンド',
  'エッセンシャルグラフィックス', 'キャプション', 'ヒストリー', 'ソースモニター', 'プログラムモニター',
  'オーディオクリップミキサー', 'タイムライン', 'ツール',
];

const NOT_IMPLEMENTED = 'この研究用再現版では未実装です';

const sep: MenuEntry = { separator: true };

export function buildMenu(name: string, s: StudioState): MenuEntry[] {
  const seq = getActiveSequence(s);
  const playhead = getPlayhead(s);
  const sel = s.ui.selection;
  const open = (dialog: string, payload: unknown = null) => () => s.setUi({ openDialog: dialog, dialogPayload: payload });

  switch (name) {
    case APP_MENU_TITLE:
      return [
        { label: 'Web Video Studioについて…', onClick: open('about') },
        sep,
        { label: '環境設定…', onClick: open('preferences') },
        { label: 'キーボードショートカット…', onClick: open('keyboard-shortcuts') },
      ];

    case 'ファイル':
      return [
        {
          label: '新規', children: [
            { label: 'プロジェクト…', onClick: () => newProject() },
            { label: 'シーケンス…', shortcut: '⌘N', onClick: open('new-sequence') },
          ],
        },
        { label: 'プロジェクトを開く…', shortcut: '⌘O', onClick: () => openProjectPicker() },
        { label: 'プロジェクトを閉じる', onClick: () => s.setUi({ homeOpen: true }) },
        sep,
        { label: '保存', shortcut: '⌘S', onClick: () => saveNow() },
        { label: '別名で保存…', shortcut: '⇧⌘S', onClick: () => saveCopy() },
        { label: 'コピーを保存…', onClick: () => saveCopy() },
        { label: '復帰', onClick: () => revertProject() },
        sep,
        { label: '読み込み…', shortcut: '⌘I', onClick: () => importMediaPicker() },
        {
          label: '書き出し', children: [
            { label: 'メディア…', shortcut: '⌘M', onClick: () => s.setUi({ exportOpen: true }) },
            sep,
            { label: 'キャプション(SRT)…', disabled: seq.captions.length === 0, onClick: () => exportCaptions('srt') },
            { label: 'キャプション(VTT)…', disabled: seq.captions.length === 0, onClick: () => exportCaptions('vtt') },
            sep,
            { label: 'プロジェクトアーカイブ…', onClick: () => { exportProjectFile(s.project); toast('プロジェクトアーカイブをダウンロードしました'); } },
          ],
        },
        sep,
        { label: 'プロジェクト設定…', onClick: open('project-settings') },
        sep,
        { label: '終了', onClick: () => s.setUi({ homeOpen: true }) },
      ];

    case '編集': {
      const undoLabel = s.past.length > 0 ? `取り消し: ${historyLabelJa(s.past[s.past.length - 1].label)}` : '取り消し';
      const redoLabel = s.future.length > 0 ? `やり直し: ${historyLabelJa(s.future[0].label)}` : 'やり直し';
      const hasSel = sel.length > 0;
      const hasClipboard = (s.ui.clipboard?.length ?? 0) > 0;
      return [
        { label: undoLabel, shortcut: '⌘Z', disabled: s.past.length === 0, onClick: () => s.undo() },
        { label: redoLabel, shortcut: '⇧⌘Z', disabled: s.future.length === 0, onClick: () => s.redo() },
        sep,
        { label: 'カット', shortcut: '⌘X', disabled: !hasSel, onClick: () => cutSelection() },
        { label: 'コピー', shortcut: '⌘C', disabled: !hasSel, onClick: () => s.copyClips(sel) },
        { label: 'ペースト', shortcut: '⌘V', disabled: !hasClipboard, onClick: () => s.pasteClips() },
        { label: 'インサートペースト', disabled: true, tooltip: NOT_IMPLEMENTED },
        { label: '属性をペースト…', disabled: !hasClipboard || !hasSel, onClick: () => pasteAttributes() },
        sep,
        { label: '消去', shortcut: '⌫', disabled: !hasSel, onClick: () => s.deleteClips(sel, false) },
        { label: 'リップル削除', shortcut: '⇧⌫', disabled: !hasSel, onClick: () => s.deleteClips(sel, true) },
        { label: '複製', shortcut: '⌘D', disabled: !hasSel, onClick: () => s.duplicateClips(sel) },
        sep,
        { label: 'すべてを選択', shortcut: '⌘A', onClick: () => s.selectAllClips() },
        { label: '選択を解除', disabled: !hasSel, onClick: () => s.clearSelection() },
        sep,
        { label: 'キーボードショートカット…', onClick: open('keyboard-shortcuts') },
        { label: '環境設定…', onClick: open('preferences') },
      ];
    }

    case 'クリップ': {
      const first = sel.length > 0 ? findClip(seq, sel[0]) : null;
      const firstAsset = first ? getAsset(s.project, first.clip.assetId) : undefined;
      const selFound = sel.map((id) => findClip(seq, id)).filter((f) => f !== null);
      const canLink = selFound.length === 2
        && selFound.some((f) => f.track.type === 'video')
        && selFound.some((f) => f.track.type === 'audio')
        && !selFound[0].clip.linkedClipId && !selFound[1].clip.linkedClipId;
      const canUnlink = selFound.some((f) => !!f.clip.linkedClipId);
      const canUngroup = selFound.some((f) => !!f.clip.groupId);
      const none = !first;
      return [
        {
          label: '名前を変更…', disabled: none, onClick: () => {
            if (!first) return;
            const name = window.prompt('クリップ名:', first.clip.name);
            if (name != null && name.trim() !== '') s.patchClip(first.clip.id, { name: name.trim() }, 'Rename Clip');
          },
        },
        {
          label: 'オフラインにする', disabled: none || !firstAsset, checked: !!firstAsset?.offline, onClick: () => {
            if (!firstAsset) return;
            const assetId = firstAsset.id;
            s.mutate('Make Offline', (draft) => {
              const a = draft.assets.find((x) => x.id === assetId);
              if (a) a.offline = !a.offline;
            });
          },
        },
        { label: '変更', disabled: true, tooltip: NOT_IMPLEMENTED },
        sep,
        {
          label: 'ビデオオプション', disabled: none, children: [
            { label: 'フレーム保持', disabled: none, onClick: () => { if (first) s.setClipSpeed(first.clip.id, 0, false); } },
          ],
        },
        { label: 'オーディオオプション', disabled: true, tooltip: NOT_IMPLEMENTED },
        { label: '速度・デュレーション…', shortcut: '⌘R', disabled: none, onClick: open('speed-duration', sel[0]) },
        sep,
        { label: '有効', disabled: none, checked: first?.clip.enabled ?? false, onClick: () => s.toggleClipEnabled(sel) },
        {
          label: 'リンク', disabled: !canLink, onClick: () => {
            if (canLink) s.linkClips(selFound[0].clip.id, selFound[1].clip.id);
          },
        },
        {
          label: 'リンク解除', disabled: !canUnlink, onClick: () => {
            for (const f of selFound) if (f.clip.linkedClipId) s.unlinkClip(f.clip.id);
          },
        },
        { label: 'グループ化', disabled: sel.length < 2, onClick: () => s.groupClips(sel) },
        { label: 'グループ解除', disabled: !canUngroup, onClick: () => s.ungroupClips(sel) },
        {
          label: 'ネスト…', disabled: none, onClick: () => {
            const name = window.prompt('ネストシーケンス名:', 'ネストシーケンス');
            if (name != null && name.trim() !== '') s.nestClips(sel, name.trim());
          },
        },
        sep,
        { label: '同期', disabled: true, tooltip: NOT_IMPLEMENTED },
        { label: 'クリップを結合…', disabled: true, tooltip: NOT_IMPLEMENTED },
        { label: 'マルチカメラ', disabled: true, tooltip: NOT_IMPLEMENTED },
      ];
    }

    case 'シーケンス': {
      const targetedV = seq.videoTracks.find((t) => t.targeted) ?? seq.videoTracks[0];
      const videoSel = sel.filter((id) => findClip(seq, id)?.track.type === 'video');
      const audioSel = sel.filter((id) => findClip(seq, id)?.track.type === 'audio');
      return [
        { label: 'シーケンス設定…', onClick: open('sequence-settings') },
        sep,
        { label: 'インからアウトのエフェクトをレンダリング', onClick: () => toast('リアルタイムエンジンのため、レンダリングは不要です') },
        { label: 'インからアウトをレンダリング', onClick: () => toast('リアルタイムエンジンのため、レンダリングは不要です') },
        sep,
        { label: 'トラックを追加…', onClick: open('add-tracks') },
        { label: 'トラックを削除…', onClick: open('delete-tracks') },
        sep,
        {
          label: 'ビデオトランジションを適用', disabled: videoSel.length === 0, onClick: () => {
            for (const id of videoSel) s.addTransition(id, 'in', 'cross-dissolve', 1);
          },
        },
        {
          label: 'オーディオトランジションを適用', disabled: audioSel.length === 0, onClick: () => {
            for (const id of audioSel) s.addTransition(id, 'in', 'constant-power', 1);
          },
        },
        { label: '編集点を追加', shortcut: '⌘K', onClick: () => s.razorAtTime(playhead, false) },
        { label: 'すべてのトラックに編集点を追加', shortcut: '⇧⌘K', onClick: () => s.razorAtTime(playhead, true) },
        { label: 'トリミング編集', disabled: true, tooltip: NOT_IMPLEMENTED },
        { label: '一致フレーム', disabled: true, tooltip: NOT_IMPLEMENTED },
        sep,
        { label: 'リフト', onClick: () => s.liftRange() },
        { label: '抽出', onClick: () => s.extractRange() },
        { label: '間隔を詰める', disabled: !targetedV, onClick: () => { if (targetedV) s.closeGap(targetedV.id, playhead); } },
        sep,
        { label: 'ズームイン', shortcut: '=', onClick: () => s.setZoom(s.ui.zoom * 1.4) },
        { label: 'ズームアウト', shortcut: '-', onClick: () => s.setZoom(s.ui.zoom / 1.4) },
      ];
    }

    case 'マーカー': {
      const near = nearestMarker(seq, playhead);
      const inSet = s.ui.seqIn[s.ui.activeSequenceId] != null;
      const outSet = s.ui.seqOut[s.ui.activeSequenceId] != null;
      return [
        { label: 'マーカーを追加', shortcut: 'M', onClick: () => s.addMarker() },
        { label: '次のマーカーへ移動', disabled: seq.markers.length === 0, onClick: () => s.goToNextMarker() },
        { label: '前のマーカーへ移動', disabled: seq.markers.length === 0, onClick: () => s.goToPrevMarker() },
        { label: '選択したマーカーを消去', disabled: !near, onClick: () => { if (near) s.removeMarker(near.id); } },
        {
          label: 'すべてのマーカーを消去', disabled: seq.markers.length === 0, onClick: () => {
            const activeId = s.ui.activeSequenceId;
            s.mutate('Clear All Markers', (draft) => {
              const q = draft.sequences.find((x) => x.id === activeId);
              if (q) q.markers = [];
            });
          },
        },
        { label: 'マーカーを編集…', disabled: !near, onClick: () => { if (near) s.setUi({ openDialog: 'marker-edit', dialogPayload: near.id }); } },
        sep,
        { label: 'インをマーク', shortcut: 'I', onClick: () => s.setSeqIn(playhead) },
        { label: 'アウトをマーク', shortcut: 'O', onClick: () => s.setSeqOut(playhead) },
        { label: 'インを消去', disabled: !inSet, onClick: () => s.setSeqIn(null) },
        { label: 'アウトを消去', disabled: !outSet, onClick: () => s.setSeqOut(null) },
        { label: 'インとアウトを消去', disabled: !inSet && !outSet, onClick: () => { s.setSeqIn(null); s.setSeqOut(null); } },
      ];
    }

    case 'グラフィック': {
      const selLayerId = s.ui.selectedTextLayerId;
      // find the clip that owns the selected text layer
      let layerClipId: string | null = null;
      if (selLayerId) {
        for (const t of seq.videoTracks) {
          for (const c of t.clips) {
            if (c.textLayers?.some((l) => l.id === selLayerId)) { layerClipId = c.id; break; }
          }
          if (layerClipId) break;
        }
      }
      return [
        { label: 'テキストレイヤーを追加', onClick: () => s.addGraphicClip(playhead, '新規テキスト') },
        {
          label: '新規シェイプ', children: [
            { label: '長方形', onClick: () => newShape('rect') },
            { label: '楕円形', onClick: () => newShape('ellipse') },
          ],
        },
        sep,
        {
          label: '水平方向に中央揃え', disabled: !layerClipId, onClick: () => {
            if (layerClipId && selLayerId) s.patchTextLayer(layerClipId, selLayerId, { x: seq.width / 2 }, 'Align Center');
          },
        },
        {
          label: '垂直方向に中央揃え', disabled: !layerClipId, onClick: () => {
            if (layerClipId && selLayerId) s.patchTextLayer(layerClipId, selLayerId, { y: seq.height / 2 }, 'Align Center');
          },
        },
        sep,
        { label: 'キャプションをグラフィックにアップグレード', disabled: true, tooltip: NOT_IMPLEMENTED },
        { label: 'モーショングラフィックステンプレートをインストール…', disabled: true, tooltip: NOT_IMPLEMENTED },
      ];
    }

    case 'ウィンドウ':
      return [
        {
          label: 'ワークスペース', children: [
            ...WORKSPACES.map((w): MenuEntry => ({
              label: w.label, checked: s.ui.workspace === w.id, onClick: () => s.setWorkspace(w.id),
            })),
            sep,
            { label: '保存されたレイアウトにリセット', onClick: () => s.setWorkspace('Editing') },
          ],
        },
        sep,
        ...PANELS.map((p): MenuEntry => ({
          label: p, checked: true, onClick: () => toast('このワークスペースではパネルはドッキング済みです'),
        })),
      ];

    case 'ヘルプ':
      return [
        { label: 'Web Video Studioについて…', onClick: open('about') },
        { label: '対応機能一覧…', onClick: open('spec-coverage') },
        sep,
        { label: 'キーボードショートカット…', onClick: open('keyboard-shortcuts') },
        sep,
        {
          label: 'シーケンス情報', onClick: () =>
            toast(`${seq.name}: ${seq.width}×${seq.height} / ${seq.frameRate}fps / ${Math.round(sequenceDuration(seq) * 10) / 10}秒`),
        },
      ];

    default:
      return [];
  }
}
