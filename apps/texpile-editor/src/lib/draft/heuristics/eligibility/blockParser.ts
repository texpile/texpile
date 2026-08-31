// One paragraph through the same parser and the same signature table the visual editor uses,
// so a construct either side understands, both understand. A throw or an empty parse answers
// null: an unreadable block must REFUSE, never compare equal to another unreadable one.
import { createLatexParser } from '$lib/languages/latex/parser/latexParser';
import { MACRO_SIGNATURES, ENV_SIGNATURES } from '$lib/languages/latex/parser/macros';
import type { Node } from '@unified-latex/unified-latex-types';

// built once: createLatexParser exists because per-call construction dominates the parse on
// a string this short, and this runs on the keystroke path
const parse = createLatexParser({ macros: MACRO_SIGNATURES, environments: ENV_SIGNATURES });

export function parseBlock(src: string): Node[] | null {
	if (!src.trim()) return null;
	try {
		const ast = parse(src);
		return ast.content.length ? (ast.content as Node[]) : null;
	} catch {
		return null;
	}
}
