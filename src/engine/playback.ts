// ============================================================
// Playback controller — the audio clock is the sync master;
// video frames chase it via requestAnimationFrame. Frames are
// rendered live from the edit graph every animation tick.
// ============================================================

import { useStudio, getActiveSequence, getPlayhead } from '../state/store';
import { sequenceDuration } from '../model/types';
import { renderSequenceFrame } from './renderer';
import { CanvasPool } from './effects';
import { MediaCache } from './sources';
import { audioEngine } from './audioEngine';

export const sharedPool = new CanvasPool();
export const sharedMedia = new MediaCache();

class PlaybackController {
  private raf = 0;
  private watchdog: ReturnType<typeof setInterval> | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private wasPlaying = false;
  private lastRenderedTime = -1;
  private lastRevision = -1;
  private lastSeqId = '';
  private rendering = false;
  private lastFrameWall = 0;
  private lastTickAt = 0;
  droppedFrames = 0;
  fps = 0;

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.lastRenderedTime = -1;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.loop();
    // rAF stops entirely in hidden/occluded tabs; a timer keeps the
    // transport (audio clock, transitions to/from playing) alive there.
    if (!this.watchdog) {
      this.watchdog = setInterval(() => {
        if (performance.now() - this.lastTickAt > 150) void this.tick();
      }, 120);
    }
  }

  detach(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.watchdog) {
      clearInterval(this.watchdog);
      this.watchdog = null;
    }
    this.canvas = null;
    audioEngine.stop();
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    void this.tick();
  };

  private async tick(): Promise<void> {
    this.lastTickAt = performance.now();
    if (!this.canvas || this.rendering) return;
    const state = useStudio.getState();
    const seq = getActiveSequence(state);
    const playing = state.ui.playing;
    const playhead = getPlayhead(state);

    // transport transitions
    if (playing && !this.wasPlaying) {
      this.wasPlaying = true;
      await audioEngine.play(state.project, seq, playhead);
    } else if (!playing && this.wasPlaying) {
      this.wasPlaying = false;
      // store.setPlaying already captured the clock position; just stop audio
      audioEngine.stop();
    }

    let time = playhead;
    if (playing && this.wasPlaying) {
      const clock = audioEngine.time;
      if (clock !== null) {
        time = clock;
        const dur = Math.max(sequenceDuration(seq), 0.1);
        if (time >= dur) {
          if (state.ui.loop) {
            state.setPlayhead(0);
            await audioEngine.play(state.project, seq, 0);
            time = 0;
          } else {
            state.setPlaying(false);
            state.setPlayhead(dur);
            this.wasPlaying = false;
            audioEngine.stop();
            time = dur;
          }
        } else {
          // reflect into store (throttled by rAF)
          useStudio.setState((s) => ({
            ui: { ...s.ui, playheads: { ...s.ui.playheads, [s.ui.activeSequenceId]: time } },
          }));
        }
      }
    }

    // restart audio if the project changed mid-playback (live editing while playing)
    if (playing && this.wasPlaying && this.lastRevision !== -1 && state.project.revision !== this.lastRevision) {
      await audioEngine.play(state.project, seq, time);
    }

    const needsRender =
      Math.abs(time - this.lastRenderedTime) > 1e-4 ||
      state.project.revision !== this.lastRevision ||
      seq.id !== this.lastSeqId;
    if (!needsRender) return;

    this.rendering = true;
    try {
      const res = state.ui.playbackResolution;
      const procW = Math.max(160, Math.round(seq.width * res));
      const procH = Math.max(90, Math.round(seq.height * res));
      const ctx = this.canvas.getContext('2d');
      if (ctx) {
        await renderSequenceFrame(ctx, state.project, seq, time, {
          width: procW,
          height: procH,
          pool: sharedPool,
          media: sharedMedia,
          transparencyGrid: state.ui.transparencyGrid,
        });
      }
      const now = performance.now();
      if (this.lastFrameWall > 0 && playing) {
        const dt = now - this.lastFrameWall;
        this.fps = this.fps * 0.9 + (1000 / Math.max(dt, 1)) * 0.1;
        if (dt > 2.2 * (1000 / seq.frameRate)) this.droppedFrames++;
      }
      this.lastFrameWall = now;
      this.lastRenderedTime = time;
      this.lastRevision = state.project.revision;
      this.lastSeqId = seq.id;
    } finally {
      this.rendering = false;
    }
  }
}

export const playback = new PlaybackController();
