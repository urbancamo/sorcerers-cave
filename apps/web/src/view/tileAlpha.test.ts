import { describe, expect, it } from 'vitest';
import { keyOutsideAlpha } from './tileAlpha';

// Build a w x h RGBA image from rows of characters:
// '.' black (0), '#' grey stone (140), '~' dark mortar (lum ~30), ',' faint fringe (lum 4).
function image(rows: string[]) {
  const h = rows.length, w = rows[0]!.length;
  const d = new Uint8ClampedArray(w * h * 4);
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    const v = c === '#' ? 140 : c === '~' ? 30 : c === ',' ? 4 : 0;
    const i = (y * w + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }));
  keyOutsideAlpha(d, w, h);
  return { a: (x: number, y: number) => d[(y * w + x) * 4 + 3] };
}

describe('keyOutsideAlpha', () => {
  it('makes black around the art transparent', () => {
    const im = image(['.....', '.###.', '.###.', '.###.', '.....']);
    expect(im.a(0, 0)).toBe(0);
    expect(im.a(4, 2)).toBe(0);
    expect(im.a(2, 2)).toBe(255);
  });

  it('keeps black painted inside the art opaque (a pit)', () => {
    const im = image(['.......', '.#####.', '.#...#.', '.#...#.', '.#####.', '.......']);
    expect(im.a(0, 0)).toBe(0);
    expect(im.a(3, 2)).toBe(255);
  });

  it('treats a faint anti-aliased fringe as outside', () => {
    const im = image(['.,,,.', '.,#,.', '.,,,.']);
    expect(im.a(1, 1)).toBe(0);
  });

  it('feathers only the edge pixel: dark mortar touching the outside is partial, further in is opaque', () => {
    const im = image(['.......', '.~~~~~.', '.~###~.', '.~###~.', '.~~~~~.', '.......']);
    expect(im.a(1, 2)).toBeGreaterThan(0);   // touches the outside, lum 30
    expect(im.a(1, 2)).toBeLessThan(255);
    expect(im.a(2, 2)).toBe(255);
  });

  it('does not leak along a dark seam into a shadowed band behind the rim', () => {
    // outside | rim with a radial seam (~) | shadow band (~) | floor: the seam joins outside to the band
    const im = image([
      '....#~#~~~###',
      '....#~#~~~###',
      '....#~#~~~###',
      '....#~#~~~###',
    ]);
    expect(im.a(3, 1)).toBe(0);        // outside
    expect(im.a(5, 1)).toBe(255);      // seam, one pixel in from the rim edge: opaque
    expect(im.a(7, 1)).toBe(255);      // shadow band: opaque
    expect(im.a(8, 1)).toBe(255);
  });

  it('does not leak through a diagonal gap in the edging', () => {
    // interior (4,3) and outside (5,4) touch only diagonally; both shared neighbours are stone
    const im = image(['.......', '.#####.', '.#...#.', '.#...##', '.####..', '.......']);
    expect(im.a(5, 4)).toBe(0);
    expect(im.a(4, 3)).toBe(255);
  });
});
