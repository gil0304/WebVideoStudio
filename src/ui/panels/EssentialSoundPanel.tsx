// ============================================================
// Essential Sound — audio-type presets (Dialogue/Music/SFX/
// Ambience), loudness auto-match from real samples, simplified
// repair tools and music ducking keyframe generation.
// ============================================================

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import { useStudio, useActiveSequence, getActiveSequence } from '../../state/store';
import type { Keyframe, TimelineClip, Track } from '../../model/types';
import { findClip, getAsset, clipSourceOut } from '../../model/types';
import { audioEngine } from '../../engine/audioEngine';
import { evalNum } from '../../engine/keyframes';
import { uid } from '../../model/ids';

type EsType = 'Dialogue' | 'Music' | 'SFX' | 'Ambience';
const ES_TYPES: EsType[] = ['Dialogue', 'Music', 'SFX', 'Ambience'];

/** Display names (the EsType ids themselves stay English — they are state keys). */
const ES_TYPE_JA: Record<EsType, string> = {
  Dialogue: '会話',
  Music: 'ミュージック',
  SFX: '効果音',
  Ambience: 'アンビエンス',
};

// ---------------- preset helpers ----------------

/**
 * Add an audio effect to clips and immediately configure its parameters.
 * Finds the just-added instance (last in clip.effects) and writes each param.
 */
function addEffectWithParams(clipIds: string[], effectId: string, params: Record<string, number>): void {
  const st = useStudio.getState();
  st.addEffectToClips(clipIds, effectId);
  const after = useStudio.getState();
  const seq = getActiveSequence(after);
  for (const id of clipIds) {
    const f = findClip(seq, id);
    const inst = f?.clip.effects[f.clip.effects.length - 1];
    if (!inst || inst.effectId !== effectId) continue;
    for (const [key, value] of Object.entries(params)) {
      after.setPropValue(id, { kind: 'effect', instanceId: inst.id, key }, value);
    }
  }
}

function applyTypePreset(type: EsType, clipIds: string[]): void {
  const st = useStudio.getState();
  st.beginTransaction(`Audio Type: ${type}`);
  switch (type) {
    case 'Dialogue':
      addEffectWithParams(clipIds, 'a-eq', { low: -2, mid: 2.5, high: 1.5 });
      addEffectWithParams(clipIds, 'a-compressor', { threshold: -20, ratio: 3 });
      break;
    case 'Music':
      // gentle glue compression
      addEffectWithParams(clipIds, 'a-compressor', { threshold: -12, ratio: 2 });
      break;
    case 'SFX':
      addEffectWithParams(clipIds, 'a-highpass', { freq: 80 });
      break;
    case 'Ambience':
      addEffectWithParams(clipIds, 'a-lowpass', { freq: 6000 });
      for (const id of clipIds) {
        useStudio.getState().setPropValue(id, { kind: 'intrinsic', key: 'volume' }, -12);
      }
      break;
  }
  useStudio.getState().endTransaction();
}

/** RMS of the asset buffer over the clip's source range [inPoint, sourceOut]. */
function computeRms(buf: AudioBuffer, srcIn: number, srcOut: number): number {
  const sr = buf.sampleRate;
  const s0 = Math.max(0, Math.floor(srcIn * sr));
  const s1 = Math.min(buf.length, Math.ceil(srcOut * sr));
  if (s1 <= s0) return 0;
  const stride = Math.max(1, Math.floor((s1 - s0) / 480000));
  let sum = 0;
  let n = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = s0; i < s1; i += stride) {
      sum += data[i] * data[i];
      n++;
    }
  }
  return n > 0 ? Math.sqrt(sum / n) : 0;
}

// ---------------- styles ----------------

const sectionHead: CSSProperties = {
  fontSize: 10, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase',
  color: 'var(--text-dim)', margin: '10px 0 5px',
};

const actionBtn: CSSProperties = {
  fontSize: 11, padding: '4px 8px', background: 'var(--bg-input)',
  border: '1px solid var(--border-light)', borderRadius: 3, cursor: 'pointer',
  textAlign: 'left',
};

const typeBtn = (active: boolean): CSSProperties => ({
  fontSize: 11, padding: '7px 4px', borderRadius: 3, cursor: 'pointer', textAlign: 'center',
  background: active ? 'var(--accent)' : 'var(--bg-input)',
  border: `1px solid ${active ? 'var(--accent)' : 'var(--border-light)'}`,
  color: active ? '#fff' : 'var(--text)',
});

const badgeStyle: CSSProperties = {
  fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'var(--bg-hover)',
  color: 'var(--accent-bright)', flex: 'none',
};

// ---------------- panel ----------------

export default function EssentialSoundPanel() {
  const seq = useActiveSequence();
  const selection = useStudio((s) => s.ui.selection);

  // Panel-local audio-type badges (TimelineClip has no metadata field; the
  // audible processing itself is persisted as real effects on the clips).
  const [types, setTypes] = useState<Record<string, EsType>>({});
  const [duckingOn, setDuckingOn] = useState(true);
  const [loudnessMsg, setLoudnessMsg] = useState<string | null>(null);
  const [matching, setMatching] = useState(false);

  const audioClips = useMemo(() => {
    const out: { clip: TimelineClip; track: Track }[] = [];
    for (const t of seq.audioTracks) {
      for (const c of t.clips) if (selection.includes(c.id)) out.push({ clip: c, track: t });
    }
    return out;
  }, [seq, selection]);

  const ids = audioClips.map((a) => a.clip.id);
  const commonType: EsType | null = ids.length > 0 && ids.every((id) => types[id] === types[ids[0]])
    ? types[ids[0]] ?? null
    : null;
  const hasMusic = ids.some((id) => types[id] === 'Music');

  const assignType = (type: EsType) => {
    if (ids.length === 0) return;
    setTypes((prev) => ({ ...prev, ...Object.fromEntries(ids.map((id) => [id, type])) }));
    setLoudnessMsg(null);
    applyTypePreset(type, ids);
  };

  const autoMatch = async () => {
    if (ids.length === 0 || matching) return;
    setMatching(true);
    try {
      const st = useStudio.getState();
      // Decode everything first so the mutation below stays synchronous.
      const prepared: { clip: TimelineClip; buf: AudioBuffer | null }[] = [];
      for (const { clip } of audioClips) {
        const asset = getAsset(st.project, clip.assetId);
        let buf = asset ? audioEngine.getBufferSync(asset.id) : null;
        if (!buf && asset) buf = await audioEngine.ensureAssetBuffer(asset);
        prepared.push({ clip, buf });
      }
      const results: string[] = [];
      const s2 = useStudio.getState();
      s2.beginTransaction('Loudness Auto-Match');
      for (const { clip, buf } of prepared) {
        if (!buf) { results.push(`${clip.name}: オーディオデータなし`); continue; }
        const rms = computeRms(buf, clip.inPoint, clipSourceOut(clip));
        if (rms <= 1e-6) { results.push(`${clip.name}: 無音`); continue; }
        // target -18 dBFS RMS, correction clamped to ±12 dB
        const gain = Math.max(-12, Math.min(12, -18 - 20 * Math.log10(rms)));
        const rounded = Math.round(gain * 10) / 10;
        useStudio.getState().setPropValue(clip.id, { kind: 'intrinsic', key: 'volume' }, rounded);
        results.push(`${clip.name}: ${rounded >= 0 ? '+' : ''}${rounded.toFixed(1)} dB`);
      }
      useStudio.getState().endTransaction();
      setLoudnessMsg(results.length > 0 ? results.join('  ·  ') : null);
    } finally {
      setMatching(false);
    }
  };

  const repair = (label: string, apply: () => void) => {
    if (ids.length === 0) return;
    const st = useStudio.getState();
    st.beginTransaction(label);
    apply();
    useStudio.getState().endTransaction();
  };

  const generateDucking = () => {
    const st = useStudio.getState();
    const seqId = st.ui.activeSequenceId;
    const musicIds = ids.filter((id) => types[id] === 'Music');
    if (musicIds.length === 0) return;
    st.mutate('Ducking', (draft) => {
      const dseq = draft.sequences.find((sq) => sq.id === seqId) ?? draft.sequences[0];
      const lastTrack = dseq.audioTracks[dseq.audioTracks.length - 1];
      // Voice content: everything on the last audio track (VO track) plus any
      // clip whose asset name starts with "VO".
      let voice: { start: number; end: number }[] = [];
      for (const tr of dseq.audioTracks) {
        for (const c of tr.clips) {
          if (musicIds.includes(c.id)) continue;
          const asset = getAsset(draft, c.assetId);
          if (tr === lastTrack || (asset?.name ?? '').startsWith('VO')) {
            voice.push({ start: c.start, end: c.end });
          }
        }
      }
      // Merge intervals that overlap or nearly touch (within the 0.4s ramps)
      voice.sort((a, b) => a.start - b.start);
      voice = voice.reduce<{ start: number; end: number }[]>((acc, v) => {
        const last = acc[acc.length - 1];
        if (last && v.start <= last.end + 0.8) last.end = Math.max(last.end, v.end);
        else acc.push({ ...v });
        return acc;
      }, []);

      for (const id of musicIds) {
        const f = findClip(dseq, id);
        if (!f) continue;
        const clip = f.clip;
        const dur = clip.end - clip.start;
        const baseDb = clip.volume.animated
          ? evalNum(clip.volume, 0)
          : (clip.volume.value as number);
        const duckDb = Math.max(-60, baseDb - 12);
        const kfs: Keyframe[] = [];
        // keyframe times are CLIP-LOCAL (seconds from clip.start)
        const push = (t: number, value: number) => kfs.push({
          id: uid('kf'),
          time: Math.max(0, Math.min(dur, t - clip.start)),
          value,
          interpolation: 'linear',
        });
        let any = false;
        for (const v of voice) {
          const oS = Math.max(clip.start, v.start);
          const oE = Math.min(clip.end, v.end);
          if (oE <= oS) continue;
          any = true;
          push(oS - 0.4, baseDb);
          push(oS, duckDb);
          push(oE, duckDb);
          push(oE + 0.4, baseDb);
        }
        if (!any) continue;
        kfs.sort((a, b) => a.time - b.time);
        // collapse coincident keyframes, preferring the ducked (lower) value
        const merged: Keyframe[] = [];
        for (const k of kfs) {
          const prev = merged[merged.length - 1];
          if (prev && Math.abs(prev.time - k.time) < 1e-3) {
            prev.value = Math.min(prev.value as number, k.value as number);
          } else {
            merged.push(k);
          }
        }
        clip.volume.animated = true;
        clip.volume.keyframes = merged;
      }
    });
  };

  // ---------------- render ----------------

  if (audioClips.length === 0) {
    return (
      <div style={{ padding: 14, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.7 }}>
        <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 6 }}>エッセンシャルサウンド</div>
        タイムラインで<b>オーディオクリップ</b>を1つ以上選択すると、オーディオタイプ(会話、ミュージック、効果音、アンビエンス)を割り当てて、ラウドネス、修復、ダッキングのプリセットを適用できます。
      </div>
    );
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', padding: '8px 10px' }}>
      {/* selection summary */}
      <div style={{ fontSize: 11, color: 'var(--text)', marginBottom: 2 }}>
        オーディオクリップ{audioClips.length}個を選択中
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 4 }}>
        {audioClips.slice(0, 6).map(({ clip }) => (
          <div key={clip.id} style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span style={{
              fontSize: 11, color: 'var(--text-dim)', overflow: 'hidden',
              textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {clip.name}
            </span>
            {types[clip.id] && <span style={badgeStyle}>{ES_TYPE_JA[types[clip.id]]}</span>}
          </div>
        ))}
        {audioClips.length > 6 && (
          <span style={{ fontSize: 10, color: 'var(--text-disabled)' }}>他{audioClips.length - 6}個…</span>
        )}
      </div>

      {/* audio type */}
      <div style={sectionHead}>オーディオタイプを割り当て</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
        {ES_TYPES.map((t) => (
          <button key={t} style={typeBtn(commonType === t)} onClick={() => assignType(t)}>{ES_TYPE_JA[t]}</button>
        ))}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text-disabled)', marginTop: 4, lineHeight: 1.5 }}>
        タイプを割り当てると、対応するEQ・ダイナミクスのプリセットがクリップエフェクトとして適用されます。
      </div>

      {/* loudness */}
      <div style={sectionHead}>ラウドネス</div>
      <button className="btn" style={{ width: '100%' }} disabled={matching} onClick={() => { void autoMatch(); }}>
        {matching ? '解析中…' : '自動一致'}
      </button>
      {loudnessMsg && (
        <div style={{ fontSize: 10, color: 'var(--accent-bright)', marginTop: 4, lineHeight: 1.5, userSelect: 'text' }}>
          {loudnessMsg}
        </div>
      )}
      <div style={{ fontSize: 10, color: 'var(--text-disabled)', marginTop: 3, lineHeight: 1.5 }}>
        デコードしたサンプルから、クリップボリュームを−18dBFS RMS(±12dB)に合わせます。
      </div>

      {/* repair — simplified DSP approximations built from EQ / filter effects */}
      <div style={sectionHead}>修復</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <button style={actionBtn} title="ハイパス120Hz+高域シェルフカット(簡易DSP)"
          onClick={() => repair('Reduce Noise', () => {
            addEffectWithParams(ids, 'a-highpass', { freq: 120 });
            addEffectWithParams(ids, 'a-eq', { high: -3 });
          })}>
          ノイズを軽減
        </button>
        <button style={actionBtn} title="中域のプレゼンスをブースト(簡易DSP)"
          onClick={() => repair('Enhance Speech', () => {
            addEffectWithParams(ids, 'a-eq', { mid: 4 });
          })}>
          会話を強調
        </button>
        <button style={actionBtn} title="低域・高域のシェルフカット(簡易DSP)"
          onClick={() => repair('Reduce Reverb', () => {
            addEffectWithParams(ids, 'a-eq', { low: -3, high: -2 });
          })}>
          リバーブを軽減
        </button>
      </div>

      {/* ducking (music clips) */}
      {hasMusic && (
        <>
          <div style={sectionHead}>ダッキング</div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer', lineHeight: 1.4 }}>
            <input type="checkbox" checked={duckingOn} onChange={(e) => setDuckingOn(e.target.checked)} />
            会話・ナレーションに合わせてダッキング
          </label>
          <button
            className="btn"
            style={{ width: '100%', marginTop: 6 }}
            disabled={!duckingOn}
            title="会話クリップと重なる範囲でミュージックを12dB下げるボリュームキーフレームを作成します"
            onClick={generateDucking}
          >
            キーフレームを生成
          </button>
          <div style={{ fontSize: 10, color: 'var(--text-disabled)', marginTop: 4, lineHeight: 1.5 }}>
            会話=最後のオーディオトラック上のクリップ、およびソース名が「VO」で始まるクリップ。ミュージックは0.4秒のランプで−12dB下がります。
          </div>
        </>
      )}
    </div>
  );
}
