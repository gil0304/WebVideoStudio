// ============================================================
// Menu helpers — toasts, file pickers, project scaffolding and
// compound commands shared by the menu bar and dialogs.
// ============================================================

import { useStudio, getActiveSequence, getPlayhead } from '../../state/store';
import type { Marker, Sequence, VideoProject } from '../../model/types';
import { findClip } from '../../model/types';
import { uid } from '../../model/ids';
import { makeTrack, defaultTextLayer } from '../../model/clipFactory';
import { snapToFrame } from '../../engine/timecode';
import { saveProject, exportProjectFile } from '../../state/persistence';
import { captionsToSrt, captionsToVtt, downloadBlob } from '../../engine/exporter';

// ---------------- toast ----------------

let toastTimer: number | undefined;

/** Transient status message rendered by App (auto-clears after 2.5 s). */
export function toast(msg: string): void {
  useStudio.getState().setUi({ statusMessage: msg });
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    const s = useStudio.getState();
    if (s.ui.statusMessage === msg) s.setUi({ statusMessage: null });
  }, 2500);
}

// ---------------- file pickers ----------------

export function pickFiles(accept: string, multiple: boolean, cb: (files: FileList) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.onchange = () => {
    if (input.files && input.files.length > 0) cb(input.files);
  };
  input.click();
}

export function openProjectPicker(): void {
  pickFiles('.json,application/json', false, (files) => {
    void (async () => {
      try {
        const json: unknown = JSON.parse(await files[0].text());
        const p = json as VideoProject;
        if (!p || !Array.isArray(p.sequences) || p.sequences.length === 0 || !Array.isArray(p.assets)) {
          throw new Error('invalid');
        }
        useStudio.getState().loadProject(p, { homeOpen: false });
        toast(`「${p.name || '無題のプロジェクト'}」を開きました`);
      } catch {
        toast('ファイルを開けません。有効なプロジェクト(.json)ではありません');
      }
    })();
  });
}

export function importMediaPicker(): void {
  pickFiles('video/*,audio/*,image/*,.srt,.vtt,.json', true, (files) => {
    void useStudio.getState().importFiles(files);
    toast(`${files.length}個のファイルを読み込み中…`);
  });
}

// ---------------- project lifecycle ----------------

/** Minimal blank project: 1 empty 1920×1080 @ 30 sequence with 3V/3A tracks. */
export function freshProject(name = '無題のプロジェクト'): VideoProject {
  const seq: Sequence = {
    id: uid('seq'),
    name: 'シーケンス01',
    width: 1920,
    height: 1080,
    frameRate: 30,
    videoTracks: [makeTrack('video', 'V1'), makeTrack('video', 'V2'), makeTrack('video', 'V3')],
    audioTracks: [makeTrack('audio', 'A1'), makeTrack('audio', 'A2'), makeTrack('audio', 'A3')],
    markers: [],
    captions: [],
    captionsVisible: true,
    audioSampleRate: 48000,
    captionStyle: {
      fontFamily: '"Helvetica Neue", Arial, sans-serif',
      fontSize: 44,
      color: '#ffffff',
      bgColor: '#000000',
      bgOpacity: 0.55,
      position: 'bottom',
      edge: 'shadow',
    },
  };
  return {
    id: uid('proj'),
    name,
    assets: [],
    bins: [],
    sequences: [seq],
    settings: {
      autoSaveIntervalSec: 30,
      autoSaveEnabled: true,
      renderer: 'Canvas 2D(GPU合成)',
      scratchDisk: 'ブラウザーストレージ(IndexedDB)',
      location: 'ローカルプロジェクト',
    },
    revision: 0,
  };
}

export function newProject(skipConfirm = false): void {
  if (!skipConfirm && !window.confirm('新規プロジェクトを作成しますか。現在のプロジェクトは置き換えられます(自動保存された最新のコピーは残ります)。')) return;
  useStudio.getState().loadProject(freshProject(), { homeOpen: false });
  toast('新規プロジェクトを作成しました');
}

export function saveNow(): void {
  const s = useStudio.getState();
  void saveProject(s.project, s.ui.activeSequenceId).then(() => {
    useStudio.getState().setUi({ lastSaveTime: Date.now() });
    toast('プロジェクトを保存しました');
  }).catch(() => toast('保存に失敗しました。ブラウザーストレージを利用できません'));
}

export function saveCopy(): void {
  exportProjectFile(useStudio.getState().project);
  toast('プロジェクトファイルをダウンロードしました');
}

export function revertProject(): void {
  if (!window.confirm('デモプロジェクトに復帰しますか。変更内容はすべて失われます。')) return;
  useStudio.getState().resetToDemo();
  toast('デモプロジェクトに復帰しました');
}

// ---------------- caption export ----------------

export function exportCaptions(kind: 'srt' | 'vtt'): void {
  const s = useStudio.getState();
  const seq = getActiveSequence(s);
  if (seq.captions.length === 0) { toast('このシーケンスにはキャプションがありません'); return; }
  const text = kind === 'srt' ? captionsToSrt(seq) : captionsToVtt(seq);
  downloadBlob(new Blob([text], { type: kind === 'srt' ? 'text/plain' : 'text/vtt' }), `${seq.name}.${kind}`);
  toast(`キャプションを書き出しました(.${kind})`);
}

// ---------------- edit commands ----------------

export function cutSelection(): void {
  const s = useStudio.getState();
  if (s.ui.selection.length === 0) return;
  s.copyClips(s.ui.selection);
  s.deleteClips(s.ui.selection, false);
}

/** Apply the first clipboard clip's motion/opacity/effects to all selected clips. */
export function pasteAttributes(): void {
  const s = useStudio.getState();
  const src = s.ui.clipboard?.[0];
  if (!src || s.ui.selection.length === 0) return;
  const sel = [...s.ui.selection];
  const activeId = s.ui.activeSequenceId;
  s.mutate('Paste Attributes', (draft) => {
    const seq = draft.sequences.find((q) => q.id === activeId) ?? draft.sequences[0];
    if (!seq) return;
    for (const id of sel) {
      const f = findClip(seq, id);
      if (!f) continue;
      const c = f.clip;
      c.position = structuredClone(src.position);
      c.scale = structuredClone(src.scale);
      c.scaleWidth = structuredClone(src.scaleWidth);
      c.uniformScale = src.uniformScale;
      c.rotation = structuredClone(src.rotation);
      c.opacity = structuredClone(src.opacity);
      c.effects = src.effects.map((e) => {
        const ne = structuredClone(e);
        ne.id = uid('fx');
        return ne;
      });
    }
  });
  toast(`${sel.length}個のクリップに属性をペーストしました`);
}

// ---------------- graphics ----------------

export function newShape(kind: 'rect' | 'ellipse'): void {
  const s = useStudio.getState();
  const t = getPlayhead(s);
  const name = kind === 'rect' ? '長方形' : '楕円形';
  s.addGraphicClip(t, name);
  const s2 = useStudio.getState();
  const seq = getActiveSequence(s2);
  const track = seq.videoTracks[seq.videoTracks.length - 1];
  const t0 = snapToFrame(Math.max(0, t), 30);
  const created = track?.clips.find((c) => c.name === name && Math.abs(c.start - t0) < 1e-4);
  if (!created) return;
  const clipId = created.id;
  const activeId = s2.ui.activeSequenceId;
  s2.mutate('New Shape', (draft) => {
    const seqD = draft.sequences.find((q) => q.id === activeId) ?? draft.sequences[0];
    const f = seqD ? findClip(seqD, clipId) : null;
    if (!f) return;
    f.clip.textLayers = [defaultTextLayer({
      kind,
      name,
      text: undefined,
      x: seq.width / 2,
      y: seq.height / 2,
      width: 560,
      height: kind === 'rect' ? 320 : 560,
      fill: '#4da3ff',
      strokeColor: '#ffffff',
      strokeWidth: 0,
    })];
  });
}

// ---------------- markers ----------------

export function nearestMarker(seq: Sequence, time: number, within = 0.3): Marker | null {
  let best: Marker | null = null;
  let bestD = within;
  for (const m of seq.markers) {
    const d = Math.abs(m.time - time);
    if (d <= bestD) { best = m; bestD = d; }
  }
  return best;
}
