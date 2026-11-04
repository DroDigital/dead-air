/**
 * DEAD AIR — desktop preload. Exposes a minimal bridge as `window.deadAirDesktop`;
 * the game checks for it (src/core/desktop.ts) and adds Quit / Fullscreen controls.
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('deadAirDesktop', {
  platform: process.platform,
  quit: () => ipcRenderer.invoke('dead-air:quit'),
  setFullscreen: (on) => ipcRenderer.invoke('dead-air:set-fullscreen', !!on),
  isFullscreen: () => ipcRenderer.invoke('dead-air:is-fullscreen'),
  onFullscreenChange: (cb) => {
    const listener = (_e, on) => cb(!!on);
    ipcRenderer.on('dead-air:fullscreen', listener);
    return () => ipcRenderer.removeListener('dead-air:fullscreen', listener);
  },
});
