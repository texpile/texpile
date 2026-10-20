// the LaTeX tokenizer: unified-latex's own grammar, vendored with its result memo kept only for
// environments and groups (see scripts/vendor-latex-peg.mjs). Same tokens, byte for byte, in less
// than half the time and a fraction of the heap: the full memo held about 1.5 KB per source byte
import type * as Ast from '@unified-latex/unified-latex-types';
import { parse } from './vendor/latexPeg.js';
import type { TokenizerNames } from './signatures/tokenizerNames';

/** `names`: the environments read as verbatim or as math, upstream's when absent */
export function parseMinimal(source: string, names?: TokenizerNames): Ast.Root {
	return parse(source, names) as Ast.Root;
}
