import { describe, expect, it } from 'vitest';
import { layoutLatex } from '../src/public/mathlive-ssr';
import { getCharacterMetrics } from '../src/core/font-metrics';
import type { MathLayout, MathPaintItem } from '../src/public/mathlive-ssr';

// every measured run is half an em wide per character
const measure = (font: string, text: string) =>
  0.5 * Number(/(\d+)px/.exec(font)![1]) * [...text].length;

function layout(
  latex: string,
  colorMap?: (name: string) => string | undefined
): MathLayout {
  const result = layoutLatex(latex, {
    measure,
    family: 'serif',
    colorMap,
    defaultMode: 'math',
  });
  expect(result).not.toBeNull();
  return result!;
}

type Glyphs = Extract<MathPaintItem, { kind: 'glyphs' }>;

function glyphs(result: MathLayout, text: string): Glyphs {
  const found = result.items.find(
    (item): item is Glyphs => item.kind === 'glyphs' && item.text === text
  );
  expect(found, `a run of ${text}`).toBeDefined();
  return found!;
}

const width = (char: string, font: Parameters<typeof getCharacterMetrics>[1]) =>
  getCharacterMetrics(char.codePointAt(0), font).width;

describe('a formula laid out for the canvas', () => {
  // Box widths are summed before applyInterBoxSpacing adds the skips, so CSS laid out every x before
  it('counts the space MathLive puts around a binary operator', () => {
    const result = layout('a+b');
    // the markup rounds a skip up to hundredths of an em
    const medium = Math.ceil((4 / 18) * 100) / 100;
    expect(result.width).toBeCloseTo(
      width('a', 'Math-Italic') +
        medium +
        width('+', 'Main-Regular') +
        medium +
        width('b', 'Math-Italic'),
      4
    );
    expect(glyphs(result, 'b').x).toBeCloseTo(
      result.width - width('b', 'Math-Italic'),
      4
    );
  });

  it('centers a fraction’s rows and draws its bar across the wider one', () => {
    const result = layout('\\frac{a}{bbb}');
    const numerator = glyphs(result, 'a');
    const denominator = glyphs(result, 'bbb');
    const bar = result.items.find((item) => item.kind === 'rule')!;
    // a display formula's fraction sets its rows in text style, at full size
    const wide = 3 * width('b', 'Math-Italic');
    expect(bar).toBeDefined();
    if (bar.kind !== 'rule') return;
    expect(bar.w).toBeCloseTo(wide, 3);
    expect(numerator.x + width('a', 'Math-Italic') / 2).toBeCloseTo(
      denominator.x + wide / 2,
      3
    );
    expect(numerator.y).toBeLessThan(bar.y);
    expect(denominator.y).toBeGreaterThan(bar.y + bar.h);
  });

  it('raises a superscript and draws it smaller', () => {
    const result = layout('x^2');
    const script = glyphs(result, '2');
    expect(script.y).toBeLessThan(-0.3);
    expect(script.font).toMatch(/ 0\.7em /);
    expect(script.x).toBeCloseTo(
      glyphs(result, 'x').x + width('x', 'Math-Italic'),
      3
    );
  });

  it('stretches an arrow across what it stands over', () => {
    const result = layout('\\overrightarrow{abcdef}');
    const pieces = result.items.filter((item) => item.kind === 'path');
    expect(pieces.length).toBeGreaterThan(0);
    const right = Math.max(
      ...pieces.map((item) =>
        item.kind === 'path' ? item.box.x + item.box.width : 0
      )
    );
    expect(right).toBeCloseTo(result.width, 3);
  });

  it('draws black in the text color through the color map and keeps other colors', () => {
    const map = (name: string) =>
      /^(black|#000(000)?)$/i.test(name) ? 'currentColor' : undefined;
    expect(glyphs(layout('\\textcolor{black}{x}', map), 'x').color).toBe(
      'current'
    );
    expect(glyphs(layout('\\textcolor{#ff0000}{x}', map), 'x').color).toEqual({
      css: '#ff0000',
    });
  });

  // mathlive-static.css leaves the text font to the page, so \text is in the font the formula stands in
  it('measures text in the font around the formula', () => {
    const result = layout('\\text{abcd}');
    expect(result.width).toBeCloseTo(2, 4);
    expect(glyphs(result, 'abcd').font).toMatch(/ inherit$/);
  });

  it('reports the rows of an align at the baselines of their glyphs', () => {
    const result = layout(
      String.raw`\begin{aligned}a&=1\\b&=2\\c&=3\end{aligned}`
    );
    expect(result.rows).toHaveLength(3);
    for (const [i, name] of ['a', 'b', 'c'].entries())
      expect(result.rows[i].baseline).toBeCloseTo(glyphs(result, name).y, 6);
    expect(result.rows[1].baseline).toBeGreaterThan(result.rows[0].baseline);
  });

  it('reports no rows for a formula without an array', () => {
    expect(layout('a+b').rows).toEqual([]);
  });

  it('draws the strike of a cancel across its body in the formula’s color', () => {
    const result = layout(String.raw`\textcolor{red}{\cancel{abc}}`);
    const body = glyphs(result, 'abc');
    const stroke = result.items.find(
      (item): item is Extract<MathPaintItem, { kind: 'path' }> =>
        item.kind === 'path' && item.stroke !== undefined
    );
    expect(stroke, 'a stroke').toBeDefined();
    const [x1, y1, x2, y2] = stroke!.d.match(/-?[\d.]+/g)!.map(Number);
    // the path's user units start at the box's corner, in the em the stroke is laid out in
    const [vx, vy] = stroke!.viewBox;
    const ink = (u: number, v: number) => [
      stroke!.box.x + u - vx,
      stroke!.box.y + v - vy,
    ];
    const [left, bottom] = ink(x1, y1);
    const [right, top] = ink(x2, y2);
    const bodyWidth =
      width('a', 'Math-Italic') +
      width('b', 'Math-Italic') +
      width('c', 'Math-Italic');
    expect(left).toBeGreaterThanOrEqual(body.x);
    expect(right).toBeLessThanOrEqual(body.x + bodyWidth);
    expect(right - left).toBeGreaterThan(0.8 * bodyWidth);
    expect(top).toBeLessThan(bottom);
    expect(bottom).toBeLessThanOrEqual(0.1);
    expect(stroke!.stroke).toEqual({ css: '#d7170b' });
  });

  it('frames a boxed formula by its body’s width and its padding', () => {
    const result = layout(String.raw`\boxed{E=mc^2}`);
    const frame = result.items.find(
      (item): item is Extract<MathPaintItem, { kind: 'frame' }> =>
        item.kind === 'frame'
    )!;
    expect(frame.rect.x).toBeCloseTo(0, 4);
    expect(frame.rect.width).toBeCloseTo(result.width, 4);
    expect(glyphs(result, 'E').x).toBeGreaterThan(0.2);
    expect(frame.rect.y).toBeLessThan(-result.ascent + 0.1);
    expect(frame.rect.y + frame.rect.height).toBeGreaterThan(0);
  });

  it('rounds the frame of a circle and a rounded box', () => {
    for (const notation of ['circle', 'roundedbox']) {
      const frame = layout(String.raw`\enclose{${notation}}{a}`).items.find(
        (item): item is Extract<MathPaintItem, { kind: 'frame' }> =>
          item.kind === 'frame'
      )!;
      expect(frame.rect.width).toBeGreaterThan(0.5);
      expect(frame.radius).toBeDefined();
    }
  });
});
