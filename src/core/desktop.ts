/**
 * Desktop launcher bridge. Present only when the game runs inside the Electron build
 * (desktop/preload.cjs); null in a browser, where the menus simply omit the desktop controls.
 */
export interface DesktopBridge {
  platform: string;
  quit(): Promise<void>;
  setFullscreen(on: boolean): Promise<boolean>;
  isFullscreen(): Promise<boolean>;
  onFullscreenChange(cb: (on: boolean) => void): () => void;
}

export const desktop: DesktopBridge | null =
  typeof window !== 'undefined' ? ((window as unknown as { deadAirDesktop?: DesktopBridge }).deadAirDesktop ?? null) : null;
