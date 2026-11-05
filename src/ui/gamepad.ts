import type { Action } from './input';

type Direction = 'up' | 'down' | 'left' | 'right';

/** Converts a standard browser gamepad into the same actions as keyboard and mouse. */
export class GamepadInput {
  private held = new Set<number>();
  private direction: Direction | null = null;
  private repeatIn = 0;

  constructor(private emit: (action: Action) => void, private moveCursor: (x: number, y: number) => void) {}

  update(pads: readonly (Gamepad | null)[], dt: number): void {
    const pad = pads.find((p) => p?.connected);
    const buttons = pad?.buttons ?? [];
    const pressed = (i: number) => !!buttons[i]?.pressed;
    const directions: [Direction, boolean][] = [
      ['up', pressed(12) || (pad?.axes[1] ?? 0) < -0.55],
      ['down', pressed(13) || (pad?.axes[1] ?? 0) > 0.55],
      ['left', pressed(14) || (pad?.axes[0] ?? 0) < -0.55],
      ['right', pressed(15) || (pad?.axes[0] ?? 0) > 0.55],
    ];
    const direction = directions.find(([, active]) => active)?.[0] ?? null;
    if (direction !== this.direction) {
      this.direction = direction;
      this.repeatIn = 0.35;
      if (direction) this.emit({ type: 'nav', dir: direction });
    } else if (direction) {
      this.repeatIn -= dt;
      if (this.repeatIn <= 0) {
        this.emit({ type: 'nav', dir: direction });
        this.repeatIn = 0.14;
      }
    }
    const x = pad?.axes[2] ?? 0;
    const y = pad?.axes[3] ?? 0;
    if (Math.abs(x) > 0.2 || Math.abs(y) > 0.2) this.moveCursor(Math.abs(x) > 0.2 ? x : 0, Math.abs(y) > 0.2 ? y : 0);
    const map: [number, Action][] = [
      [0, { type: 'confirm' }], [1, { type: 'back' }], [2, { type: 'leverDown' }],
      [3, { type: 'key', key: 'd' }], [4, { type: 'key', key: 'e' }], [5, { type: 'fast' }],
      [9, { type: 'pause' }], [7, { type: 'click', x: 0, y: 0, button: 0 }],
    ];
    for (const [i, action] of map) {
      if (pressed(i) && !this.held.has(i)) this.emit(action);
      if ((i === 2 || i === 7) && !pressed(i) && this.held.has(i)) this.emit({ type: 'leverUp' });
    }
    this.held = new Set(map.filter(([i]) => pressed(i)).map(([i]) => i));
  }

  get leverHeld(): boolean {
    return this.held.has(2);
  }
}
