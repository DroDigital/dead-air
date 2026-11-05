import { describe, expect, it } from 'vitest';
import { PostFx } from '../src/render/postfx';

describe('display coordinate mapping', () => {
  const post = Object.assign(Object.create(PostFx.prototype) as PostFx, { scale: 1, crt: true });

  it('maps the curved display back to the sampled scene coordinate', () => {
    // At x=288 in a 320x180 viewport, barrel distortion samples x=292.9152.
    const point = post.toInternal(288, 90, 320, 180);
    expect(point?.x).toBeCloseTo(292.9152, 3);
    expect(point?.y).toBeCloseTo(90, 3);
  });

  it('rejects curved black corners', () => {
    expect(post.toInternal(1, 1, 320, 180)).toBeNull();
  });

  it('maps linearly with CRT disabled', () => {
    post.crt = false;
    expect(post.toInternal(288, 90, 320, 180)).toEqual({ x: 288, y: 90 });
    post.crt = true;
  });
});
