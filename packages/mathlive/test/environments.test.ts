import { describe, expect, it } from 'vitest';
import '../src/public/mathlive-ssr';
import { Atom } from '../src/core/atom-class';
import { parseLatex } from '../src/core/parser';

const reread = (latex: string) =>
  Atom.serialize(parseLatex(latex), { defaultMode: 'math' });

describe('an align', () => {
  it('keeps the &-pairs of a row on that row', () => {
    expect(reread('\\begin{align}a&=b&c&=d\\\\e&=f&g&=h\\end{align}')).toBe(
      '\\begin{align}a & =b & c & =d\\\\ e & =f & g & =h\\end{align}'
    );
    // a comment column after the pairs
    expect(
      reread('\\begin{align}a&=b&&\\text{by (1)}\\\\c&=d\\end{align}')
    ).toBe(
      '\\begin{align}a & =b &  & \\text{by (1)}\\\\ c & =d &  & \\end{align}'
    );
  });
});
