// ============================================================
// Shared modal dialogs — mounted once (from MenuBar) and keyed
// off ui.openDialog / ui.dialogPayload so any panel can open
// them via setUi({ openDialog, dialogPayload }).
//
// ui.openDialog ids and mutate() labels stay English on purpose;
// only the visible copy is Japanese.
// ============================================================

import { useState, type ReactNode } from 'react';
import { useStudio, getActiveSequence } from '../../state/store';
import type { Marker } from '../../model/types';
import { findClip } from '../../model/types';
import { makeTrack } from '../../model/clipFactory';
import { toTimecode, parseTimecode } from '../../engine/timecode';
import { toast } from '../menus/menuUtils';
import HomeScreen from './HomeScreen';

export default function Dialogs() {
  const openDialog = useStudio((s) => s.ui.openDialog);
  const homeOpen = useStudio((s) => s.ui.homeOpen);
  return (
    <>
      {openDialog === 'speed-duration' && <SpeedDurationDialog />}
      {openDialog === 'new-sequence' && <NewSequenceDialog />}
      {openDialog === 'sequence-settings' && <SequenceSettingsDialog />}
      {openDialog === 'preferences' && <PreferencesDialog />}
      {openDialog === 'keyboard-shortcuts' && <ShortcutsDialog />}
      {openDialog === 'about' && <AboutDialog />}
      {openDialog === 'project-settings' && <ProjectSettingsDialog />}
      {openDialog === 'marker-edit' && <MarkerEditDialog />}
      {openDialog === 'add-tracks' && <AddTracksDialog />}
      {openDialog === 'delete-tracks' && <DeleteTracksDialog />}
      {openDialog === 'spec-coverage' && <SpecCoverageDialog />}
      {homeOpen && <HomeScreen />}
    </>
  );
}

// ---------------- shared shell ----------------

function useCloseDialog() {
  const setUi = useStudio((s) => s.setUi);
  return () => setUi({ openDialog: null, dialogPayload: null });
}

function Shell({ title, children, footer, onClose, width }: {
  title: string; children: ReactNode; footer?: ReactNode; onClose: () => void; width?: number;
}) {
  return (
    <div className="dialog-overlay" onPointerDown={onClose}>
      <div
        className="dialog"
        style={width ? { minWidth: width, maxWidth: width } : undefined}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
      >
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{children}</div>
        {footer && <div className="dialog-footer">{footer}</div>}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 148, textAlign: 'right', color: 'var(--text-dim)', flex: 'none' }}>{label}</div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>{children}</div>
    </div>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5, marginTop: 8 }}>{children}</div>;
}

/** Section caption — no uppercase transform: Japanese text must stay as authored. */
function SectionCaption({ children, first }: { children: ReactNode; first?: boolean }) {
  return (
    <div style={{
      fontSize: 11, letterSpacing: 1, color: 'var(--text-dim)',
      margin: first ? '0 0 8px' : '14px 0 8px',
    }}>{children}</div>
  );
}

// ---------------- Speed / Duration ----------------

function SpeedDurationDialog() {
  const s = useStudio();
  const close = useCloseDialog();
  const clipId = typeof s.ui.dialogPayload === 'string' ? s.ui.dialogPayload : '';
  const seq = getActiveSequence(s);
  const found = findClip(seq, clipId);
  const clip = found?.clip ?? null;
  const fps = seq.frameRate;
  // seconds of source media the clip currently spans (invariant under speed change)
  const srcDur = clip ? (clip.end - clip.start) * Math.abs(clip.speed || 1) : 1;

  const [speedPct, setSpeedPct] = useState(() => clip ? Math.abs(clip.speed || 1) * 100 : 100);
  const [tcText, setTcText] = useState(() => toTimecode(clip ? clip.end - clip.start : 0, fps));
  const [reverse, setReverse] = useState(() => clip ? (clip.reversed || clip.speed < 0) : false);
  const [ripple, setRipple] = useState(false);

  if (!clip) return null;

  const applySpeed = (pct: number) => {
    const p = Math.max(1, Math.min(1000, pct));
    setSpeedPct(p);
    setTcText(toTimecode(srcDur / (p / 100), fps));
  };
  const commitTc = () => {
    const sec = parseTimecode(tcText, fps);
    if (sec != null && sec > 0) {
      const p = Math.max(1, Math.min(1000, (srcDur / sec) * 100));
      setSpeedPct(p);
      setTcText(toTimecode(srcDur / (p / 100), fps));
    } else {
      setTcText(toTimecode(srcDur / (speedPct / 100), fps));
    }
  };
  const ok = () => {
    s.setClipSpeed(clipId, speedPct / 100, ripple);
    s.patchClip(clipId, { reversed: reverse }, 'Speed/Duration');
    close();
  };

  return (
    <Shell
      title={`速度・デュレーション — ${clip.name}`}
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={() => { s.setClipSpeed(clipId, 0, false); close(); }}>フレーム保持</button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={close}>キャンセル</button>
          <button className="btn primary" onClick={ok}>OK</button>
        </>
      }
    >
      <Row label="速度">
        <input
          type="number" min={1} max={1000} step={1} value={Math.round(speedPct * 100) / 100}
          style={{ width: 80 }}
          onChange={(e) => applySpeed(parseFloat(e.target.value) || 100)}
        />
        <span style={{ color: 'var(--text-dim)' }}>%</span>
      </Row>
      <Row label="デュレーション">
        <input
          type="text" value={tcText} className="timecode" style={{ width: 110 }}
          onChange={(e) => setTcText(e.target.value)}
          onBlur={commitTc}
          onKeyDown={(e) => { if (e.key === 'Enter') commitTc(); }}
        />
      </Row>
      <Row label="">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} />
          逆再生
        </label>
      </Row>
      <Row label="">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={ripple} onChange={(e) => setRipple(e.target.checked)} />
          後続のクリップをリップル
        </label>
      </Row>
      <Note>速度とデュレーションは連動します。デュレーション = ソースのデュレーション ÷ 速度。</Note>
    </Shell>
  );
}

// ---------------- New Sequence ----------------

const SEQ_PRESETS = [
  { name: 'HD 1080p 30', w: 1920, h: 1080, fps: 30 },
  { name: 'HD 1080p 60(再生は30fps基準)', w: 1920, h: 1080, fps: 60 },
  { name: '縦型 1080×1920(SNS)', w: 1080, h: 1920, fps: 30 },
  { name: '4K UHD 2160p 30', w: 3840, h: 2160, fps: 30 },
];

function NewSequenceDialog() {
  const s = useStudio();
  const close = useCloseDialog();
  const [name, setName] = useState(() => `シーケンス${String(s.project.sequences.length + 1).padStart(2, '0')}`);
  const [preset, setPreset] = useState(0);
  const [w, setW] = useState(1920);
  const [h, setH] = useState(1080);
  const [fps, setFps] = useState(30);

  const applyPreset = (idx: number) => {
    setPreset(idx);
    const p = SEQ_PRESETS[idx];
    if (p) { setW(p.w); setH(p.h); setFps(p.fps); }
  };

  return (
    <Shell
      title="新規シーケンス"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>キャンセル</button>
          <button
            className="btn primary"
            disabled={!name.trim() || w < 16 || h < 16}
            onClick={() => { s.createSequence(name.trim(), w, h, fps); close(); toast(`シーケンス「${name.trim()}」を作成しました`); }}
          >
            作成
          </button>
        </>
      }
    >
      <Row label="シーケンス名">
        <input type="text" value={name} style={{ flex: 1 }} onChange={(e) => setName(e.target.value)} autoFocus />
      </Row>
      <Row label="プリセット">
        <select value={preset} onChange={(e) => applyPreset(parseInt(e.target.value, 10))} style={{ flex: 1 }}>
          {SEQ_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
        </select>
      </Row>
      <Row label="フレームサイズ">
        <input type="number" value={w} style={{ width: 76 }} onChange={(e) => setW(parseInt(e.target.value, 10) || 0)} />
        <span style={{ color: 'var(--text-dim)' }}>×</span>
        <input type="number" value={h} style={{ width: 76 }} onChange={(e) => setH(parseInt(e.target.value, 10) || 0)} />
        <span style={{ color: 'var(--text-dim)' }}>px</span>
      </Row>
      <Row label="フレームレート">
        <select value={fps} onChange={(e) => setFps(parseInt(e.target.value, 10))}>
          {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f}fps</option>)}
        </select>
      </Row>
      <Note>新規シーケンスはビデオ3トラックとオーディオ3トラックで作成されます。</Note>
    </Shell>
  );
}

// ---------------- Sequence Settings ----------------

function SequenceSettingsDialog() {
  const s = useStudio();
  const close = useCloseDialog();
  const seq = getActiveSequence(s);
  const [name, setName] = useState(seq.name);
  const [w, setW] = useState(seq.width);
  const [h, setH] = useState(seq.height);
  const [fps, setFps] = useState(seq.frameRate);

  const ok = () => {
    const seqId = seq.id;
    s.mutate('Sequence Settings', (draft) => {
      const q = draft.sequences.find((x) => x.id === seqId);
      if (!q) return;
      q.name = name.trim() || q.name;
      q.width = Math.max(16, w);
      q.height = Math.max(16, h);
      q.frameRate = fps;
      const asset = draft.assets.find((a) => a.sequenceId === seqId);
      if (asset) { asset.name = q.name; asset.width = q.width; asset.height = q.height; asset.frameRate = fps; }
    });
    close();
  };

  return (
    <Shell
      title="シーケンス設定"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>キャンセル</button>
          <button className="btn primary" onClick={ok}>OK</button>
        </>
      }
    >
      <Row label="シーケンス名">
        <input type="text" value={name} style={{ flex: 1 }} onChange={(e) => setName(e.target.value)} />
      </Row>
      <Row label="フレームサイズ">
        <input type="number" value={w} style={{ width: 76 }} onChange={(e) => setW(parseInt(e.target.value, 10) || 0)} />
        <span style={{ color: 'var(--text-dim)' }}>×</span>
        <input type="number" value={h} style={{ width: 76 }} onChange={(e) => setH(parseInt(e.target.value, 10) || 0)} />
        <span style={{ color: 'var(--text-dim)' }}>px</span>
      </Row>
      <Row label="フレームレート">
        <select value={fps} onChange={(e) => setFps(parseInt(e.target.value, 10))}>
          {[24, 25, 30, 60].map((f) => <option key={f} value={f}>{f}fps</option>)}
        </select>
      </Row>
      <Note>
        <span style={{ color: 'var(--warning)' }}>警告:</span> フレームサイズやフレームレートを変更しても、
        既存クリップの拡大縮小やリタイミングは行われません。この操作はシーケンスのすべてのインスタンスに影響します。
      </Note>
    </Shell>
  );
}

// ---------------- Preferences ----------------

function PreferencesDialog() {
  const s = useStudio();
  const close = useCloseDialog();
  const [autoSave, setAutoSave] = useState(s.project.settings.autoSaveEnabled);
  const [interval, setInterval_] = useState(s.project.settings.autoSaveIntervalSec);
  const [res, setRes] = useState(s.ui.playbackResolution);

  const ok = () => {
    const iv = Math.max(60, Math.min(3600, Math.round(interval) || 60));
    s.mutate('Preferences', (draft) => {
      draft.settings.autoSaveEnabled = autoSave;
      draft.settings.autoSaveIntervalSec = iv;
    });
    s.setPlaybackResolution(res);
    close();
    toast('環境設定を保存しました');
  };

  return (
    <Shell
      title="環境設定"
      onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>キャンセル</button>
          <button className="btn primary" onClick={ok}>OK</button>
        </>
      }
    >
      <SectionCaption first>自動保存</SectionCaption>
      <Row label="">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
          プロジェクトを自動保存する
        </label>
      </Row>
      <Row label="間隔">
        <input
          type="number" min={60} max={3600} value={interval} style={{ width: 76 }}
          onChange={(e) => setInterval_(parseInt(e.target.value, 10) || 60)}
        />
        <span style={{ color: 'var(--text-dim)' }}>秒(60〜3600)</span>
      </Row>
      <SectionCaption>再生</SectionCaption>
      <Row label="既定の再生解像度">
        <select value={res} onChange={(e) => setRes(parseFloat(e.target.value))}>
          <option value={1}>フル</option>
          <option value={0.5}>1/2</option>
          <option value={0.25}>1/4</option>
        </select>
      </Row>
      <Note>プロジェクトはブラウザーストレージ(IndexedDB)に保存されます。自動保存で残るのは最新のコピーのみです。</Note>
    </Shell>
  );
}

// ---------------- Keyboard Shortcuts ----------------

const SHORTCUT_SECTIONS: { title: string; rows: [string, string][] }[] = [
  {
    title: 'トランスポート',
    rows: [
      ['Space', '再生 / 停止'],
      ['J / K / L', '5フレーム戻る / 停止 / 再生'],
      ['← / →', '1フレーム移動(⇧で5フレーム)'],
      ['↑ / ↓', '前 / 次の編集点へ移動'],
      ['Home / End', '開始位置 / 終了位置へ移動'],
    ],
  },
  {
    title: '編集',
    rows: [
      ['⌘Z / ⇧⌘Z', '取り消し / やり直し'],
      ['⌘C / ⌘V', 'クリップをコピー / ペースト'],
      ['⌘D', '複製'],
      ['⌘A', 'すべてのクリップを選択'],
      ['⌘K', '編集点を追加(再生ヘッド位置ですべてのトラックをカット)'],
      ['Delete', '選択範囲を削除(⇧でリップル削除)'],
      ['I / O', 'インをマーク / アウトをマーク'],
      ['M', 'マーカーを追加'],
      ['S', 'スナップの切り替え'],
      ['= / -', 'タイムラインのズームイン / ズームアウト'],
    ],
  },
  {
    title: 'ファイル',
    rows: [
      ['⌘S', 'プロジェクトを保存'],
      ['⌘O', 'プロジェクトを開く'],
      ['⌘I', 'メディアを読み込み'],
      ['⌘M', 'メディアを書き出し'],
    ],
  },
  {
    title: 'ツール',
    rows: [
      ['V', '選択ツール'], ['A / ⇧A', '前方 / 後方トラック選択ツール'], ['B', 'リップルツール'],
      ['N', 'ローリングツール'], ['R', 'レート調整ツール'], ['C', 'レーザーツール'], ['Y', 'スリップツール'],
      ['U', 'スライドツール'], ['P', 'ペンツール'], ['H', '手のひらツール'], ['Z', 'ズームツール'],
      ['T', '横書き文字ツール'],
    ],
  },
];

function Kbd({ children }: { children: ReactNode }) {
  return (
    <span style={{
      display: 'inline-block', background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
      borderBottomWidth: 2, borderRadius: 4, padding: '0 6px', fontFamily: 'var(--font-mono)',
      fontSize: 11, lineHeight: '18px', color: 'var(--text-bright)',
    }}>{children}</span>
  );
}

function ShortcutsDialog() {
  const close = useCloseDialog();
  return (
    <Shell title="キーボードショートカット" onClose={close} width={560}
      footer={<button className="btn primary" onClick={close}>閉じる</button>}
    >
      <div style={{ maxHeight: '58vh', overflowY: 'auto', paddingRight: 6 }}>
        {SHORTCUT_SECTIONS.map((sec) => (
          <div key={sec.title} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, letterSpacing: 1, color: 'var(--text-dim)', marginBottom: 6 }}>{sec.title}</div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {sec.rows.map(([keys, desc]) => (
                  <tr key={keys} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '4px 8px 4px 0', width: 120, whiteSpace: 'nowrap' }}><Kbd>{keys}</Kbd></td>
                    <td style={{ padding: '4px 0', color: 'var(--text)' }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Shell>
  );
}

// ---------------- About ----------------

function AboutDialog() {
  const close = useCloseDialog();
  return (
    <Shell title="Web Video Studioについて" onClose={close}
      footer={<button className="btn primary" onClick={close}>閉じる</button>}
    >
      <div style={{ textAlign: 'center', padding: '10px 12px 4px' }}>
        <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: 3, color: 'var(--text-bright)' }}>
          WEB <span style={{ color: 'var(--accent-bright)' }}>VIDEO</span> STUDIO
        </div>
        <div style={{ color: 'var(--text-dim)', marginTop: 6 }}>バージョン1.0 — ブラウザーネイティブのノンリニア編集ソフト</div>
        <div style={{ margin: '16px auto 0', maxWidth: 400, lineHeight: 1.8, color: 'var(--text)' }}>
          Canvas 2Dによるリアルタイム合成、Web Audioによるサンプル精度のミキシング、
          WebCodecsでの書き出し(MP4 / WebM / WAV / PNG)に対応。すべての映像は編集グラフからライブでレンダリングされます。
        </div>
        <div style={{ marginTop: 18, fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.7 }}>
          操作体系を研究した独自実装です。Adobe社およびAdobe Premiere Proとは関係ありません。
          <br />
          デモ映像はすべてブラウザー内でプロシージャル生成しています。
        </div>
      </div>
    </Shell>
  );
}

// ---------------- Project Settings ----------------

function ProjectSettingsDialog() {
  const s = useStudio();
  const close = useCloseDialog();
  const [name, setName] = useState(s.project.name);
  const [autoSave, setAutoSave] = useState(s.project.settings.autoSaveEnabled);
  const [interval, setInterval_] = useState(s.project.settings.autoSaveIntervalSec);

  const ok = () => {
    const iv = Math.max(15, Math.min(3600, Math.round(interval) || 60));
    const nm = name.trim();
    s.mutate('Project Settings', (draft) => {
      if (nm) draft.name = nm;
      draft.settings.autoSaveEnabled = autoSave;
      draft.settings.autoSaveIntervalSec = iv;
    });
    close();
  };

  return (
    <Shell title="プロジェクト設定" onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>キャンセル</button>
          <button className="btn primary" onClick={ok}>OK</button>
        </>
      }
    >
      <Row label="プロジェクト名">
        <input type="text" value={name} style={{ flex: 1 }} onChange={(e) => setName(e.target.value)} />
      </Row>
      <Row label="自動保存">
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
          有効
        </label>
        <input
          type="number" min={15} max={3600} value={interval} style={{ width: 70 }}
          onChange={(e) => setInterval_(parseInt(e.target.value, 10) || 60)}
        />
        <span style={{ color: 'var(--text-dim)' }}>秒</span>
      </Row>
      <Row label="レンダラー"><span>{s.project.settings.renderer}</span></Row>
      <Row label="スクラッチディスク"><span>{s.project.settings.scratchDisk}</span></Row>
      <Row label="保存場所"><span>{s.project.settings.location}</span></Row>
    </Shell>
  );
}

// ---------------- Marker Edit ----------------

const MARKER_COLORS: { c: Marker['color']; hex: string; label: string }[] = [
  { c: 'green', hex: '#3a8a5f', label: 'グリーン' }, { c: 'red', hex: '#e05555', label: 'レッド' },
  { c: 'purple', hex: '#9a57b5', label: 'パープル' }, { c: 'orange', hex: '#d78d3c', label: 'オレンジ' },
  { c: 'yellow', hex: '#c7b45a', label: 'イエロー' }, { c: 'white', hex: '#dddddd', label: 'ホワイト' },
  { c: 'blue', hex: '#4c78c7', label: 'ブルー' }, { c: 'cyan', hex: '#3aa0a8', label: 'シアン' },
];

function MarkerEditDialog() {
  const s = useStudio();
  const close = useCloseDialog();
  const seq = getActiveSequence(s);
  const markerId = typeof s.ui.dialogPayload === 'string' ? s.ui.dialogPayload : '';
  const marker = seq.markers.find((m) => m.id === markerId) ?? null;
  const [name, setName] = useState(marker?.name ?? '');
  const [comment, setComment] = useState(marker?.comment ?? '');
  const [color, setColor] = useState<Marker['color']>(marker?.color ?? 'green');
  if (!marker) return null;

  return (
    <Shell title={`マーカーを編集 @ ${toTimecode(marker.time, seq.frameRate)}`} onClose={close}
      footer={
        <>
          <button className="btn" style={{ color: 'var(--danger)' }} onClick={() => { s.removeMarker(marker.id); close(); }}>削除</button>
          <div style={{ flex: 1 }} />
          <button className="btn" onClick={close}>キャンセル</button>
          <button className="btn primary" onClick={() => { s.updateMarker(marker.id, { name, comment, color }); close(); }}>OK</button>
        </>
      }
    >
      <Row label="名前">
        <input type="text" value={name} style={{ flex: 1 }} onChange={(e) => setName(e.target.value)} autoFocus />
      </Row>
      <Row label="コメント">
        <textarea
          value={comment} rows={3} style={{ flex: 1, resize: 'vertical' }}
          onChange={(e) => setComment(e.target.value)}
        />
      </Row>
      <Row label="カラー">
        {MARKER_COLORS.map(({ c, hex, label }) => (
          <div
            key={c}
            title={label}
            onClick={() => setColor(c)}
            style={{
              width: 18, height: 18, borderRadius: 4, background: hex, cursor: 'pointer',
              outline: color === c ? '2px solid var(--text-bright)' : '1px solid var(--border)',
              outlineOffset: 1,
            }}
          />
        ))}
      </Row>
    </Shell>
  );
}

// ---------------- Add / Delete Tracks ----------------

function AddTracksDialog() {
  const s = useStudio();
  const close = useCloseDialog();
  const [nv, setNv] = useState(1);
  const [na, setNa] = useState(1);

  const ok = () => {
    const v = Math.max(0, Math.min(8, Math.round(nv) || 0));
    const a = Math.max(0, Math.min(8, Math.round(na) || 0));
    if (v + a === 0) { close(); return; }
    const seqId = getActiveSequence(s).id;
    s.mutate('Add Tracks', (draft) => {
      const q = draft.sequences.find((x) => x.id === seqId);
      if (!q) return;
      for (let i = 0; i < v; i++) q.videoTracks.push(makeTrack('video', `V${q.videoTracks.length + 1}`));
      for (let i = 0; i < a; i++) q.audioTracks.push(makeTrack('audio', `A${q.audioTracks.length + 1}`));
    });
    close();
    toast(`ビデオ${v}本、オーディオ${a}本のトラックを追加しました`);
  };

  return (
    <Shell title="トラックを追加" onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>キャンセル</button>
          <button className="btn primary" onClick={ok}>OK</button>
        </>
      }
    >
      <Row label="ビデオトラック">
        <input type="number" min={0} max={8} value={nv} style={{ width: 64 }} onChange={(e) => setNv(parseInt(e.target.value, 10) || 0)} />
        <span style={{ color: 'var(--text-dim)' }}>本(最上位トラックの上に追加)</span>
      </Row>
      <Row label="オーディオトラック">
        <input type="number" min={0} max={8} value={na} style={{ width: 64 }} onChange={(e) => setNa(parseInt(e.target.value, 10) || 0)} />
        <span style={{ color: 'var(--text-dim)' }}>本(最下位トラックの下に追加)</span>
      </Row>
    </Shell>
  );
}

const TRACK_TYPE_JA: Record<'video' | 'audio', string> = { video: 'ビデオ', audio: 'オーディオ' };

function DeleteTracksDialog() {
  const s = useStudio();
  const close = useCloseDialog();
  const seq = getActiveSequence(s);
  const empty = [...seq.videoTracks, ...seq.audioTracks].filter((t) => t.clips.length === 0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const toggle = (id: string) => setChecked((c) => ({ ...c, [id]: !c[id] }));
  const ids = Object.keys(checked).filter((id) => checked[id]);

  const ok = () => {
    if (ids.length === 0) { close(); return; }
    const seqId = seq.id;
    s.mutate('Delete Tracks', (draft) => {
      const q = draft.sequences.find((x) => x.id === seqId);
      if (!q) return;
      q.videoTracks = q.videoTracks.filter((t) => !ids.includes(t.id));
      q.audioTracks = q.audioTracks.filter((t) => !ids.includes(t.id));
      q.videoTracks.forEach((t, i) => { t.name = `V${i + 1}`; });
      q.audioTracks.forEach((t, i) => { t.name = `A${i + 1}`; });
    });
    close();
    toast(`${ids.length}本のトラックを削除しました`);
  };

  return (
    <Shell title="トラックを削除" onClose={close}
      footer={
        <>
          <button className="btn" onClick={close}>キャンセル</button>
          <button className="btn primary" disabled={ids.length === 0} onClick={ok}>削除</button>
        </>
      }
    >
      {empty.length === 0
        ? <Note>すべてのトラックにクリップが含まれています。ここで削除できるのは空のトラックのみです。</Note>
        : (
          <>
            <div style={{ color: 'var(--text-dim)', marginBottom: 8 }}>空のトラック:</div>
            {empty.map((t) => (
              <label key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 4px' }}>
                <input type="checkbox" checked={!!checked[t.id]} onChange={() => toggle(t.id)} />
                <span>{t.name}</span>
                <span style={{ color: 'var(--text-dim)' }}>({TRACK_TYPE_JA[t.type]})</span>
              </label>
            ))}
          </>
        )}
    </Shell>
  );
}

// ---------------- Specification Coverage ----------------

const SPEC_AREAS = [
  'プロジェクトパネル — ビン、リスト/アイコン表示、読み込み、ラベル',
  'ソース/プログラムモニター — 実レンダリングのフレーム、JKL、イン/アウト',
  'タイムライン — 移動 / トリミング / リップル / ローリング / スリップ / スライド / カット / レート調整',
  'トラックヘッダー — ロック、同期ロック、ターゲット、ミュート/ソロ、ソースパッチ',
  'インサート / 上書き / リフト / 抽出 / 間隔を詰める編集',
  'モーション、不透明度、描画モード、境界をぼかしたマスク',
  'ベジェ / 停止補間のキーフレームとエフェクトコントロールのレーン',
  'ビデオ/オーディオエフェクト(Lumetri、ブラー、キーイング、EQ、ダイナミクスなど)',
  'トランジション — ディゾルブ、ワイプ、プッシュ、オーディオのクロスフェード',
  'エッセンシャルグラフィックス — 複数レイヤーのテキストとシェイプ',
  'キャプション — エディター、SRT/VTTの読み込みと書き出し、焼き込み',
  'オーディオミキサー — トラックメーター、フェーダー、パン、マスター',
  'ネスト、グループ化、リンクされたビデオ/オーディオクリップ',
  'カラーとコメント付きのマーカー',
  '取り消しヒストリー(100ステップ)とヒストリーパネル',
  'IndexedDBへの自動保存とプロジェクトアーカイブ(.json)',
  '書き出し — WebCodecsのMP4 / WebM、WAV、PNG、PNG連番ZIP',
  'メニュー、ダイアログ、ワークスペース、ホーム画面',
];

function SpecCoverageDialog() {
  const close = useCloseDialog();
  return (
    <Shell title="対応機能一覧" onClose={close} width={560}
      footer={<button className="btn primary" onClick={close}>閉じる</button>}
    >
      <div style={{ maxHeight: '56vh', overflowY: 'auto' }}>
        {SPEC_AREAS.map((a) => (
          <div key={a} style={{ display: 'flex', gap: 8, padding: '3px 0', alignItems: 'baseline' }}>
            <span style={{ color: '#3a8a5f', flex: 'none' }}>✓</span>
            <span>{a}</span>
          </div>
        ))}
      </div>
    </Shell>
  );
}
