import { describe, expect, it } from 'vitest';
import { PostFx } from '../src/render/postfx';

describe('display coordinate mapping', () => {
  const post = Object.assign(Object.create(PostFx.prototype) as PostFx, { scale: 1, crt: true, aspect: 16 / 9 });

  it('maps the curved display back to the sampled scene coordinate', () => {
    // At x=288 in a 320x180 viewport, the gentle barrel samples x=290.048.
    const point = post.toInternal(288, 90, 320, 180);
    expect(point?.x).toBeCloseTo(290.048, 3);
    expect(point?.y).toBeCloseTo(90, 3);
  });

  it('holds the edges instead of showing black corners (the picture fills the screen)', () => {
    expect(post.toInternal(1, 1, 320, 180)).toEqual({ x: 0, y: 0 });
  });

  it('maps linearly with CRT disabled', () => {
    post.crt = false;
    expect(post.toInternal(288, 90, 320, 180)).toEqual({ x: 288, y: 90 });
    post.crt = true;
  });

  it('follows the window shape: a wider window gets a wider picture, same height', () => {
    const wide = Object.assign(Object.create(PostFx.prototype) as PostFx, { scale: 2, crt: false, aspect: 21 / 9 });
    expect(wide.height).toBe(360);
    expect(wide.width).toBe(840);
    // It fills a 21:9 window edge to edge.
    expect(wide.viewport(2520, 1080)).toMatchObject({ x: 0, y: 0, w: 2520, h: 1080 });
  });
});
