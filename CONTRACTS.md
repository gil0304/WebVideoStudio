# Web Video Studio — implementation contracts

Browser-based NLE (Premiere-like). React 19 + TypeScript + zustand. Dark theme via CSS vars in `src/index.css`.
Everything renders live from the edit graph — no faked video anywhere.

## Architecture (read these before coding)

- `src/model/types.ts` — data model (VideoProject/Sequence/Track/TimelineClip/Prop/Keyframe/EffectInstance/TextLayer/MaskShape/CaptionItem/Marker/Transition). All times in **seconds**. Snap edits to frames (30fps → 1/30).
- `src/state/store.ts` — zustand store `useStudio` with ALL editing actions (undoable via internal history). Read the action list; do not mutate `project` directly.
  - Drag interactions: `beginTransaction(label)` → repeated action calls → `endTransaction()` (collapses into one undo step).
  - Selectors: `useActiveSequence()`, `usePlayhead()`, `getActiveSequence(state)`, `getPlayhead(state)`.
  - Cross-panel dialogs: `ui.openDialog: string|null` + `ui.dialogPayload` (e.g. `setUi({openDialog:'speed-duration', dialogPayload: clipId})`).
- `src/engine/renderer.ts` — `renderSequenceFrame(ctx, project, seq, time, opts)`; helpers `evalClipTransform`, `clipSourceTime`, `getTextLayerBounds(layer)`, `drawTextLayer`, `getAssetThumbnail(project, asset, srcTime, w, h, media?)`.
- `src/engine/playback.ts` — `playback.attach(canvas)/detach()` (Program Monitor); exports `sharedPool` (CanvasPool), `sharedMedia` (MediaCache).
- `src/engine/audioEngine.ts` — `audioEngine.waveform(asset)` → `{peaks: Float32Array (interleaved min,max), buckets, duration}` (real samples; null until decoded — poll/retry). `audioEngine.getMeters()` → `{tracks: Record<trackId, rms0..1>, master}` while playing. `audioEngine.scrub(project, seq, t)`.
- `src/engine/procedural.ts` — `drawProceduralFrame(ctx, kind, w, h, t, seed)` for `asset.procedural` assets (Source Monitor preview).
- `src/engine/effects.ts` — `VIDEO_EFFECT_DEFS` / `AUDIO_EFFECT_DEFS` / `ALL_EFFECT_DEFS`, `getEffectDef(id)`, `createEffectInstance(id)`. Transitions list: see `VideoTransitionType`/`AudioTransitionType` in types.
- `src/engine/exporter.ts` — `exportSequence(project, seq, settings, onProgress, signal)` → `{blob, extension}`, `defaultExportSettings(seq)`, `downloadBlob`, `captionsToSrt/Vtt`.
- `src/engine/keyframes.ts` — `evalProp/evalNum/evalVec(prop, clipLocalTime)`. Keyframe `time` is **clip-local** (seconds from clip.start).
- `src/engine/timecode.ts` — `toTimecode(sec, fps)`, `parseTimecode`, `snapToFrame`.
- `src/state/persistence.ts` — autosave already wired in `src/boot.ts`; `exportProjectFile(project)`.
- Shared UI: `src/ui/components/DragValue.tsx` (scrubbable number), `src/ui/components/ContextMenu.tsx` (`useContextMenu()` hook), `src/ui/layout/PanelGroup.tsx`, `src/ui/layout/SplitPane.tsx`.

## Drag & drop data formats (cross-panel contract)

- Asset from Project panel / Source Monitor: `dataTransfer.setData('application/x-wvs-asset', JSON.stringify({ assetId, srcIn?, srcOut?, take? /* 'both'|'video'|'audio' */ }))`
- Effect from Effects panel: `'application/x-wvs-effect'` → `{ effectId }`
- Transition from Effects panel: `'application/x-wvs-transition'` → `{ type, category }` (video types: cross-dissolve, dip-to-black, dip-to-white, wipe, slide, push, zoom, iris, blur-dissolve; audio: constant-gain, constant-power, exponential-fade)

## Conventions

- UI text in **English** (Premiere-style labels). 12px UI, CSS vars from index.css (`var(--bg-panel)` etc.). No external UI libs, no new npm deps.
- Every mutation goes through store actions. If an action you need is missing, add it to store.ts **only if your brief says you own store extensions**; otherwise use `mutate(label, fn)` from the store (it exists as a public action).
- Timecode display: `toTimecode(t, 30)`.
- Track lists: `seq.videoTracks[0]` is V1 (render bottom of timeline, composited first). Timeline displays video tracks **reversed** (V5 top … V1 above audio), then A1..An below.
- Clip source out = `clip.inPoint + (end-start)*speed`. Speed 0 = freeze frame.
- Keep components in your OWN files. Do not edit files owned by other work packages (ownership list is in your brief). Never edit: `App.tsx`, `main.tsx`, `boot.ts`, engine files (unless your brief says so), `store.ts` (except where your brief allows).
- Verify with `npx tsc -b` (must pass) and `npx oxlint src` (warnings OK, errors not). Do NOT run the dev server; do NOT run npm install.
