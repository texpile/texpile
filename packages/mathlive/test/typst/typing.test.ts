// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { parseTypstMath } from 'texpile-typst-syntax-wasm';
import type { MathfieldElement } from '../../src/mathlive';
import { stubBrowser } from '../browser';

let MathLive: typeof import('../../src/mathlive');

beforeAll(async () => {
  stubBrowser();
  // built by test/bundle.ts
  MathLive = await import('../../build/test/mathlive.mjs' as string);
  MathLive.configureTypst({ parse: parseTypstMath });
  MathLive.MathfieldElement.fontsDirectory = null;
  Object.assign(MathLive.MathfieldElement, { playSound: async () => {} });
});

const KEYS: Record<string, string> = {
  '⌫': 'Backspace',
  '⇥': 'Tab',
  '↓': 'ArrowDown',
  '←': 'ArrowLeft',
  '⎋': 'Escape',
  '⏎': 'Enter',
  '⌦': 'Delete',
};

function field(): MathfieldElement {
  const mf = new MathLive.MathfieldElement();
  document.body.append(mf);
  mf.syntax = 'typst';
  return mf;
}

/** types `keys`, the arrows above standing for their keys */
function type(mf: MathfieldElement, keys: string): void {
  const sink = mf.shadowRoot!.querySelector('.ML__keyboard-sink')!;
  for (const c of keys) {
    if (KEYS[c]) {
      const key = KEYS[c];
      sink.dispatchEvent(new KeyboardEvent('keydown', { key, code: key }));
    } else mf.executeCommand(['typedText', c, { simulateKeystroke: true }]);
  }
}

function typed(keys: string, value = ''): string {
  const mf = field();
  if (value) mf.setValue(value, { format: 'typst' });
  type(mf, keys);
  const typst = mf.getValue('typst');
  mf.remove();
  return typst;
}

describe('typing in a Typst field', () => {
  it('turns a name typed whole into its shortcut, and leaves one inside a longer name alone', () => {
    const mf = field();
    mf.typstShortcuts = {
      dint: { value: 'integral_(0)^(1) dif x', format: 'typst' },
      oint: { value: 'integral.cont', format: 'typst' },
      lint: { value: '\\int_{#?}^{#?}', format: 'latex' },
    };
    type(mf, 'dint');
    const typstBody = mf.getValue('typst');
    mf.setValue('', { format: 'typst' });
    type(mf, 'point ');
    const longer = mf.getValue('typst');
    mf.setValue('', { format: 'typst' });
    // a LaTeX body's #? are slots, the first selected: MathLive keeps a superscript before a subscript
    type(mf, 'linta');
    const slot = mf.getValue('typst');
    mf.remove();
    expect([typstBody, longer, slot]).toEqual([
      'integral_(0)^(1) dif x',
      'p o i n t',
      'integral_""^a',
    ]);
  });

  it('reads what is typed the way Typst reads its source', () => {
    const cases: [string, string][] = [
      ['alpha + beta ', 'alpha + beta'],
      ['ab ', 'a b'],
      ['arrow.r.long ', 'arrow.r.long'],
      ['frac(a, b) + 1', 'frac(a, b) + 1'],
      ['abs(f(b)) + frac(1.2(3), 4)', 'abs(f(b)) + frac(1.2(3), 4)'],
      ['italic(a > (k k)/f)', 'italic(a > (k k)/f)'],
      ['root(3, x) <= abs(y)', 'root(3, x) <= abs(y)'],
      ['bb(R) != cal(A)', 'bb(R) != cal(A)'],
      ['qty(1, m)', 'qty(1, m)'],
      ['mat(1, 2; 3, 4)', 'mat(1, 2; 3, 4)'],
      ['cases(x & "if" x >= 0, -x)', 'cases(x & "if" x >= 0, -x)'],
      // an operand is one token, or what parentheses hold
      ['x^2y', 'x^2 y'],
      ['a/b c', 'a/b c'],
      ['e^(i pi) + 1', 'e^(i pi) + 1'],
      ['(a+b)/c', '(a + b)/c'],
      ['a/b^2', 'a/b^2'],
      ['x_i(t)^2', 'x_i(t)^2'],
      ['a ->> b <==> c', 'a ->> b <==> c'],
      ['a & = b \\ c & = d', 'a & = b \\\nc & = d'],
      ['x + #calc.pi y', 'x + #calc.pi y'],
      [
        'f #text(red)[a] ; #sym.alpha "if"',
        'f #text(red)[a] ; #sym.alpha "if"',
      ],
      ['x . #h(1em) y', 'x . #h(1em) y'],
      // `/` divides the item before it, whatever it is: a symbol, a string, a number
      ['plus.minus/a', 'plus.minus/a'],
      ['"if"/x', '"if"/x'],
      ['2.5/x + x^2.5', '2.5/x + x^2.5'],
      // a space keeps apart what Typst would read as one: `9 25`, `x (27)`, two strings
      ['9 25/x', '9 25/x'],
      ['x (27)/c + f(x)/2', 'x (27)/c + f(x)/2'],
      ['"a" "b"', '"a" "b"'],
      ['overbrace(a, b)^c', 'overbrace(a, b)^c'],
      ['bold(x)_i', 'bold(x)_i'],
      // a string where a placeholder was, primes before a superscript or in a denominator
      ['cases(x, "else")', 'cases(x, "else")'],
      ["k'^2 + a/k'", "k'^2 + a/k'"],
      // code ends where Typst's does
      ['#h(1em)_2 + #calc.pi ', '#h(1em)_2 + #calc.pi'],
    ];
    for (const [keys, typst] of cases) expect(typed(keys), keys).toBe(typst);
  });

  it("lets a removed field's suggestions go without reaching for the page", async () => {
    const mf = field();
    type(mf, 'al');
    mf.remove();
    // the suggestions show a moment later, by when the page may be gone (a window closed, a test file over)
    vi.stubGlobal('document', undefined);
    try {
      await new Promise((resolve) => setTimeout(resolve, 60));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('keeps a name open through Backspace and the suggestions', () => {
    expect(typed('alpj⌫ha + 1')).toBe('alpha + 1');
    expect(typed('alp⇥ + 1')).toBe('alpha + 1');
    expect(typed('fr⇥a,b) + 1')).toBe('frac(a, b) + 1');
    expect(typed('x⎋ + y⏎ z')).toBe('x + y z');
    // an argument left empty is still written, as Typst needs it
    expect(typed('frac(a, b)⌫⌫')).toBe('frac(a, "")');
    // Typst still being typed is written as it stands
    expect(typed('x + #calc.pi')).toBe('x + #calc.pi');
  });

  it('types into what is there: a selection, a line, an alignment', () => {
    const mf = field();
    mf.setValue('a + b', { format: 'typst' });
    mf.executeCommand('selectAll');
    type(mf, '/2');
    expect(mf.getValue('typst')).toBe('(a + b)/2');
    mf.remove();
    // after an equation that is all lines, typing goes on with its last line
    expect(typed('& = c', 'a \\ b')).toBe('a \\\nb & = c');
    expect(typed('a &= b & c')).toBe('a & = b & c');
    expect(typed(' + 1', 'a & = b \\ c')).toBe('a & = b \\ c + 1');
  });

  it('deletes beside an equation of lines from its lines, not the whole of it', () => {
    // the caret a field gets when it is entered from after the equation, or from before it
    expect(typed('⌫', 'a &= b \\ &= c')).toBe('a &= b \\ &=');
    expect(typed('⌫', 'x = 1 \\ y = 2')).toContain('x = 1');
    const mf = field();
    mf.setValue('x = 1 \\ y = 2', { format: 'typst' });
    mf.executeCommand('moveToMathfieldStart');
    type(mf, '⌦');
    expect(mf.getValue('typst')).toContain('y = 2');
    mf.remove();
  });

  it('undoes a token at a time, a name and what it became as one', () => {
    const mf = field();
    type(mf, 'alpha + x');
    const steps = [mf.getValue('typst')];
    for (let i = 0; i < 3; i++) {
      mf.executeCommand('undo');
      steps.push(mf.getValue('typst'));
    }
    expect(steps).toEqual(['alpha + x', 'alpha +', 'alpha', '']);
    mf.remove();
  });

  it('ends a name when the caret leaves it or the field does', async () => {
    expect(typed('dots.c←')).toBe('dots.c');
    const mf = field();
    mf.focus();
    type(mf, 'x^2 + alpha');
    // MathLive takes no blur while it is still taking the focus
    await new Promise((resolve) => setTimeout(resolve, 100));
    mf.blur();
    expect(mf.getValue('typst')).toBe('x^2 + alpha');
    mf.remove();
  });
});

describe('a Typst field', () => {
  it('keeps the comments at either end of an equation through an edit', () => {
    // Typst leaves them outside the equation's own content, with the padding
    expect(typed(' + c', '/* why */ a + b // see (3)\n')).toBe(
      '/* why */ a + b + c // see (3)\n'
    );
  });

  it('reads its value as Typst when set before it is in the page, and after it is moved', () => {
    const mf = new MathLive.MathfieldElement();
    mf.syntax = 'typst';
    mf.setValue('alpha/beta', { format: 'typst' });
    expect(mf.getValue('typst')).toBe('alpha/beta');
    // as getValue() is once the field is in the page
    expect(mf.getValue()).toBe('\\frac{\\alpha}{\\beta}');
    document.body.append(mf);
    expect(mf.getValue('latex')).toBe('\\frac{\\alpha}{\\beta}');
    type(mf, '+gamma ');
    const edited = mf.getValue('typst');
    mf.remove();
    document.body.append(mf);
    expect(mf.syntax).toBe('typst');
    expect(mf.getValue('typst')).toBe(edited);
    type(mf, '+delta ');
    expect(mf.getValue('typst')).toBe(`${edited} + delta`);
    mf.remove();
  });
});
