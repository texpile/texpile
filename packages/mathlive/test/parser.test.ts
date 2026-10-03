import { describe, expect, it } from 'vitest';
import '../src/public/mathlive-ssr';
import { Atom } from '../src/core/atom-class';
import { parseLatex } from '../src/core/parser';
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
