// ============================================================
// Audio Mixer — "Audio Track Mixer" (track gain/pan/M/S) and
// "Audio Clip Mixer" (the clip under the playhead on each audio
// track). Real level meters from the audio engine analysers.
// ============================================================

import { useState } from 'react';
import { useStudio, useActiveSequence, usePlayhead, getActiveSequence } from '../../state/store';
import type { Track } from '../../model/types';
import { clipAt } from '../../model/types';
import { evalNum } from '../../engine/keyframes';
import { ChannelStrip, formatDb, DB_MIN, DB_MAX } from './audio/ChannelStrip';

const clampDb = (v: number) => Math.max(DB_MIN, Math.min(DB_MAX, v));

function trackNow(trackId: string): Track | undefined {
  const st = useStudio.getState();
  const seq = getActiveSequence(st);
  return [...seq.videoTracks, ...seq.audioTracks].find((t) => t.id === trackId);
}

// ---------------- Track mixer ----------------

function TrackMixer() {
  const seq = useActiveSequence();
  const playing = useStudio((s) => s.ui.playing);
  const patchTrack = useStudio((s) => s.patchTrack);
  const begin = useStudio((s) => s.beginTransaction);
  const end = useStudio((s) => s.endTransaction);

  return (
    <>
      {seq.audioTracks.map((track) => (
        <ChannelStrip
          key={track.id}
          name={track.name}
          playing={playing}
          meterSource={track.id}
          muted={track.muted}
          solo={track.solo}
          onMute={() => patchTrack(track.id, { muted: !track.muted }, 'Mute Track')}
          onSolo={() => patchTrack(track.id, { solo: !track.solo }, 'Solo Track')}
          pan={{
            value: track.pan,
            onStart: () => begin('Track Pan'),
            onChange: (v) => patchTrack(track.id, { pan: Math.round(v) }, 'Track Pan', true),
            onEnd: () => {
              const cur = trackNow(track.id);
              if (cur) patchTrack(track.id, { pan: cur.pan }, 'Track Pan');
              end();
            },
          }}
          fader={{
            db: track.volume,
            onStart: () => begin('Track Volume'),
            onChange: (db) => patchTrack(track.id, { volume: clampDb(db) }, 'Track Volume', true),
            onEnd: () => {
              const cur = trackNow(track.id);
              if (cur) patchTrack(track.id, { volume: cur.volume }, 'Track Volume');
              end();
            },
          }}
          dbText={formatDb(track.volume)}
        />
      ))}
      <ChannelStrip
        name="マスター"
        playing={playing}
        meterSource="master"
        pan={null}
        fader={null}
        dbText="0.0 dB"
      />
    </>
  );
}

// ---------------- Clip mixer ----------------

function ClipMixer() {
  const seq = useActiveSequence();
  const playhead = usePlayhead();
  const playing = useStudio((s) => s.ui.playing);
  const setPropValue = useStudio((s) => s.setPropValue);
  const patchTrack = useStudio((s) => s.patchTrack);
  const begin = useStudio((s) => s.beginTransaction);
  const end = useStudio((s) => s.endTransaction);

  return (
    <>
      {seq.audioTracks.map((track) => {
        const clip = clipAt(track, playhead);
        const local = clip ? playhead - clip.start : 0;
        const db = clip ? evalNum(clip.volume, local) : 0;
        const pan = clip ? evalNum(clip.pan, local) : 0;
        return (
          <ChannelStrip
            key={track.id}
            name={clip ? clip.name : track.name}
            playing={playing}
            meterSource={track.id}
            disabled={!clip}
            muted={track.muted}
            solo={track.solo}
            onMute={() => patchTrack(track.id, { muted: !track.muted }, 'Mute Track')}
            onSolo={() => patchTrack(track.id, { solo: !track.solo }, 'Solo Track')}
            pan={clip ? {
              value: pan,
              onStart: () => begin('Clip Pan'),
              onChange: (v) => setPropValue(clip.id, { kind: 'intrinsic', key: 'pan' }, Math.round(v), local),
              onEnd: () => end(),
            } : { value: 0, onChange: () => {} }}
            fader={clip ? {
              db,
              onStart: () => begin('Clip Volume'),
              onChange: (v) => setPropValue(clip.id, { kind: 'intrinsic', key: 'volume' }, clampDb(v), local),
              onEnd: () => end(),
            } : { db: DB_MIN, onChange: () => {} }}
            dbText={clip ? formatDb(db) : '—'}
          />
        );
      })}
      <ChannelStrip
        name="マスター"
        playing={playing}
        meterSource="master"
        pan={null}
        fader={null}
        dbText="0.0 dB"
      />
    </>
  );
}

// ---------------- panel ----------------

const subTab = (active: boolean): React.CSSProperties => ({
  padding: '4px 8px', fontSize: 11, cursor: 'pointer', border: 'none',
  whiteSpace: 'nowrap', flex: 'none',
  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
  color: active ? 'var(--text-bright)' : 'var(--text-dim)',
  background: 'transparent',
});

export default function AudioMixerPanel() {
  const [tab, setTab] = useState<'track' | 'clip'>('track');
  const seqName = useActiveSequence().name;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{
        display: 'flex', alignItems: 'center', flex: 'none', overflow: 'hidden',
        borderBottom: '1px solid var(--border)', background: 'var(--bg-panel-header)',
      }}>
        <button style={subTab(tab === 'track')} onClick={() => setTab('track')}>オーディオトラックミキサー</button>
        <button style={subTab(tab === 'clip')} onClick={() => setTab('clip')}>オーディオクリップミキサー</button>
        <span style={{
          marginLeft: 'auto', paddingLeft: 6, paddingRight: 8, fontSize: 10, color: 'var(--text-dim)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{seqName}</span>
      </div>
      <div style={{
        flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', gap: 6,
        padding: 8, alignItems: 'flex-start',
      }}>
        {tab === 'track' ? <TrackMixer /> : <ClipMixer />}
      </div>
    </div>
  );
}
