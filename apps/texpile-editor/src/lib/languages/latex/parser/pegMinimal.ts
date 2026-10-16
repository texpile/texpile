// the LaTeX tokenizer: unified-latex's own grammar, vendored with its result memo kept only for
// environments and groups (see scripts/vendor-latex-peg.mjs). Same tokens, byte for byte, in less
// than half the time and a fraction of the heap: the full memo held about 1.5 KB per source byte
import type * as Ast from '@unified-latex/unified-latex-types';
import { parse } from './vendor/latexPeg.js';

/** the minimal parse of `source`: the token stream, environments and math found, nothing attached */
export function parseMinimal(source: string): Ast.Root {
	return parse(source) as Ast.Root;
}
