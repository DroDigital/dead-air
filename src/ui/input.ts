import { GamepadInput } from './gamepad';

/**
 * Input: keyboard + mouse + gamepad → abstract actions. Full keyboard play and full mouse play.
 * Actions arriving while the presentation is busy are queued (max 2) instead of dropped,
 * except for fast-forward/pause which always go through.
 */

export type Action =
  | { type: 'nav'; dir: 'up' | 'down' | 'left' | 'right' }
  | { type: 'leverDown' }
  | { type: 'leverUp' }
  | { type: 'confirm' }
  | { type: 'back' }
  | { type: 'num'; n: number }
  | { type: 'key'; key: string }
  | { type: 'click'; x: number; y: number; button: number }
  | { type: 'fast' }
  | { type: 'pause' };

const IMMEDIATE = new Set(['fast', 'pause', 'leverUp', 'leverDown', 'nav']);

export class Input {
  mouse = { x: -1, y: -1, inside: false, down: false };
  private queue: Action[] = [];
  private spaceHeld = false;
  private gamepad = new GamepadInput((action) => {
    if (action.type === 'click') {
      if (!this.mouse.inside) { this.mouse.x = this.cursorWidth / 2; this.mouse.y = this.cursorHeight / 2; }
      this.mouse.inside = true;
      this.onGamepadAction({ ...action, x: this.mouse.x, y: this.mouse.y });
    } else this.onGamepadAction(action);
  }, (x, y) => {
    if (!this.mouse.inside) {
      this.mouse.x = this.cursorWidth / 2;
      this.mouse.y = this.cursorHeight / 2;
    }
    this.mouse.inside = true;
    this.mouse.x = Math.max(0, Math.min(this.cursorWidth - 1, this.mouse.x + x * this.cursorSpeed));
    this.mouse.y = Math.max(0, Math.min(this.cursorHeight - 1, this.mouse.y + y * this.cursorSpeed));
  });
  private cursorWidth = 320;
  private cursorHeight = 180;
  private cursorSpeed = 0;
  enabled = true;
  /** Map CSS px → internal px (provided by the app). */
  toInternal: (x: number, y: number) => { x: number; y: number } | null = () => null;
  onAction: (a: Action) => void = () => {};
  onGamepadAction: (a: Action) => void = (a) => this.push(a);
  isBusy: () => boolean = () => false;

  constructor(el: HTMLElement) {
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    el.addEventListener('mousemove', (e) => {
      const p = this.toInternal(e.clientX, e.clientY);
      this.mouse.inside = !!p;
      if (p) {
        this.mouse.x = p.x;
        this.mouse.y = p.y;
      }
    });
    el.addEventListener('mouseleave', () => (this.mouse.inside = false));
    el.addEventListener('mousedown', (e) => {
      const p = this.toInternal(e.clientX, e.clientY);
      if (!p) return;
      this.mouse.down = true;
      this.push({ type: 'click', x: p.x, y: p.y, button: e.button });
    });
    window.addEventListener('mouseup', () => {
      if (this.mouse.down) this.push({ type: 'leverUp' });
      this.mouse.down = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener(
      'wheel',
      (e) => {
        this.push({ type: 'nav', dir: e.deltaY > 0 ? 'down' : 'up' });
      },
      { passive: true },
    );
  }

  private key(e: KeyboardEvent, down: boolean): void {
    if (!this.enabled) return;
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    const k = e.key;
    if (k === ' ' || k === 'Spacebar') {
      e.preventDefault();
      if (down && !this.spaceHeld) {
        this.spaceHeld = true;
        this.push({ type: 'leverDown' });
      } else if (!down && this.spaceHeld) {
        this.spaceHeld = false;
        this.push({ type: 'leverUp' });
      }
      return;
    }
    if (!down || e.repeat) return;
    const map: Record<string, Action> = {
      ArrowUp: { type: 'nav', dir: 'up' },
      ArrowDown: { type: 'nav', dir: 'down' },
      ArrowLeft: { type: 'nav', dir: 'left' },
      ArrowRight: { type: 'nav', dir: 'right' },
      w: { type: 'nav', dir: 'up' },
      s: { type: 'nav', dir: 'down' },
      a: { type: 'nav', dir: 'left' },
      d: { type: 'nav', dir: 'right' },
      Enter: { type: 'confirm' },
      Escape: { type: 'pause' },
      Backspace: { type: 'back' },
      f: { type: 'fast' },
    };
    const a = map[k] ?? map[k.toLowerCase()];
    if (a) {
      if (k.startsWith('Arrow') || k === 'Enter' || k === 'Backspace') e.preventDefault();
      this.push(a);
      return;
    }
    if (/^[0-9]$/.test(k)) {
      this.push({ type: 'num', n: Number(k) });
      return;
    }
    if (k.length === 1) this.push({ type: 'key', key: k.toLowerCase() });
  }

  push(a: Action): void {
    if (IMMEDIATE.has(a.type) || !this.isBusy()) this.onAction(a);
    else this.enqueue(a);
  }

  private enqueue(a: Action): void {
    if (a.type === 'click') return; // stale clicks are not replayed
    if (this.queue.length < 2) this.queue.push(a);
  }

  /** Poll once per animation frame. Cursor coordinates are in the game's internal pixels. */
  pollGamepad(dt: number, width: number, height: number): void {
    this.cursorWidth = width;
    this.cursorHeight = height;
    this.cursorSpeed = width * Math.min(dt, 0.05) * 0.8;
    this.gamepad.update(typeof navigator.getGamepads === 'function' ? Array.from(navigator.getGamepads()) : [], dt);
  }

  /** Called every frame: replay queued actions once the presentation is idle. */
  flush(): void {
    if (this.isBusy() || !this.queue.length) return;
    const a = this.queue.shift()!;
    this.onAction(a);
  }

  clear(): void {
    this.queue.length = 0;
  }

  get leverHeld(): boolean {
    return this.spaceHeld || this.mouse.down || this.gamepad.leverHeld;
  }
}
