// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import { parseTypstMath } from 'texpile-typst-syntax-wasm';
import type { MathfieldElement } from '../src/mathlive';
import { stubBrowser } from './browser';

let MathLive: typeof import('../src/mathlive');

beforeAll(async () => {
  stubBrowser();
  // built by test/bundle.ts
  MathLive = await import('../build/test/mathlive.mjs' as string);
  MathLive.configureTypst({ parse: parseTypstMath });
  MathLive.MathfieldElement.fontsDirectory = null;
});

describe('a page with a menu of its own', () => {
  it('is asked first when the menu button is pressed', () => {
    const mf = new MathLive.MathfieldElement();
    document.body.append(mf);
    const asked: MouseEvent[] = [];
    mf.addEventListener('contextmenu', (e) => {
      asked.push(e);
      e.preventDefault();
    });
    const toggle = mf.shadowRoot!.querySelector('[part=menu-toggle]')!;
    toggle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toBeInstanceOf(MouseEvent);
    // the page took it: MathLive's own menu stays closed
    expect(document.querySelector('.ui-menu-container')).toBeNull();
    mf.remove();
  });

  it('is asked on a long press', async () => {
    const mf = new MathLive.MathfieldElement();
    document.body.append(mf);
    const asked: MouseEvent[] = [];
    mf.addEventListener('contextmenu', (e) => {
      asked.push(e);
      e.preventDefault();
    });
    const content = mf.shadowRoot!.querySelector('[part=content]')!;
    content.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerType: 'touch',
        clientX: 5,
        clientY: 5,
      })
    );
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(asked).toHaveLength(1);
    expect(asked[0].clientX).toBe(5);
    mf.remove();
  });

  it('sets where an operator puts its scripts, in LaTeX and Typst', () => {
    const mf = new MathLive.MathfieldElement();
    document.body.append(mf);
    // with no scripts there is nothing to place
    mf.setValue('\\sin x');
    mf.position = 1;
    expect(MathLive.mathfieldContext(mf).limits).toBeUndefined();
    mf.setValue('\\sum_{i}^{n}x');
    mf.position = 1;
    expect(MathLive.mathfieldContext(mf).limits).toBe('default');
    mf.executeCommand(['setLimits', 'adjacent'] as never);
    expect(mf.getValue('latex')).toBe('\\sum\\nolimits_{i}^{n}x');
    expect(mf.getValue('typst')).toBe('scripts(sum)_i^n x');
    expect(MathLive.mathfieldContext(mf).limits).toBe('adjacent');
    mf.executeCommand(['setLimits', 'default'] as never);
    expect(mf.getValue('latex')).toBe('\\sum_{i}^{n}x');
    mf.remove();
  });
});

describe('the menu in a Typst field', () => {
  function typstField(value: string): MathfieldElement {
    const mf = new MathLive.MathfieldElement();
    document.body.append(mf);
    mf.syntax = 'typst';
    mf.setValue(value, { format: 'typst' });
    return mf;
  }

  /** puts the caret at the first place `here` holds */
  function caretWhere(mf: MathfieldElement, here: () => boolean): void {
    for (let offset = 0; offset <= mf.lastOffset; offset++) {
      mf.position = offset;
      if (here()) return;
    }
    throw new Error('no such place');
  }

  it('writes the matrix style it picks, and the matrix arguments it has', () => {
    const mf = typstField('mat(a, b; c, d) + x');
    caretWhere(mf, () => MathLive.mathfieldContext(mf).array !== undefined);
    mf.executeCommand(['setEnvironment', 'bmatrix'] as never);
    expect(mf.getValue('typst')).toBe('mat(delim: "[", a, b; c, d) + x');
    mf.executeCommand(['setEnvironment', 'pmatrix'] as never);
    expect(mf.getValue('typst')).toBe('mat(a, b; c, d) + x');
    mf.setValue('mat(augment: #1, a, b; c, d)', { format: 'typst' });
    caretWhere(mf, () => MathLive.mathfieldContext(mf).array !== undefined);
    mf.executeCommand(['setEnvironment', 'vmatrix'] as never);
    expect(mf.getValue('typst')).toBe(
      'mat(delim: "|", augment: #1, a, b; c, d)'
    );
    mf.remove();
  });

  it('places the scripts of an operator the source wrapped in limits()', () => {
    const mf = typstField('limits(sum)_(i=1)^n a_i');
    caretWhere(mf, () => MathLive.mathfieldContext(mf).limits !== undefined);
    expect(MathLive.mathfieldContext(mf).limits).toBe('over-under');
    mf.executeCommand(['setLimits', 'adjacent'] as never);
    expect(mf.getValue('typst')).toBe('scripts(sum)_(i=1)^n a_i');
    mf.executeCommand(['setLimits', 'default'] as never);
    expect(mf.getValue('typst')).toBe('sum_(i=1)^n a_i');
    mf.remove();
  });
});
