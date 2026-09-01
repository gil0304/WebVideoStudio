import { useStudio, type ToolId } from '../state/store';

const TOOLS: { id: ToolId; icon: string; name: string; key: string }[] = [
  { id: 'selection', icon: '▲', name: '選択ツール', key: 'V' },
  { id: 'track-select-forward', icon: '⇥', name: '前方トラック選択ツール', key: 'A' },
  { id: 'ripple', icon: '⇤', name: 'リップルツール', key: 'B' },
  { id: 'rolling', icon: '⇹', name: 'ローリングツール', key: 'N' },
  { id: 'rate-stretch', icon: '⧗', name: 'レート調整ツール', key: 'R' },
  { id: 'razor', icon: '✂', name: 'レーザーツール', key: 'C' },
  { id: 'slip', icon: '⇆', name: 'スリップツール', key: 'Y' },
  { id: 'slide', icon: '⇄', name: 'スライドツール', key: 'U' },
  { id: 'pen', icon: '✒', name: 'ペンツール', key: 'P' },
  { id: 'hand', icon: '✋', name: '手のひらツール', key: 'H' },
  { id: 'zoom', icon: '🔍', name: 'ズームツール', key: 'Z' },
  { id: 'type', icon: 'T', name: '横書き文字ツール', key: 'T' },
];

/** Vertical tool palette next to the timeline. */
export default function ToolsPalette() {
  const tool = useStudio((s) => s.ui.tool);
  const setTool = useStudio((s) => s.setTool);
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 1, padding: '4px 2px',
      background: 'var(--bg-panel)', borderRight: '1px solid var(--border)', overflowY: 'auto',
    }}>
      {TOOLS.map((t) => (
        <button
          key={t.id}
          className={`icon-btn ${tool === t.id ? 'toggled' : ''}`}
          title={`${t.name} (${t.key})`}
          onClick={() => setTool(t.id)}
          style={{ fontSize: 12 }}
        >
          {t.icon}
        </button>
      ))}
    </div>
  );
}
