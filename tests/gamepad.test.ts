import { describe, expect, it } from 'vitest';
import { GamepadInput } from '../src/ui/gamepad';
import type { Action } from '../src/ui/input';

function pad(buttons: number[] = [], axes = [0, 0, 0, 0]): Gamepad {
  return { connected: true, buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: buttons.includes(i), touched: buttons.includes(i), value: buttons.includes(i) ? 1 : 0 })), axes } as unknown as Gamepad;
}

describe('gamepad input', () => {
  it('sends actions on button edges and releases the lever on disconnect', () => {
    const actions: Action[] = [];
    const gamepad = new GamepadInput((action) => actions.push(action), () => {});
    gamepad.update([pad([2])], 0.016);
    gamepad.update([pad([2])], 0.016);
    gamepad.update([], 0.016);
    expect(actions).toEqual([{ type: 'leverDown' }, { type: 'leverUp' }]);
  });

  it('supports stick and d-pad navigation without repeat until the delay', () => {
    const actions: Action[] = [];
    const gamepad = new GamepadInput((action) => actions.push(action), () => {});
    gamepad.update([pad([], [0.8, 0, 0, 0])], 0.016);
    gamepad.update([pad([], [0.8, 0, 0, 0])], 0.1);
    expect(actions).toEqual([{ type: 'nav', dir: 'right' }]);
    gamepad.update([pad([], [0.8, 0, 0, 0])], 0.3);
    expect(actions).toEqual([{ type: 'nav', dir: 'right' }, { type: 'nav', dir: 'right' }]);
    gamepad.update([pad([12])], 0.016);
    expect(actions.at(-1)).toEqual({ type: 'nav', dir: 'up' });
  });

  it('maps confirmation, back, actions, and cursor to controller buttons', () => {
    const actions: Action[] = [];
    const cursor: number[][] = [];
    const gamepad = new GamepadInput((action) => actions.push(action), (x, y) => cursor.push([x, y]));
    gamepad.update([pad([0, 1, 3, 4, 5, 9, 7], [0, 0, 0.5, -0.75])], 0.1);
    expect(actions).toEqual([{ type: 'confirm' }, { type: 'back' }, { type: 'key', key: 'd' }, { type: 'key', key: 'e' }, { type: 'fast' }, { type: 'pause' }, { type: 'click', x: 0, y: 0, button: 0 }]);
    expect(cursor).toEqual([[0.5, -0.75]]);
    gamepad.update([pad()], 0.016);
    expect(actions.at(-1)).toEqual({ type: 'leverUp' });
  });
});
