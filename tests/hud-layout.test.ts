import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/ui/bitfont', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/ui/bitfont')>();
  return { ...actual, drawText: vi.fn() };
});
import { drawText, textWidth } from '../src/ui/bitfont';
import { Hud } from '../src/ui/hud';

function canvas() {
  return { fillRect: vi.fn(), save: vi.fn(), restore: vi.fn() } as unknown as CanvasRenderingContext2D;
}

describe('HUD readability', () => {
  beforeEach(() => vi.mocked(drawText).mockClear());

  it.each([1, 2])('draws an opaque background behind the sponsor challenge at scale %i', (k) => {
    const hud = new Hud();
    hud.challenge = { name: 'SURE GRIP', text: 'RELEASE IN THE GREEN 3 TIMES', prog: '0/3', done: false };
    const rectangles: { style: string; x: number; y: number; w: number; h: number }[] = [];
    const ctx = canvas();
    vi.mocked(ctx.fillRect).mockImplementation((x, y, w, h) => rectangles.push({ style: String(ctx.fillStyle), x, y, w, h }));
    hud.draw(ctx, 320 * k, 180 * k, k, { x: 0, y: 0, inside: false }, 0);
    for (const [, text, x, y] of vi.mocked(drawText).mock.calls.filter(([, s]) => s.startsWith('SPONSOR:') || s.startsWith('RELEASE IN'))) {
      expect(rectangles.some((r) => r.style === '#0c0804' && r.x <= x && r.y <= y && r.x + r.w >= x + textWidth(text) && r.y + r.h >= y + 7)).toBe(true);
    }
  });

  it('keeps the vault and explicitly labelled debt fully on screen', () => {
    const hud = new Hud();
    hud.chyron = { deadline: '8', spins: 12, spinsMax: 12, tray: 45975, streak: 2.75, vault: 45975, debt: 37500 };
    hud.update(10);
    hud.draw(canvas(), 320, 180, 1, { x: 0, y: 0, inside: false }, 0);
    const textCalls = vi.mocked(drawText).mock.calls;
    const debt = textCalls.find(([, s]) => s.includes('DEBT $37500'));
    expect(debt).toBeDefined();
    const [, text, x] = debt!;
    expect(x + textWidth(text)).toBeLessThanOrEqual(320);
  });

  it('keeps unusually large balances and streaks within the ticker', () => {
    const hud = new Hud();
    hud.chyron = { deadline: '1000', spins: 14, spinsMax: 14, tray: 999999999999999, streak: 123456789, vault: 999999999999999, debt: 999999999999999 };
    hud.update(10);
    hud.draw(canvas(), 320, 180, 1, { x: 0, y: 0, inside: false }, 0);
    for (const [, s, x, , opts] of vi.mocked(drawText).mock.calls) {
      const left = opts?.align === 'right' ? x - textWidth(s) : opts?.align === 'center' ? x - textWidth(s) / 2 : x;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + textWidth(s)).toBeLessThanOrEqual(320);
    }
  });

  it('keeps a long tooltip inside the screen at the lower left edge', () => {
    const hud = new Hud();
    hud.tooltip = 'LONG ARTIFACT\n' + 'Token prizes give +1 token. '.repeat(5);
    hud.draw(canvas(), 320, 180, 1, { x: 115, y: 165, inside: true }, 0);
    for (const [, s, x, y] of vi.mocked(drawText).mock.calls) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x + textWidth(s)).toBeLessThanOrEqual(320);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + 7).toBeLessThanOrEqual(180);
    }
  });

  it('shows the full selected item description in an inspection panel', () => {
    const hud = new Hud();
    const detail = 'A LONG ARTIFACT EFFECT THAT NEEDS MORE ROOM THAN A SINGLE ROW CAN PROVIDE.';
    hud.choice = { title: 'REPLACE', options: [{ label: 'OLD ITEM', detail }, { label: 'OTHER', detail: 'OTHER EFFECT' }], selected: 0, layout: 'list', inspect: true };
    hud.draw(canvas(), 320, 180, 1, { x: 0, y: 0, inside: false }, 0);
    const drawn = vi.mocked(drawText).mock.calls.map(([, s]) => s).join(' ');
    expect(drawn).toContain(detail);
    for (const [, s, x, , opts] of vi.mocked(drawText).mock.calls) {
      const left = opts?.align === 'right' ? x - textWidth(s) : opts?.align === 'center' ? x - textWidth(s) / 2 : x;
      expect(left).toBeGreaterThanOrEqual(0);
      expect(left + textWidth(s)).toBeLessThanOrEqual(320);
    }
  });
  it('keeps captions clear of the action hint and ticker', () => {
    const hud = new Hud();
    hud.chyron = { deadline: '1', spins: 4, spinsMax: 4, tray: 0, streak: 1, vault: 0, debt: 300 };
    hud.hint = 'HOLD SPACE';
    hud.caption('HOST', 'A LINE OF CAPTION TEXT', '#fff', 10);
    hud.update(5);
    hud.draw(canvas(), 320, 180, 1, { x: 0, y: 0, inside: false }, 0);
    const calls = vi.mocked(drawText).mock.calls;
    const hint = calls.find(([, s]) => s === 'HOLD SPACE')!;
    const caption = calls.find(([, s]) => s === 'A LINE OF CAPTION TEXT')!;
    expect(caption[3] + 7).toBeLessThan(hint[3]);
  });

  it('inspects the option hovered by the mouse', () => {
    const hud = new Hud();
    hud.choice = { title: 'REPLACE', options: [{ label: 'ONE', detail: 'FIRST EFFECT' }, { label: 'TWO', detail: 'SECOND EFFECT' }], selected: 0, layout: 'list', inspect: true };
    const ctx = canvas();
    hud.draw(ctx, 320, 180, 1, { x: 0, y: 0, inside: false }, 0);
    vi.mocked(drawText).mockClear();
    hud.draw(ctx, 320, 180, 1, { x: 20, y: 42, inside: true }, 0);
    expect(vi.mocked(drawText).mock.calls.map(([, s]) => s)).toContain('SECOND EFFECT');
  });

  it('confirms the same option shown when the pointer hovers a choice', () => {
    const hud = new Hud();
    hud.choice = { title: 'REPLACE', options: [{ label: 'ONE', detail: 'FIRST EFFECT' }, { label: 'TWO', detail: 'SECOND EFFECT' }], selected: 0, layout: 'list', inspect: true };
    const ctx = canvas();
    hud.draw(ctx, 320, 180, 1, { x: 0, y: 0, inside: false }, 0);
    hud.draw(ctx, 320, 180, 1, { x: 20, y: 42, inside: true }, 0);
    expect(hud.activeChoiceIndex()).toBe(1);
    // Navigation starts at the highlighted item, and subsequent input uses the
    // new selection immediately without waiting for another frame.
    hud.selectChoice(0);
    expect(hud.activeChoiceIndex()).toBe(0);
  });

  it('keeps the down navigation arrow above the action hint', () => {
    const hud = new Hud();
    hud.chyron = { deadline: '1', spins: 4, spinsMax: 4, tray: 0, streak: 1, vault: 0, debt: 300 };
    hud.hint = 'HOLD SPACE';
    hud.arrows = ['down'];
    hud.draw(canvas(), 320, 180, 1, { x: 0, y: 0, inside: false }, 0);
    const calls = vi.mocked(drawText).mock.calls;
    const arrow = calls.find(([, s]) => s === '↓')!;
    const hint = calls.find(([, s]) => s === 'HOLD SPACE')!;
    expect(arrow[3] + 7).toBeLessThan(hint[3]);
  });

  it('gives keyboard selection priority over a stationary hovered item', () => {
    const hud = new Hud();
    hud.choice = { title: 'REPLACE', options: [{ label: 'ONE', detail: 'FIRST EFFECT' }, { label: 'TWO', detail: 'SECOND EFFECT' }], selected: 0, layout: 'list', inspect: true };
    const ctx = canvas();
    hud.draw(ctx, 320, 180, 1, { x: 0, y: 0, inside: false }, 0);
    hud.draw(ctx, 320, 180, 1, { x: 20, y: 42, inside: true }, 0);
    hud.choice.selected = 1;
    hud.choice.selected = 0;
    // Simulate a later navigation from the second item back to the first.
    hud.choice.selected = 1;
    hud.draw(ctx, 320, 180, 1, { x: 20, y: 42, inside: true }, 0);
    hud.choice.selected = 0;
    vi.mocked(drawText).mockClear();
    hud.draw(ctx, 320, 180, 1, { x: 20, y: 42, inside: true }, 0);
    expect(vi.mocked(drawText).mock.calls.map(([, s]) => s)).toContain('FIRST EFFECT');
  });

  it('does not draw the ticker through a choice footer', () => {
    const hud = new Hud();
    hud.chyron = { deadline: '1', spins: 4, spinsMax: 4, tray: 0, streak: 1, vault: 0, debt: 300 };
    hud.choice = { title: 'CHOOSE', options: [{ label: 'ONE' }], selected: 0, footer: '1 OR CLICK' };
    hud.draw(canvas(), 320, 180, 1, { x: 0, y: 0, inside: false }, 0);
    expect(vi.mocked(drawText).mock.calls.map(([, s]) => s)).not.toContain('VAULT $0 / DEBT $300');
  });

  it.each([{ w: 320, h: 180, k: 1 }, { w: 640, h: 360, k: 2 }])('keeps both ticker rows and inspected text separated at $w × $h', ({ w, h, k }) => {
    const hud = new Hud();
    hud.chyron = { deadline: '8', spins: 12, spinsMax: 12, tray: 45975, streak: 2.75, vault: 45975, debt: 37500 };
    hud.update(10);
    hud.draw(canvas(), w, h, k, { x: 0, y: 0, inside: false }, 0);
    const calls = vi.mocked(drawText).mock.calls;
    const tray = calls.find(([, s]) => s === 'AT RISK')!;
    const debt = calls.find(([, s]) => s.includes('DEBT $37500'))!;
    expect(tray[3] + 7).toBeLessThanOrEqual(debt[3]);
    expect(debt[2] + textWidth(debt[1])).toBeLessThanOrEqual(w);
    expect(debt[4]?.scale).toBe(1);

    vi.mocked(drawText).mockClear();
    hud.choice = { title: 'REPLACE', options: [{ label: 'ONE', detail: 'THIS IS A FULL DESCRIPTION FOR THE CHOSEN ARTIFACT.' }], selected: 0, layout: 'list', inspect: true };
    hud.draw(canvas(), w, h, k, { x: 0, y: 0, inside: false }, 0);
    const detail = vi.mocked(drawText).mock.calls.find(([, s]) => s.startsWith('THIS IS A FULL DESCRIPTION'))!;
    const footerLimit = h - 24 * k;
    expect(detail[3] + 7).toBeLessThanOrEqual(footerLimit);
    expect(detail[2] + textWidth(detail[1])).toBeLessThanOrEqual(w);
    expect(detail[4]?.scale).toBe(1);
  });

});
