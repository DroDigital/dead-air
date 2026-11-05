import { expect, it } from 'vitest';
import { Hud } from '../src/ui/hud';

type Box = { x: number; y: number; w: number; h: number };

/** Draws the choice panel and returns the colour each rectangle was filled with. */
function drawChoice(hud: Hud, mouse: { x: number; y: number; inside: boolean }): { box: Box; color: string }[] {
  const fills: { box: Box; color: string }[] = [];
  const ctx: { fillStyle: string; fillRect: (x: number, y: number, w: number, h: number) => void } = {
    fillStyle: '',
    fillRect(x, y, w, h) {
      fills.push({ box: { x, y, w, h }, color: ctx.fillStyle });
    },
  };
  hud.draw(ctx as unknown as CanvasRenderingContext2D, 320, 180, 1, mouse, 0);
  return fills;
}

const freshChoice = () => ({ title: 'CHOICE', selected: 0, options: [{ label: 'ONE' }, { label: 'TWO' }] });

it('highlights the keyboard selection until the pointer moves', () => {
  const hud = new Hud();
  hud.showCursor = false;
  hud.choice = freshChoice();
  const fills = drawChoice(hud, { x: -10, y: -10, inside: false });
  const cards = (hud as unknown as { optionRects: Box[] }).optionRects;
  expect(fills.find((f) => f.box.x === cards[0].x && f.box.y === cards[0].y && f.box.w === cards[0].w)?.color).toBe('#3a2410');
});

it('the pointer takes the highlight once it moves over a card', () => {
  const hud = new Hud();
  hud.showCursor = false;
  hud.choice = freshChoice();
  drawChoice(hud, { x: -10, y: -10, inside: false });
  const cards = (hud as unknown as { optionRects: Box[] }).optionRects;
  const second = cards[1];
  const fills = drawChoice(hud, { x: second.x + 2, y: second.y + 2, inside: true });
  const colorOf = (b: Box) => fills.find((f) => f.box.x === b.x && f.box.y === b.y && f.box.w === b.w)?.color;
  expect(colorOf(second)).toBe('#3a2410');
  expect(colorOf(cards[0])).toBe('#20160c');
});
