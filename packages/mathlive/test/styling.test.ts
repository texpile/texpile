// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { MathfieldElement } from '../src/mathlive';
import { stubBrowser } from './browser';

let MathLive: typeof import('../src/mathlive');

beforeAll(async () => {
  stubBrowser();
  // built by test/bundle.ts
  MathLive = await import('../build/test/mathlive.mjs' as string);
  MathLive.MathfieldElement.fontsDirectory = null;
});

function field(latex: string): MathfieldElement {
  const mf = new MathLive.MathfieldElement();
  document.body.append(mf);
  mf.setValue(latex);
  return mf;
}

// a document's math comes from anyone who sends one
describe('the html commands in a formula', () => {
  const commands: [string, string][] = [
    ['\\htmlStyle{position:fixed;inset:0;z-index:9999}{x}', 'position'],
    ['\\style{position:fixed;inset:0}{x}', 'position'],
    ['\\class{fixed inset-0 z-50}{x}', 'inset-0'],
    ['\\htmlClass{fixed inset-0 z-50}{x}', 'inset-0'],
    ['\\cssId{overlay}{x}', 'overlay'],
    ['\\htmlId{overlay}{x}', 'overlay'],
    ['\\htmlData{href=https://evil.example,role=link}{x}', 'evil.example'],
    ['\\href{https://evil.example}{x}', 'evil.example'],
  ];

  it('draw their body alone', () => {
    const body = MathLive.convertLatexToMarkup('x');
    for (const [latex, attached] of commands) {
      const markup = MathLive.convertLatexToMarkup(latex);
      expect(markup, latex).not.toContain(attached);
      expect(markup, latex).toBe(body);
    }
    const overlay = MathLive.convertLatexToMarkup(
      '\\htmlStyle{position:fixed;inset:0;z-index:9999}{\\href{https://evil.example}{\\phantom{x}}}'
    );
    expect(overlay).not.toMatch(/position|z-index|evil\.example|href=/);
  });

  it('are written back as written when another part of the formula is edited', () => {
    for (const [latex] of commands) {
      const mf = field(`a+${latex}`);
      expect(mf.getValue('latex')).toBe(`a+${latex}`);
      mf.position = 1;
      mf.insert('b');
      expect(mf.getValue('latex')).toBe(`ab+${latex}`);
      mf.remove();
    }
  });

  it('open no link when the field is clicked', () => {
    const opened = vi.spyOn(window, 'open').mockReturnValue(null);
    const mf = field('\\href{https://evil.example}{x}');
    for (let offset = 0; offset <= mf.lastOffset; offset++) {
      vi.spyOn(mf, 'getOffsetFromPoint').mockReturnValue(offset);
      mf.shadowRoot!.querySelector('[part=content]')!.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, composed: true })
      );
      mf.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    }
    mf.remove();
    expect(opened).not.toHaveBeenCalled();
    opened.mockRestore();
  });
});

describe('the style of an enclose in a formula', () => {
  it('opens no declaration of its own', () => {
    for (const latex of [
      '\\enclose{box}[mathbackground="red;position:fixed;inset:0"]{x}',
      '\\enclose{circle}[2px solid red;position:fixed;inset:0]{x}',
      '\\enclose{circle}[2px;position:fixed;inset:0 solid red]{x}',
    ]) {
      const markup = MathLive.convertLatexToMarkup(latex);
      expect(markup, latex).not.toMatch(/position:\s*fixed|inset/);
    }
  });

  it('still draws the colors it names', () => {
    const markup = MathLive.convertLatexToMarkup(
      '\\enclose{circle}[mathbackground="red"]{x}'
    );
    expect(markup).toContain('background-color:red');
  });
});

describe("MathLive's own keycaps", () => {
  it('still mark the box a template puts the selection in', () => {
    const keyboard = window.mathVirtualKeyboard;
    keyboard.layouts = [{ rows: [[{ latex: '\\frac{#@}{#0}' }]] }];
    keyboard.show({ animate: false });
    const keycap = document.querySelector('.MLK__keycap')!.innerHTML;
    keyboard.hide({ animate: false });
    expect(keycap).toContain('class="ML__box-placeholder"');
  });
});
