/**
 * The owner's 2D art pack at runtime: sprites sliced by tools/art.ts and indexed in art.json
 * (`{ id: { url, w, h } }`). Everything is preloaded as <img> during the loading screen so
 * canvases (wheel face, host rig, HUD) and DOM menus can draw from it synchronously. A missing
 * or failed sprite just reports `null`; callers keep their procedural fallback.
 */
import index from './art.json';

export interface ArtEntry {
  url: string;
  w: number;
  h: number;
}

const INDEX = index as Record<string, ArtEntry>;
const IMAGES = new Map<string, HTMLImageElement>();

export const art = {
  /** The loaded image for an id, or null if it isn't in the pack or failed to load. */
  img(id: string): HTMLImageElement | null {
    return IMAGES.get(id) ?? null;
  },
  /** The URL for an id (DOM use: backgrounds, <img>), or null. */
  url(id: string): string | null {
    return INDEX[id]?.url ?? null;
  },
  has(id: string): boolean {
    return IMAGES.has(id);
  },
  ids(prefix = ''): string[] {
    return Object.keys(INDEX).filter((k) => k.startsWith(prefix));
  },
  /** Load every sprite (or those matching `filter`); resolves when all have settled. */
  async preload(onProgress?: (p: number) => void, filter: (id: string) => boolean = () => true): Promise<void> {
    if (typeof Image === 'undefined') return;
    const ids = Object.keys(INDEX).filter(filter);
    let done = 0;
    await Promise.all(
      ids.map(
        (id) =>
          new Promise<void>((resolve) => {
            const im = new Image();
            im.decoding = 'async';
            im.onload = () => {
              IMAGES.set(id, im);
              onProgress?.(++done / ids.length);
              resolve();
            };
            im.onerror = () => {
              onProgress?.(++done / ids.length);
              resolve();
            };
            im.src = INDEX[id].url;
          }),
      ),
    );
  },
};
