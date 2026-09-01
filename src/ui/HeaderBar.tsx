import { useStudio } from '../state/store';

/** `id` is what lives in ui.workspace (English); `label` is the visible name. */
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

/** Header bar — 読み込み / 編集 / 書き出し modes + project name + workspaces. */
export default function HeaderBar() {
  const name = useStudio((s) => s.project.name);
  const workspace = useStudio((s) => s.ui.workspace);
  const setWorkspace = useStudio((s) => s.setWorkspace);
  const setUi = useStudio((s) => s.setUi);
  const exportOpen = useStudio((s) => s.ui.exportOpen);

  return (
    <div className="header-bar" style={{ position: 'relative' }}>
      <div className={`header-mode ${!exportOpen ? '' : ''}`} onClick={() => setUi({ homeOpen: true })} title="ホーム">⌂</div>
      <div className="header-mode">読み込み</div>
      <div className={`header-mode ${!exportOpen ? 'active' : ''}`} onClick={() => setUi({ exportOpen: false })}>編集</div>
      <div className={`header-mode ${exportOpen ? 'active' : ''}`} onClick={() => setUi({ exportOpen: true })}>書き出し</div>
      <div className="header-title">{name}</div>
      <div style={{ flex: 1 }} />
      <select
        value={workspace}
        onChange={(e) => setWorkspace(e.target.value)}
        title="ワークスペース"
        style={{ marginRight: 8 }}
      >
        {WORKSPACES.map((w) => <option key={w.id} value={w.id}>{w.label}</option>)}
      </select>
      <button className="btn primary" style={{ padding: '4px 14px', borderRadius: 14 }} onClick={() => setUi({ exportOpen: true })}>
        共有
      </button>
    </div>
  );
}
