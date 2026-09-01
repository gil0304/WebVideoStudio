import MenuBar from './ui/MenuBar';
import HeaderBar from './ui/HeaderBar';
import ToolsPalette from './ui/ToolsPalette';
import { SplitPane } from './ui/layout/SplitPane';
import { PanelGroup } from './ui/layout/PanelGroup';
import { useGlobalShortcuts } from './ui/shortcuts';
import { useStudio } from './state/store';

import SourceMonitor from './ui/panels/SourceMonitor';
import ProgramMonitor from './ui/panels/ProgramMonitor';
import ProjectPanel from './ui/panels/ProjectPanel';
import EffectsPanel from './ui/panels/EffectsPanel';
import EffectControlsPanel from './ui/panels/EffectControlsPanel';
import LumetriPanel from './ui/panels/LumetriPanel';
import EssentialSoundPanel from './ui/panels/EssentialSoundPanel';
import CaptionsPanel from './ui/panels/CaptionsPanel';
import TextPanel from './ui/panels/TextPanel';
import TimelinePanel from './ui/panels/TimelinePanel';
import HistoryPanel from './ui/panels/HistoryPanel';
import AudioMixerPanel from './ui/panels/AudioMixerPanel';
import ExportDialog from './ui/panels/ExportDialog';

export default function App() {
  useGlobalShortcuts();
  const workspace = useStudio((s) => s.ui.workspace);
  const statusMessage = useStudio((s) => s.ui.statusMessage);
  const seqName = useStudio((s) => {
    const seq = s.project.sequences.find((sq) => sq.id === s.ui.activeSequenceId);
    return seq?.name ?? '';
  });

  const monitorRow = (
    <SplitPane
      direction="h"
      initial={0.5}
      a={<PanelGroup panels={[
        { name: 'ソースモニター', content: <SourceMonitor /> },
        { name: 'オーディオクリップミキサー', content: <AudioMixerPanel /> },
      ]} />}
      b={<PanelGroup panels={[
        { name: `プログラム: ${seqName}`, content: <ProgramMonitor /> },
      ]} />}
    />
  );

  const controlsPanels = [
    { name: 'エフェクトコントロール', content: <EffectControlsPanel /> },
    { name: 'Lumetriカラー', content: <LumetriPanel /> },
    { name: 'エッセンシャルサウンド', content: <EssentialSoundPanel /> },
    { name: 'キャプション', content: <CaptionsPanel /> },
    { name: 'エッセンシャルグラフィックス', content: <TextPanel /> },
    { name: 'ヒストリー', content: <HistoryPanel /> },
  ];
  // ui.workspace holds the English workspace ids; only the display names are Japanese.
  const controlsActive =
    workspace === 'Color' ? 'Lumetriカラー'
    : workspace === 'Audio' ? 'エッセンシャルサウンド'
    : workspace === 'Captions' ? 'キャプション'
    : workspace === 'Graphics' ? 'エッセンシャルグラフィックス'
    : 'エフェクトコントロール';

  const bottomRow = (
    <SplitPane
      direction="h"
      initial={0.34}
      a={<PanelGroup panels={[
        { name: 'プロジェクト', content: <ProjectPanel /> },
        { name: 'エフェクト', content: <EffectsPanel /> },
      ]} initialActive={workspace === 'Effects' ? 'エフェクト' : 'プロジェクト'} key={`p_${workspace}`} />}
      b={
        <SplitPane
          direction="h"
          initial={0.42}
          a={<PanelGroup panels={controlsPanels} initialActive={controlsActive} key={`c_${workspace}`} />}
          b={
            <div className="panel-group">
              <div className="panel-tabs">
                <div className="panel-tab active">{seqName}</div>
                <button className="panel-menu-btn">≡</button>
              </div>
              <div className="panel-body" style={{ display: 'flex' }}>
                <ToolsPalette />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TimelinePanel />
                </div>
              </div>
            </div>
          }
        />
      }
    />
  );

  return (
    <div className="app-root">
      <MenuBar />
      <HeaderBar />
      <div className="app-workspace">
        <SplitPane direction="v" initial={0.45} a={monitorRow} b={bottomRow} />
      </div>
      <ExportDialog />
      {statusMessage && <div className="status-toast">{statusMessage}</div>}
    </div>
  );
}
