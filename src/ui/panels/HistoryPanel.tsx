// ============================================================
// History panel — visualizes the undo/redo stacks. Clicking an
// entry jumps the project to that point in the edit history.
// ============================================================

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useStudio } from '../../state/store';

// ============================================================
// Store history labels stay ENGLISH (they are action ids shared
// across the app). Only the History panel converts them to
// Japanese for display; unknown labels fall through unchanged.
// ============================================================

const LABEL_JA: Record<string, string> = {
  // timeline edits
  'Move': '移動',
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
  'Link': 'リンク',
  'Unlink': 'リンク解除',
  'Group': 'グループ化',
  'Ungroup': 'グループ解除',
  'Nest': 'ネスト',
  'Add Clip': 'クリップを追加',
  'Label': 'ラベル',
  // tracks
  'Add Track': 'トラックを追加',
  'Add Tracks': 'トラックを追加',
  'Delete Track': 'トラックを削除',
  'Delete Tracks': 'トラックを削除',
  'Modify Track': 'トラックを変更',
  'Resize Track': 'トラックの高さを変更',
  'Mute Track': 'トラックをミュート',
  'Solo Track': 'トラックをソロ',
  // markers
  'Add Marker': 'マーカーを追加',
  'Edit Marker': 'マーカーを編集',
  'Move Marker': 'マーカーを移動',
  'Clear Marker': 'マーカーを消去',
  'Clear All Markers': 'すべてのマーカーを消去',
  // transitions
  'Apply Transition': 'トランジションを適用',
  'Remove Transition': 'トランジションを削除',
  'Modify Transition': 'トランジションを変更',
  // properties / keyframes / effects
  'Set Property': 'プロパティを設定',
  'Toggle Animation': 'アニメーションの切り替え',
  'Add Keyframe': 'キーフレームを追加',
  'Remove Keyframe': 'キーフレームを削除',
  'Move Keyframe': 'キーフレームを移動',
  'Keyframe Interpolation': 'キーフレーム補間',
  'Remove Effect': 'エフェクトを削除',
  'Toggle Effect': 'エフェクトの切り替え',
  'Reorder Effects': 'エフェクトの並べ替え',
  'Blend Mode': '描画モード',
  'Uniform Scale': '縦横比を固定',
  'Lumetri Color': 'Lumetriカラー',
  'Vignette': 'ビネット',
  // masks
  'Add Mask': 'マスクを追加',
  'Remove Mask': 'マスクを削除',
  'Modify Mask': 'マスクを変更',
  // graphics / text
  'New Text': '新規テキスト',
  'New Shape': '新規シェイプ',
  'Add Text Layer': 'テキストレイヤーを追加',
  'Edit Text': 'テキストを編集',
  'Delete Text Layer': 'テキストレイヤーを削除',
  'Align Center': '中央揃え',
  'Apply Template': 'テンプレートを適用',
  'Reorder Layers': 'レイヤーの並べ替え',
  // captions
  'Add Caption': 'キャプションを追加',
  'Edit Caption': 'キャプションを編集',
  'Delete Caption': 'キャプションを削除',
  'Caption Style': 'キャプションスタイル',
  'Toggle Captions': 'キャプションの表示切り替え',
  'Import Captions': 'キャプションを読み込み',
  // audio
  'Track Volume': 'トラックボリューム',
  'Track Pan': 'トラックパン',
  'Clip Volume': 'クリップボリューム',
  'Clip Pan': 'クリップパン',
  'Loudness Auto-Match': 'ラウドネスの自動一致',
  'Reduce Noise': 'ノイズを軽減',
  'Reduce Reverb': 'リバーブを軽減',
  'Enhance Speech': '会話を強調',
  'Ducking': 'ダッキング',
  // project
  'Import Media': 'メディアを読み込み',
  'New Bin': '新規ビン',
  'New Item': '新規項目',
  'New Adjustment Layer': '新規調整レイヤー',
  'Rename': '名前を変更',
  'Rename Bin': 'ビン名を変更',
  'Delete Bin': 'ビンを削除',
  'Move to Bin': 'ビンへ移動',
  'New Sequence': '新規シーケンス',
  'Rename Project': 'プロジェクト名を変更',
  'Make Offline': 'オフラインにする',
  'Toggle Proxy': 'プロキシの切り替え',
  'Preferences': '環境設定',
  'Project Settings': 'プロジェクト設定',
  'Sequence Settings': 'シーケンス設定',
};

/** Audio-type suffixes used by the Essential Sound presets. */
const AUDIO_TYPE_JA: Record<string, string> = {
  Dialogue: '会話',
  Music: 'ミュージック',
  SFX: '効果音',
  Ambience: 'アンビエンス',
};

/**
 * English store label → Japanese display text.
 * Dynamic labels (`Apply <effect>`, `Reset <effect>`, `Audio Type: <type>`)
 * carry an already-Japanese effect name from `getEffectDef().name`.
 */
function labelJa(label: string): string {
  const exact = LABEL_JA[label];
  if (exact) return exact;
  if (label.startsWith('Apply ')) return `${label.slice(6)}を適用`;
  if (label.startsWith('Reset ')) return `${label.slice(6)}をリセット`;
  if (label.startsWith('Audio Type: ')) {
    const t = label.slice(12);
    return `オーディオタイプ: ${AUDIO_TYPE_JA[t] ?? t}`;
  }
  return label;
}

function iconFor(label: string): string {
  const l = label.toLowerCase();
  if (l.includes('move')) return '✥';
  if (l.includes('razor')) return '✂';
  if (l.includes('trim') || l.includes('roll') || l.includes('slip') || l.includes('slide')) return '⇥';
  if (l.includes('delete') || l.includes('remove') || l.includes('clear')) return '✕';
  if (l.includes('effect') || l.includes('apply')) return 'ƒ';
  if (l.includes('keyframe') || l.includes('animation')) return '◆';
  if (l.includes('caption')) return '𝄐';
  if (l.includes('volume') || l.includes('pan') || l.includes('mute') || l.includes('solo') || l.includes('audio') || l.includes('ducking')) return '♪';
  if (l.includes('add') || l.includes('new') || l.includes('insert') || l.includes('paste') || l.includes('import') || l.includes('duplicate')) return '＋';
  if (l.includes('text') || l.includes('graphic')) return 'T';
  if (l.includes('speed') || l.includes('rate')) return '⏱';
  return '•';
}

const rowStyle = (kind: 'past' | 'current' | 'future'): CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px',
  fontSize: 11, cursor: kind === 'current' ? 'default' : 'pointer',
  color: kind === 'future' ? 'var(--text-disabled)' : kind === 'current' ? 'var(--text-bright)' : 'var(--text)',
  background: kind === 'current' ? 'rgba(45,140,235,0.18)' : 'transparent',
  borderLeft: kind === 'current' ? '2px solid var(--accent)' : '2px solid transparent',
  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
});

export default function HistoryPanel() {
  const past = useStudio((s) => s.past);
  const future = useStudio((s) => s.future);
  const undo = useStudio((s) => s.undo);
  const redo = useStudio((s) => s.redo);
  const currentRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' });
  }, [past.length, future.length]);

  /** Jump back so the project matches the state *before* past[i] was applied. */
  const jumpToPast = (i: number) => {
    const steps = past.length - i;
    for (let k = 0; k < steps; k++) undo();
  };
  /** Re-apply redo steps up to and including future[j]. */
  const jumpToFuture = (j: number) => {
    for (let k = 0; k <= j; k++) redo();
  };
  const clearHistory = () => useStudio.setState({ past: [], future: [] });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', gap: 6, padding: '5px 8px', flex: 'none',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-panel-header)', alignItems: 'center',
      }}>
        <button className="btn" disabled={past.length === 0} onClick={() => undo()}>取り消し</button>
        <button className="btn" disabled={future.length === 0} onClick={() => redo()}>やり直し</button>
        <button
          className="btn"
          style={{ marginLeft: 'auto', whiteSpace: 'nowrap' }}
          disabled={past.length === 0 && future.length === 0}
          onClick={clearHistory}
        >
          ヒストリーを消去
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 0' }}>
        {past.length === 0 && future.length === 0 && (
          <div style={{ padding: 12, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.6 }}>
            まだ編集はありません。操作を行うとここに表示されます。
          </div>
        )}
        {past.map((entry, i) => (
          <div
            key={`p${i}`}
            style={rowStyle('past')}
            title={`${past.length - i}ステップ取り消し`}
            onClick={() => jumpToPast(i)}
          >
            <span style={{ width: 14, textAlign: 'center', color: 'var(--text-dim)', flex: 'none' }}>{iconFor(entry.label)}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{labelJa(entry.label)}</span>
          </div>
        ))}
        <div ref={currentRef} style={rowStyle('current')}>
          <span style={{ width: 14, textAlign: 'center', flex: 'none' }}>▶</span>
          <span>現在の状態</span>
        </div>
        {future.map((entry, j) => (
          <div
            key={`f${j}`}
            style={rowStyle('future')}
            title={`${j + 1}ステップやり直し`}
            onClick={() => jumpToFuture(j)}
          >
            <span style={{ width: 14, textAlign: 'center', flex: 'none' }}>{iconFor(entry.label)}</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{labelJa(entry.label)}</span>
          </div>
        ))}
      </div>
      <div style={{
        flex: 'none', padding: '4px 8px', fontSize: 10, color: 'var(--text-dim)',
        borderTop: '1px solid var(--border)',
      }}>
        取り消し{past.length}件 · やり直し{future.length}件
      </div>
    </div>
  );
}
