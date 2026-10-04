import { describe, expect, it } from 'vitest';
import '../src/public/mathlive-ssr';
import { Atom } from '../src/core/atom-class';
import { parseLatex } from '../src/core/parser';
import { getDefaultContext } from '../src/core/context-utils';
import { INLINE_SHORTCUTS } from '../src/editor/shortcuts-definitions';

const reread = (latex: string) =>
  Atom.serialize(parseLatex(latex), { defaultMode: 'math' });

describe('a double prime', () => {
  // \doubleprime is no LaTeX command: a formula holding f'' failed to compile once edited
  it('is written back as two primes LaTeX knows', () => {
    expect(reread("f''(x)")).toBe('f^{\\prime\\prime}(x)');
    expect(reread(`f${INLINE_SHORTCUTS["''"] as string}`)).toBe(
      'f^{\\prime\\prime}'
    );
  });
});

describe('a group under a style set around it', () => {
  // the group was written back as its own bytes, which hold neither style
  it('keeps the style when written back', () => {
    expect(reread('\\color{red}{x}')).toBe('\\textcolor{red}{{x}}');
    expect(reread('\\mathbf{a{b}c}')).toBe('\\mathbf{a{b}c}');
  });
});

describe('a tie in text', () => {
  // read as a literal tilde, it came back as \textasciitilde and printed one
  it('is written back as a tie', () => {
    expect(reread('\\text{Fig.~1}')).toBe('\\text{Fig.~1}');
  });
});

describe('a control space in text', () => {
  it('is written back as one space', () => {
    expect(reread('\\text{a\\ b}')).toBe('\\text{a\\ b}');
  });
});

describe('a macro whose first argument is optional', () => {
  // \newcommand{\mylog}[2][10]{\log_{#1}(#2)}: \mylog{3} took 3 as the base and left nothing for #2
  const context = {
    ...getDefaultContext(),
    getMacro: (token: string) =>
      token === '\\mylog'
        ? {
            def: '\\log_{#1}(#2)',
            args: 2,
            optional: '10',
            expand: false,
            captureSelection: true,
          }
        : getDefaultContext().getMacro(token),
  };
  const body = (latex: string) =>
    Atom.serialize(parseLatex(latex, { context })[0].body, {
      defaultMode: 'math',
    });

  it('takes its default when no brackets are given, and what the brackets hold when they are', () => {
    expect(body('\\mylog{3}')).toBe('\\log_{10}(3)');
    expect(body('\\mylog[2]{8}')).toBe('\\log_2(8)');
    expect(body('\\mylog[n+1]{x}')).toBe('\\log_{n+1}(x)');
  });

  it('is written back as it was typed', () => {
    for (const latex of ['\\mylog{3}', '\\mylog[2]{8}', '\\mylog{3}+x'])
      expect(
        Atom.serialize(parseLatex(latex, { context }), { defaultMode: 'math' })
      ).toBe(latex);
  });
});
