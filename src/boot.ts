// App bootstrap: restore the saved project (or open the demo),
// preload media, wire up autosave.
import { useStudio } from './state/store';
import { loadSavedProject, saveProject, loadAllMediaBlobs } from './state/persistence';
import { audioEngine } from './engine/audioEngine';

export async function boot(): Promise<void> {
  const saved = await loadSavedProject().catch(() => null);
  if (saved?.project?.sequences?.length) {
    await loadAllMediaBlobs(saved.project);
    useStudio.getState().loadProject(saved.project, saved.activeSequenceId
      ? { activeSequenceId: saved.activeSequenceId }
      : undefined);
  }
  // Preload audio buffers in the background so first playback is instant.
  const s = useStudio.getState();
  const seq = s.project.sequences.find((sq) => sq.id === s.ui.activeSequenceId) ?? s.project.sequences[0];
  void audioEngine.prepareSequence(s.project, seq).catch(() => undefined);

  // Autosave: debounce on edits + interval safety net.
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSavedRevision = useStudio.getState().project.revision;
  const doSave = async () => {
    const st = useStudio.getState();
    if (st.project.revision === lastSavedRevision) return;
    st.setUi({ saving: true });
    try {
      await saveProject(st.project, st.ui.activeSequenceId);
      lastSavedRevision = st.project.revision;
      st.setUi({ saving: false, lastSaveTime: Date.now() });
    } catch {
      st.setUi({ saving: false });
    }
  };
  useStudio.subscribe((state, prev) => {
    if (state.project !== prev.project && !state.transaction) {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(doSave, 1500);
    }
  });
  setInterval(doSave, Math.max(10, useStudio.getState().project.settings.autoSaveIntervalSec) * 1000);

  // In-browser test harness (spec §34): open with ?selftest=1
  if (new URLSearchParams(location.search).get('selftest') === '1') {
    setTimeout(() => {
      void import('./selftest').then((m) => m.runSelfTest());
    }, 800);
  }
}
