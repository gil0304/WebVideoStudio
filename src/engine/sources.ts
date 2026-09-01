// ============================================================
// Media source management: procedural generators, imported
// video/image files (blob-backed), with frame-accurate seeking
// for export and last-frame caching for realtime playback.
// ============================================================

import type { MediaAsset } from '../model/types';
import { drawProceduralFrame } from './procedural';

const blobs = new Map<string, Blob>();
const objectUrls = new Map<string, string>();

export function registerBlob(fileId: string, blob: Blob): void {
  blobs.set(fileId, blob);
}
export function getBlob(fileId: string): Blob | undefined {
  return blobs.get(fileId);
}
export function getObjectUrl(fileId: string): string | null {
  const cached = objectUrls.get(fileId);
  if (cached) return cached;
  const blob = blobs.get(fileId);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  objectUrls.set(fileId, url);
  return url;
}

interface VideoSlot {
  el: HTMLVideoElement;
  ready: boolean;
  lastSeekTarget: number;
  seeking: boolean;
}

export class MediaCache {
  private videos = new Map<string, VideoSlot>();
  private images = new Map<string, ImageBitmap | 'loading'>();

  getVideoSlot(asset: MediaAsset): VideoSlot | null {
    if (!asset.fileId) return null;
    let slot = this.videos.get(asset.id);
    if (!slot) {
      const url = getObjectUrl(asset.fileId);
      if (!url) return null;
      const el = document.createElement('video');
      el.src = url;
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
      slot = { el, ready: false, lastSeekTarget: -1, seeking: false };
      el.addEventListener('loadeddata', () => { slot!.ready = true; });
      el.load();
      this.videos.set(asset.id, slot);
    }
    return slot;
  }

  /** Realtime path: draw whatever frame is available, then nudge a seek toward `time`. */
  drawVideoRealtime(ctx: CanvasRenderingContext2D, asset: MediaAsset, time: number, x: number, y: number, w: number, h: number): boolean {
    const slot = this.getVideoSlot(asset);
    if (!slot || !slot.ready) return false;
    const el = slot.el;
    if (Math.abs(el.currentTime - time) > 1 / 15 && !slot.seeking) {
      slot.seeking = true;
      slot.lastSeekTarget = time;
      el.currentTime = Math.min(Math.max(0, time), Math.max(0, (el.duration || asset.duration) - 0.001));
      const done = () => { slot.seeking = false; el.removeEventListener('seeked', done); };
      el.addEventListener('seeked', done);
    }
    try {
      ctx.drawImage(el, x, y, w, h);
      return true;
    } catch {
      return false;
    }
  }

  /** Export path: frame-accurate await of the seek. */
  async drawVideoExact(ctx: CanvasRenderingContext2D, asset: MediaAsset, time: number, x: number, y: number, w: number, h: number): Promise<boolean> {
    const slot = this.getVideoSlot(asset);
    if (!slot) return false;
    const el = slot.el;
    if (!slot.ready) {
      await new Promise<void>((res) => {
        if (slot.ready) return res();
        el.addEventListener('loadeddata', () => res(), { once: true });
        setTimeout(res, 4000);
      });
    }
    const target = Math.min(Math.max(0, time), Math.max(0, (el.duration || asset.duration) - 0.001));
    if (Math.abs(el.currentTime - target) > 0.001) {
      await new Promise<void>((res) => {
        const done = () => { el.removeEventListener('seeked', done); res(); };
        el.addEventListener('seeked', done);
        el.currentTime = target;
        setTimeout(res, 2000);
      });
    }
    try {
      ctx.drawImage(el, x, y, w, h);
      return true;
    } catch {
      return false;
    }
  }

  getImage(asset: MediaAsset): ImageBitmap | null {
    const cached = this.images.get(asset.id);
    if (cached && cached !== 'loading') return cached;
    if (cached === 'loading') return null;
    if (!asset.fileId) return null;
    const blob = blobs.get(asset.fileId);
    if (!blob) return null;
    this.images.set(asset.id, 'loading');
    createImageBitmap(blob).then((bmp) => this.images.set(asset.id, bmp)).catch(() => this.images.delete(asset.id));
    return null;
  }

  async getImageAsync(asset: MediaAsset): Promise<ImageBitmap | null> {
    const now = this.getImage(asset);
    if (now) return now;
    if (!asset.fileId) return null;
    const blob = blobs.get(asset.fileId);
    if (!blob) return null;
    try {
      const bmp = await createImageBitmap(blob);
      this.images.set(asset.id, bmp);
      return bmp;
    } catch {
      return null;
    }
  }

  dispose(): void {
    for (const slot of this.videos.values()) slot.el.src = '';
    this.videos.clear();
    for (const img of this.images.values()) if (img !== 'loading') img.close();
    this.images.clear();
  }
}

export { drawProceduralFrame };
