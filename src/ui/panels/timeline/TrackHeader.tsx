// ============================================================
// Timeline track header — targeting / source patch / output /
// lock / sync-lock toggles, M/S + live meter for audio tracks,
// and a bottom-edge drag handle to resize the track.
// ============================================================

import React, { useEffect, useRef } from 'react';
import type { Track } from '../../../model/types';
import { useStudio } from '../../../state/store';
import { audioEngine } from '../../../engine/audioEngine';
import { useContextMenu } from '../../components/ContextMenu';
import { MAX_TRACK_H, MIN_TRACK_H } from './utils';

// ---------------- tiny icons (inline SVG, no emoji) ----------------

function EyeIcon({ on }: { on: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.1">
      <path d="M1 6c1.7-2.2 3.4-3.3 5-3.3S9.3 3.8 11 6c-1.7 2.2-3.4 3.3-5 3.3S2.7 8.2 1 6Z" />
      {on && <circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" />}
    </svg>
  );
}

function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.2">
      <rect x="2.5" y="5.5" width="7" height="5" rx="1" fill={locked ? 'currentColor' : 'none'} />
      <path d={locked ? 'M4 5.5V4a2 2 0 0 1 4 0v1.5' : 'M4 5.5V4a2 2 0 0 1 4 0'} />
    </svg>
  );
}

// ---------------- toggle button ----------------

function Toggle({ active, title, onClick, children, activeBg, activeColor }: {
  active: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  activeBg?: string;
  activeColor?: string;
}) {
  return (
    <div
      title={title}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        width: 18, height: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 2, fontSize: 9, fontWeight: 700, cursor: 'pointer', flex: 'none', lineHeight: 1,
        color: active ? (activeColor ?? 'var(--text-bright)') : 'var(--text-disabled)',
        background: active ? (activeBg ?? 'var(--bg-hover)') : 'transparent',
      }}
    >
      {children}
    </div>
  );
}

// ---------------- live audio meter ----------------

function TrackMeter({ trackId }: { trackId: string }) {
  const playing = useStudio((s) => s.ui.playing);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    if (!playing) {
      bar.style.height = '0%';
      return;
    }
    let raf = 0;
    let level = 0;
    const loop = () => {
      const meters = audioEngine.getMeters();
      const rms = meters.tracks[trackId] ?? 0;
      // smooth decay, punchy attack
      level = Math.max(Math.min(1, rms * 1.7), level * 0.9);
      bar.style.height = `${(level * 100).toFixed(1)}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); bar.style.height = '0%'; };
  }, [playing, trackId]);

  return (
    <div style={{
      position: 'absolute', right: 4, top: 4, bottom: 8, width: 4,
      background: 'var(--bg-inset)', borderRadius: 2, overflow: 'hidden',
    }}>
      <div
        ref={barRef}
        style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: '0%',
          background: 'linear-gradient(to top, #3fae5f 0%, #3fae5f 60%, #c7b45a 80%, #e05555 100%)',
        }}
      />
    </div>
  );
}

// ---------------- header ----------------

export const TrackHeader = React.memo(function TrackHeader({ track, top, height }: {
  track: Track; top: number; height: number;
}) {
  const { openMenu, menuEl } = useContextMenu();
  const isVideo = track.type === 'video';
  const patch = (p: Partial<Track>, label: string) => useStudio.getState().patchTrack(track.id, p, label);

  const startResize = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = track.height;
    useStudio.getState().beginTransaction('Resize Track');
    const move = (ev: PointerEvent) => {
      const h = Math.round(Math.max(MIN_TRACK_H, Math.min(MAX_TRACK_H, startH + (ev.clientY - startY))));
      useStudio.getState().patchTrack(track.id, { height: h }, 'Resize Track', true);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      useStudio.getState().endTransaction();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  return (
    <div
      onContextMenu={(e) => {
        const st = useStudio.getState();
        openMenu(e, [
          { label: 'ビデオトラックを追加', onClick: () => st.addTrack('video') },
          { label: 'オーディオトラックを追加', onClick: () => st.addTrack('audio') },
          { separator: true },
          { label: `トラック${track.name}を削除`, onClick: () => st.deleteTrack(track.id) },
        ]);
      }}
      style={{
        position: 'absolute', left: 0, right: 0, top, height,
        background: track.targeted ? '#2b2f33' : 'var(--bg-track-header)',
        borderBottom: '1px solid var(--border)',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '3px 4px', paddingRight: isVideo ? 4 : 12 }}>
        {/* source patch */}
        <Toggle
          active={track.sourcePatch}
          title="ソースパッチ(インサート/上書きの対象)"
          onClick={() => patch({ sourcePatch: !track.sourcePatch }, 'Source Patch')}
          activeBg="#324252"
        >
          <svg width="9" height="9" viewBox="0 0 9 9"><path d="M1 1h4l3 3.5L5 8H1Z" fill="currentColor" /></svg>
        </Toggle>
        {/* target badge */}
        <div
          title="ターゲットトラックの切り替え"
          onClick={(e) => { e.stopPropagation(); patch({ targeted: !track.targeted }, 'Track Targeting'); }}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            minWidth: 24, padding: '1px 4px', textAlign: 'center', borderRadius: 3,
            fontSize: 10, fontWeight: 700, cursor: 'pointer', flex: 'none', lineHeight: '13px',
            background: track.targeted ? '#41556a' : 'transparent',
            color: track.targeted ? 'var(--text-bright)' : 'var(--text-dim)',
            border: `1px solid ${track.targeted ? 'var(--border-light)' : '#333'}`,
          }}
        >
          {track.name}
        </div>

        {isVideo ? (
          <Toggle
            active={track.enabled}
            title="トラック出力の切り替え"
            onClick={() => patch({ enabled: !track.enabled }, 'Toggle Track Output')}
          >
            <EyeIcon on={track.enabled} />
          </Toggle>
        ) : (
          <>
            <Toggle
              active={track.muted}
              title="トラックをミュート"
              onClick={() => patch({ muted: !track.muted }, 'Mute Track')}
              activeBg="#2f6b43"
              activeColor="#e6f5ea"
            >
              M
            </Toggle>
            <Toggle
              active={track.solo}
              title="トラックをソロ"
              onClick={() => patch({ solo: !track.solo }, 'Solo Track')}
              activeBg="#8a7d2c"
              activeColor="#fbf6d8"
            >
              S
            </Toggle>
          </>
        )}

        <Toggle
          active={track.syncLocked}
          title="同期ロック"
          onClick={() => patch({ syncLocked: !track.syncLocked }, 'Sync Lock')}
        >
          <span style={{ fontSize: 10 }}>&#8645;</span>
        </Toggle>
        <Toggle
          active={track.locked}
          title="トラックのロック切り替え"
          onClick={() => patch({ locked: !track.locked }, 'Track Lock')}
          activeColor="var(--warning)"
        >
          <LockIcon locked={track.locked} />
        </Toggle>
      </div>

      {!isVideo && <TrackMeter trackId={track.id} />}

      {/* resize handle */}
      <div
        onPointerDown={startResize}
        title="ドラッグしてトラックの高さを変更"
        style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, cursor: 'row-resize' }}
      />
      {menuEl}
    </div>
  );
});
