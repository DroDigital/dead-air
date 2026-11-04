import { expect, it } from 'vitest';
import { Hud } from '../src/ui/hud';

it('highlights the card under the pointer on the first draw', () => {
  const rects: { x: number; y: number; w: number; h: number; color: string }[] = [];
  const context = {
    fillStyle: '',
    fillRect(x: number, y: number, w: number, h: number) {
      rects.push({ x, y, w, h, color: this.fillStyle });
    },
  };
  const ctx = context as unknown as CanvasRenderingContext2D;
  const hud = new Hud();
  hud.showCursor = false;
  hud.choice = { title: 'CHOICE', selected: 0, options: [{ label: 'ONE' }, { label: 'TWO' }] };
  hud.draw(ctx, 320, 180, 1, { x: 200, y: 50, inside: true }, 0);
  expect(rects.find((r) => r.x === 163 && r.y === 28 && r.w === 143)?.color).toBe('#3a2410');
});
