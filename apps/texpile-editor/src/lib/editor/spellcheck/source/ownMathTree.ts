// the source editor's reading: \beaa ... \eeaa is math where the file defines \beaa as \begin{eqnarray*}
import type { Tree } from '@lezer/common';
import { extractUserDefinitions } from '$lib/languages/latex/intellisense/completion/userMacroScan';
import { latexParserFor, latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { ownMathOf } from '$lib/languages/latex/syntax/ownMath';

export function ownMathTreeOf(text: string): Tree {
	const definitions = extractUserDefinitions(text);
	const math = ownMathOf(definitions);
	if (!math.opens.size && !math.closes.size) return latexTreeOf(text);
	return latexParserFor(false, { math, literals: definitions.literals }).parse(text);
}
