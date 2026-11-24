// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import type { HeadlessMathfield } from '../src/mathlive';
import { stubBrowser } from './browser';

let MathLive: typeof import('../src/mathlive');

beforeAll(async () => {
  stubBrowser();
  // built by test/bundle.ts
  MathLive = await import('../build/test/mathlive.mjs' as string);
});

const rect = { top: 0, bottom: 20, left: 0, right: 100 };

function headlessField(value: string): HeadlessMathfield {
  const field = new MathLive.HeadlessMathfield({
    value,
    syntax: 'latex',
    defaultMode: 'math',
    readOnly: false,
    geometry: {
      atomRect: () => null,
      atomOffsetRect: () => null,
      caretPoint: () => ({ x: 10, y: 10, height: 16 }),
      contentRect: () => rect,
      fieldRect: () => rect,
      hostRect: () => rect,
      scale: 1,
      scrollX: 0,
      scrollBy: () => {},
    },
    pointerCapture: { start: () => {}, stop: () => {} },
    measure: (_font, text) => text.length * 8,
    extents: () => ({ ascent: 8, descent: 2 }),
    family: () => 'serif',
    layoutChanged: () => {},
  });
  field.onFocus();
  return field;
}

describe('a mathfield with no element', () => {
  it('ignores the keystroke caption and the scroll commands', () => {
    const field = headlessField('x');
    field.executeCommand('toggleKeystrokeCaption');
    expect(() =>
      field.onKeystroke(
        new KeyboardEvent('keydown', { key: 'a', code: 'KeyA' })
      )
    ).not.toThrow();
    expect(() => field.executeCommand('scrollToEnd')).not.toThrow();
  });

  it('copies its own LaTeX where a field has no keyboard sink', () => {
    const written: string[] = [];
    Object.assign(navigator, {
      clipboard: {
        writeText: (text: string) => (written.push(text), Promise.resolve()),
      },
    });
    const field = headlessField('x^2');
    expect(() => field.executeCommand('copyToClipboard')).not.toThrow();
    expect(written).toEqual(['x^2']);
  });
});
