import { describe, expect, it } from 'vitest';
import '../src/public/mathlive-ssr';
import { Atom } from '../src/core/atom-class';
import { parseLatex } from '../src/core/parser';

const reread = (latex: string) =>
  Atom.serialize(parseLatex(latex), { defaultMode: 'math' });

describe('a bold run written back', () => {
  // each spelling is its own font, and \bm needs a package \boldsymbol does not
  it('keeps the command it was set with', () => {
    expect(reread('\\boldsymbol{\\alpha}+\\boldsymbol{x}')).toBe(
      '\\boldsymbol{\\alpha}+\\boldsymbol{x}'
    );
    expect(reread('\\bm{W}')).toBe('\\bm{W}');
    expect(reread('\\mathbf{\\Sigma}')).toBe('\\mathbf{\\Sigma}');
  });
});
