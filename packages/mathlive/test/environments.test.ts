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
    ).toBe('\\begin{align}a & =b &  & \\text{by (1)}\\\\ c & =d\\end{align}');
  });

  it('reads a short row back as written after an edit to another row', () => {
    for (const env of ['align*', 'aligned']) {
      const [array] = parseLatex(
        `\\begin{${env}}a & =b &  & \\text{by (1)}\\\\ c & =d\\end{${env}}`
      );
      // what typing over `b` does
      const b = array.children.find((atom) => atom.value === 'b')!;
      b.parent!.addChildrenAfter(parseLatex('x'), b);
      b.parent!.removeChild(b);
      expect(Atom.serialize([array], { defaultMode: 'math' })).toBe(
        `\\begin{${env}}a & =x &  & \\text{by (1)}\\\\ c & =d\\end{${env}}`
      );
    }
  });
});
