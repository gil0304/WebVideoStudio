// ============================================================
// History label → Japanese display names.
//
// Store mutation labels (`mutate(label, …)` / `beginTransaction(label)`)
// stay in ENGLISH on purpose — they are internal identifiers. Every
// place that shows a history label to the user (History panel, the
// Edit menu's Undo / Redo entries) converts them through this table.
// Unknown labels fall through unchanged.
// ============================================================

export const HISTORY_LABELS_JA: Record<string, string> = {
  // --- timeline edits ---
  'Move': '移動',
  'Move Clip': 'クリップを移動',
  'Trim': 'トリミング',
  'Ripple Trim': 'リップルトリミング',
  'Rolling Edit': 'ローリング編集',
  'Slip': 'スリップ',
  'Slide': 'スライド',
  'Razor': 'カット',
  'Delete': '削除',
  'Ripple Delete': 'リップル削除',
  'Lift': 'リフト',
  'Extract': '抽出',
  'Close Gap': '間隔を詰める',
  'Duplicate': '複製',
  'Paste': 'ペースト',
  'Paste Attributes': '属性をペースト',
  'Insert': 'インサート',
  'Overwrite': '上書き',
  'Speed/Duration': '速度・デュレーション',
  'Rate Stretch': 'レート調整',
  'Enable/Disable': '有効・無効',
  'Modify Clip': 'クリップを変更',
  'Rename Clip': 'クリップ名を変更',
  'Make Offline': 'オフラインにする',
  'Label': 'ラベル',
  'Link': 'リンク',
  'Unlink': 'リンク解除',
  'Group': 'グループ化',
  'Ungroup': 'グループ解除',
  'Nest': 'ネスト',
  'Add Clip': 'クリップを追加',

  // --- tracks ---
  'Add Track': 'トラックを追加',
  'Add Tracks': 'トラックを追加',
  'Delete Track': 'トラックを削除',
  'Delete Tracks': 'トラックを削除',
  'Modify Track': 'トラックを変更',
  'Resize Track': 'トラックの高さを変更',
  'Track Lock': 'トラックのロック',
  'Sync Lock': '同期ロック',
  'Mute Track': 'トラックをミュート',
  'Solo Track': 'トラックをソロ',
  'Track Volume': 'トラックボリューム',
  'Track Pan': 'トラックパン',
  'Track Targeting': 'ターゲットトラック',
  'Source Patch': 'ソースパッチ',
  'Toggle Track Output': 'トラック出力の切り替え',

  // --- markers ---
  'Add Marker': 'マーカーを追加',
  'Edit Marker': 'マーカーを編集',
  'Move Marker': 'マーカーを移動',
  'Clear Marker': 'マーカーを消去',
  'Clear All Markers': 'すべてのマーカーを消去',

  // --- transitions ---
  'Apply Transition': 'トランジションを適用',
  'Remove Transition': 'トランジションを削除',
  'Modify Transition': 'トランジションを変更',

  // --- effects / keyframes ---
  'Set Property': 'プロパティを設定',
  'Toggle Animation': 'アニメーションの切り替え',
  'Add Keyframe': 'キーフレームを追加',
  'Remove Keyframe': 'キーフレームを削除',
  'Move Keyframe': 'キーフレームを移動',
  'Keyframe Interpolation': 'キーフレーム補間',
  'Remove Effect': 'エフェクトを削除',
  'Toggle Effect': 'エフェクトの切り替え',
  'Reorder Effects': 'エフェクトの並べ替え',
  'Add Mask': 'マスクを追加',
  'Remove Mask': 'マスクを削除',
  'Modify Mask': 'マスクを変更',
  'Blend Mode': '描画モード',
  'Uniform Scale': '縦横比を固定',
  'Lumetri Color': 'Lumetriカラー',
  'Vignette': 'ビネット',

  // --- graphics / text ---
  'New Text': '新規テキスト',
  'New Shape': '新規シェイプ',
  'Add Text Layer': 'テキストレイヤーを追加',
  'Edit Text': 'テキストを編集',
  'Move Text': 'テキストを移動',
  'Scale Text': 'テキストを拡大縮小',
  'Resize Shape': 'シェイプのサイズを変更',
  'Align Center': '中央に整列',
  'Delete Text Layer': 'テキストレイヤーを削除',
  'Reorder Layers': 'レイヤーの並べ替え',
  'Apply Template': 'テンプレートを適用',

  // --- captions ---
  'Add Caption': 'キャプションを追加',
  'Edit Caption': 'キャプションを編集',
  'Delete Caption': 'キャプションを削除',
  'Caption Style': 'キャプションスタイル',
  'Toggle Captions': 'キャプションの表示切り替え',
  'Import Captions': 'キャプションを読み込み',

  // --- audio ---
  'Ducking': 'ダッキング',
  'Loudness Auto-Match': 'ラウドネスの自動一致',

  // --- project panel ---
  'Import Media': 'メディアを読み込み',
  'New Bin': '新規ビン',
  'New Adjustment Layer': '新規調整レイヤー',
  'Rename': '名前を変更',
  'Rename Bin': 'ビン名を変更',
  'Delete Bin': 'ビンを削除',
  'Move to Bin': 'ビンへ移動',
  'Toggle Proxy': 'プロキシの切り替え',

  // --- project / sequence ---
  'New Sequence': '新規シーケンス',
  'Sequence Settings': 'シーケンス設定',
  'Project Settings': 'プロジェクト設定',
  'Preferences': '環境設定',
  'Rename Project': 'プロジェクト名を変更',
};

/**
 * Japanese display text for a stored history label.
 * `Apply <effect name>` is built dynamically by the store from the
 * (already Japanese) effect definition name, so handle that prefix too.
 */
export function historyLabelJa(label: string): string {
  const hit = HISTORY_LABELS_JA[label];
  if (hit) return hit;
  if (label.startsWith('Apply ')) return `${label.slice('Apply '.length)}を適用`;
  return label;
}
