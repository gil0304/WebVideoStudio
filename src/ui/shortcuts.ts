// Global keyboard shortcuts (spec §15 + transport). The menus
// implementation may extend this map.
import { useEffect } from 'react';
import { useStudio, getPlayhead, type ToolId } from '../state/store';

const TOOL_KEYS: Record<string, ToolId> = {
  v: 'selection', b: 'ripple', n: 'rolling', r: 'rate-stretch', c: 'razor',
  y: 'slip', u: 'slide', p: 'pen', h: 'hand', z: 'zoom', t: 'type',
};

export function useGlobalShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
      const s = useStudio.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();

      if (mod && key === 'z') { e.preventDefault(); if (e.shiftKey) s.redo(); else s.undo(); return; }
      if (mod && key === 'c') { e.preventDefault(); s.copyClips(s.ui.selection); return; }
      if (mod && key === 'v') { e.preventDefault(); s.pasteClips(); return; }
      if (mod && key === 'd') { e.preventDefault(); s.duplicateClips(s.ui.selection); return; }
      if (mod && key === 'a') { e.preventDefault(); s.selectAllClips(); return; }
      if (mod && key === 'k') { e.preventDefault(); s.razorAtTime(getPlayhead(s), true); return; }
      if (mod && key === 'm') { e.preventDefault(); s.setUi({ exportOpen: true }); return; }
      if (mod) return;

      switch (key) {
        case ' ': e.preventDefault(); s.togglePlay(); return;
        case 'k': s.setPlaying(false); return;
        case 'l': s.setPlaying(true); return;
        case 'j': s.setPlaying(false); s.stepFrames(-5); return;
        case 'arrowleft': e.preventDefault(); s.stepFrames(e.shiftKey ? -5 : -1); return;
        case 'arrowright': e.preventDefault(); s.stepFrames(e.shiftKey ? 5 : 1); return;
        case 'arrowup': e.preventDefault(); s.goToPrevEdit(); return;
        case 'arrowdown': e.preventDefault(); s.goToNextEdit(); return;
        case 'home': s.goToStart(); return;
        case 'end': s.goToEnd(); return;
        case 'i': s.setSeqIn(getPlayhead(s)); return;
        case 'o': s.setSeqOut(getPlayhead(s)); return;
        case 'm': s.addMarker(); return;
        case 'a': s.setTool(e.shiftKey ? 'track-select-backward' : 'track-select-forward'); return;
        case 's': s.setSnapping(!s.ui.snapping); return;
        case 'delete':
        case 'backspace':
          e.preventDefault();
          s.deleteClips(s.ui.selection, e.shiftKey);
          return;
        case '=': case '+': s.setZoom(s.ui.zoom * 1.4); return;
        case '-': s.setZoom(s.ui.zoom / 1.4); return;
      }
      const tool = TOOL_KEYS[key];
      if (tool) s.setTool(tool);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
