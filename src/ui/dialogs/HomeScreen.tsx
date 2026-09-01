// ============================================================
// Home screen — full-screen cover shown when ui.homeOpen. Lets
// the user resume the current project, start a new one, open a
// saved .json project or restore the demo.
// ============================================================

import type { CSSProperties, ReactNode } from 'react';
import { useStudio } from '../../state/store';
import { newProject, openProjectPicker, toast } from '../menus/menuUtils';

const cardBase: CSSProperties = {
  border: '1px solid var(--border-light)',
  borderRadius: 8,
  padding: '18px 20px',
  width: 210,
  minHeight: 120,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  cursor: 'pointer',
  background: 'var(--bg-panel)',
  transition: 'border-color 120ms, background 120ms',
};

function Card({ title, subtitle, accent, onClick, icon }: {
  title: string; subtitle: string; accent?: boolean; onClick: () => void; icon: ReactNode;
}) {
  return (
    <div
      style={{
        ...cardBase,
        ...(accent ? { border: '1px solid var(--accent)', background: 'rgba(45,140,235,0.08)' } : {}),
      }}
      onClick={onClick}
      onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--bg-hover)'; }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = accent ? 'rgba(45,140,235,0.08)' : 'var(--bg-panel)';
      }}
    >
      <div style={{ fontSize: 22, lineHeight: '24px' }}>{icon}</div>
      <div style={{ fontWeight: 700, color: 'var(--text-bright)', fontSize: 13, lineHeight: 1.35 }}>{title}</div>
      <div style={{ color: 'var(--text-dim)', fontSize: 11, lineHeight: 1.4 }}>{subtitle}</div>
    </div>
  );
}

export default function HomeScreen() {
  const projectName = useStudio((s) => s.project.name);
  const seqCount = useStudio((s) => s.project.sequences.length);
  const assetCount = useStudio((s) => s.project.assets.length);
  const lastSave = useStudio((s) => s.ui.lastSaveTime);
  const setUi = useStudio((s) => s.setUi);
  const resetToDemo = useStudio((s) => s.resetToDemo);

  const closeHome = () => setUi({ homeOpen: false });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1950,
        background: 'linear-gradient(160deg, #17181c 0%, #101013 60%, #0c0d12 100%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 6, color: 'var(--text-bright)' }}>
        WEB <span style={{ color: 'var(--accent-bright)' }}>VIDEO</span> STUDIO
      </div>
      <div style={{ marginTop: 8, color: 'var(--text-dim)', letterSpacing: 1 }}>
        ブラウザーネイティブのノンリニア編集ソフト
      </div>

      <div style={{ display: 'flex', gap: 16, marginTop: 42, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 980 }}>
        <Card
          accent
          icon={<span style={{ color: 'var(--accent-bright)' }}>▶</span>}
          title={`${projectName}(現在開いています)`}
          subtitle={`${seqCount}シーケンス · ${assetCount}項目 — 編集を続ける`}
          onClick={closeHome}
        />
        <Card
          icon={<span style={{ color: 'var(--text-bright)' }}>＋</span>}
          title="新規プロジェクト"
          subtitle="空の1080p30シーケンスが1つだけの新しいプロジェクト"
          onClick={() => newProject(true)}
        />
        <Card
          icon={<span style={{ color: 'var(--text-bright)' }}>⌸</span>}
          title="プロジェクトを開く…"
          subtitle="保存済みの.wvs.jsonプロジェクトファイルを読み込む"
          onClick={() => openProjectPicker()}
        />
        <Card
          icon={<span style={{ color: 'var(--warning)' }}>⟲</span>}
          title="デモプロジェクトを復元"
          subtitle="CITY PULSE — 東京ナイトプロモを一式再構築"
          onClick={() => { resetToDemo(); closeHome(); toast('デモプロジェクトを復元しました'); }}
        />
      </div>

      <div style={{ marginTop: 44, width: 620, maxWidth: '86vw' }}>
        <div style={{ fontSize: 11, letterSpacing: 1.5, color: 'var(--text-dim)', marginBottom: 8 }}>
          最近使用したプロジェクト
        </div>
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
            border: '1px solid var(--border-light)', borderRadius: 6, background: 'var(--bg-panel)', cursor: 'pointer',
          }}
          onClick={closeHome}
        >
          <span style={{ color: 'var(--accent-bright)' }}>◨</span>
          <span style={{ color: 'var(--text-bright)', fontWeight: 600 }}>{projectName}</span>
          <span style={{ marginLeft: 'auto', color: 'var(--text-dim)', fontSize: 11 }}>
            {lastSave > 0 ? `${new Date(lastSave).toLocaleTimeString()}に保存` : 'ブラウザーストレージに自動保存済み'}
          </span>
        </div>
      </div>

      <div style={{ position: 'absolute', bottom: 22, color: 'var(--text-dim)', fontSize: 11, letterSpacing: 0.4, textAlign: 'center', padding: '0 16px' }}>
        操作体系を研究した独自実装です。Adobe社およびAdobe Premiere Proとは関係ありません。
        デモ映像はすべてブラウザー内でプロシージャル生成しています。
      </div>
    </div>
  );
}
