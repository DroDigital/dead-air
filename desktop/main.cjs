/**
 * DEAD AIR — desktop launcher (Electron main process) for macOS, Windows and Linux.
 *
 * Serves the Vite build (`dist/`) from a private `app://dead-air/` origin rather than file://,
 * so fetch() of audio/voice/model assets works and localStorage saves live under one stable
 * origin in the per-user data folder:
 *   macOS   ~/Library/Application Support/DEAD AIR
 *   Windows %APPDATA%\DEAD AIR
 *   Linux   ~/.config/DEAD AIR
 *
 * Flags:  --fullscreen / --windowed   override the remembered window mode
 *         --dev-url=<url>             load a running `npm run dev` server instead of dist/
 *         --devtools                  allow DevTools (always allowed when unpackaged)
 */
'use strict';

const { app, BrowserWindow, Menu, ipcMain, net, powerSaveBlocker, protocol, screen, session, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'dead-air';
const ORIGIN = `${SCHEME}://${HOST}`;
const DIST = path.join(__dirname, '..', 'dist');
const ICON = path.join(__dirname, 'icon.png');

const argv = process.argv.slice(1);
const flag = (name) => argv.includes(`--${name}`);
const option = (name) => argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const devUrl = option('dev-url');
const devtoolsAllowed = !app.isPackaged || flag('devtools');

app.setName('DEAD AIR');

// Without a usable GPU (VMs, blocklisted drivers) Chromium refuses WebGL outright; let it fall
// back to SwiftShader software rendering instead. The "unsafe" refers to running untrusted web
// content on the software JIT; this window only ever loads the game's own local build.
app.commandLine.appendSwitch('enable-unsafe-swiftshader');

// One copy at a time: a second launch focuses the running window instead.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, codeCache: true } },
  ]);
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });
  app.whenReady().then(start);
}

/** @type {BrowserWindow | null} */
let win = null;

// ---------------------------------------------------------------------------------------------
// Window state (size, position, maximized, fullscreen), remembered between launches.

const statePath = () => path.join(app.getPath('userData'), 'window-state.json');

function loadState() {
  let s = {};
  try {
    s = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
  } catch {
    /* first launch or unreadable: defaults */
  }
  const state = {
    width: Number.isFinite(s.width) ? Math.max(640, s.width) : 1280,
    height: Number.isFinite(s.height) ? Math.max(360, s.height) : 720,
    x: Number.isFinite(s.x) ? s.x : undefined,
    y: Number.isFinite(s.y) ? s.y : undefined,
    maximized: !!s.maximized,
    fullscreen: !!s.fullscreen,
  };
  // Drop a remembered position that is no longer on any connected display.
  if (state.x !== undefined && state.y !== undefined) {
    const area = screen.getDisplayMatching({ x: state.x, y: state.y, width: state.width, height: state.height }).workArea;
    const visible = state.x < area.x + area.width - 64 && state.x + state.width > area.x + 64 && state.y >= area.y - 8 && state.y < area.y + area.height - 64;
    if (!visible) state.x = state.y = undefined;
  }
  if (flag('fullscreen')) state.fullscreen = true;
  if (flag('windowed')) state.fullscreen = false;
  return state;
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  const b = win.getNormalBounds();
  const s = { ...b, maximized: win.isMaximized(), fullscreen: win.isFullScreen() };
  try {
    fs.mkdirSync(path.dirname(statePath()), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify(s));
  } catch {
    /* read-only profile: not worth failing over */
  }
}

// ---------------------------------------------------------------------------------------------
// app://dead-air/<path>  →  dist/<path>

function serveDist() {
  protocol.handle(SCHEME, async (req) => {
    const url = new URL(req.url);
    if (url.host !== HOST) return new Response('Not found', { status: 404 });
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/' || rel === '') rel = '/index.html';
    const file = path.normalize(path.join(DIST, rel));
    if (file !== DIST && !file.startsWith(DIST + path.sep)) return new Response('Forbidden', { status: 403 });
    try {
      if (!fs.statSync(file).isFile()) throw new Error('not a file');
    } catch {
      return new Response('Not found', { status: 404 });
    }
    return net.fetch(pathToFileURL(file).toString());
  });
}

// ---------------------------------------------------------------------------------------------

function setFullscreen(on) {
  if (!win) return false;
  win.setFullScreen(!!on);
  return !!on;
}

function buildMenu() {
  if (process.platform !== 'darwin') {
    // No menu bar on Windows/Linux (it also drops the browser-style reload accelerators).
    Menu.setApplicationMenu(null);
    return;
  }
  const template = [
    { role: 'appMenu', submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [{ role: 'togglefullscreen' }, ...(devtoolsAllowed ? [{ type: 'separator' }, { role: 'reload' }, { role: 'toggleDevTools' }] : [])],
    },
    { role: 'windowMenu' },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  const state = loadState();
  win = new BrowserWindow({
    title: 'DEAD AIR',
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 640,
    minHeight: 360,
    useContentSize: true,
    backgroundColor: '#000000',
    show: false,
    autoHideMenuBar: true,
    fullscreenable: true,
    icon: process.platform === 'linux' ? ICON : undefined,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: devtoolsAllowed,
      // The title music and voice start without waiting for a click, as on a TV.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  win.once('ready-to-show', () => {
    if (state.maximized) win.maximize();
    if (state.fullscreen) win.setFullScreen(true);
    win.show();
    win.focus();
  });

  // Keyboard: F11 / Alt+Enter toggle fullscreen; Ctrl/Cmd+Shift+I opens DevTools when allowed.
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = input.key.toLowerCase();
    if (key === 'f11' || (input.alt && key === 'enter')) {
      setFullscreen(!win.isFullScreen());
      event.preventDefault();
    } else if (devtoolsAllowed && key === 'i' && input.shift && (input.control || input.meta)) {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  const notifyFullscreen = () => win.webContents.send('dead-air:fullscreen', win.isFullScreen());
  win.on('enter-full-screen', notifyFullscreen);
  win.on('leave-full-screen', notifyFullscreen);

  // A gamepad doesn't count as activity to most OSes; keep the display awake while focused.
  let blocker = -1;
  win.on('focus', () => {
    if (blocker < 0) blocker = powerSaveBlocker.start('prevent-display-sleep');
  });
  win.on('blur', () => {
    if (blocker >= 0) powerSaveBlocker.stop(blocker);
    blocker = -1;
  });

  // Stay on the game: external links open in the system browser, nothing else navigates.
  const isInternal = (u) => u.startsWith(ORIGIN + '/') || (devUrl && u.startsWith(devUrl));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (isInternal(url)) return;
    event.preventDefault();
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  win.on('close', saveState);
  win.on('closed', () => {
    win = null;
  });

  win.loadURL(devUrl ?? `${ORIGIN}/index.html`);
}

function start() {
  serveDist();
  buildMenu();

  // The game needs no camera, microphone, notifications etc. Fullscreen is the only grant.
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(permission === 'fullscreen'));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'fullscreen');

  ipcMain.handle('dead-air:quit', () => app.quit());
  ipcMain.handle('dead-air:set-fullscreen', (_e, on) => setFullscreen(on));
  ipcMain.handle('dead-air:is-fullscreen', () => !!win?.isFullScreen());

  createWindow();
}

// Saves are localStorage; make sure Chromium has written them before the process exits.
app.on('before-quit', () => {
  saveState();
  session.defaultSession?.flushStorageData();
});

app.on('window-all-closed', () => app.quit());
