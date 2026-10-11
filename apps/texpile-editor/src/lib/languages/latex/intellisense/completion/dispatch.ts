// the ordered completion dispatch, mirroring LaTeX Workshop's own priority list: more specific
// contexts (citation/reference/environment/package/file-path) must all get a chance to match
// before the bare "\" + letters macro trigger, which would otherwise swallow everything after it.
import type { CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { docText } from '$lib/editor/source/docText';
import { citationCompletionSource } from './citations';
import { referenceCompletionSource } from './references';
import { environmentCompletionSource } from './environments';
import { packageClassCompletionSource } from './packagesClasses';
import { filePathCompletionSource } from '$lib/editor/source/filePathCompletion';
import { glossaryCompletionSource } from './glossary';
import { argumentCompletionSource } from './arguments';
import { macroOptions } from './macros';
import { isMathContext, withMathBoost } from './mathContext';
import { subsuperscriptCompletionSource } from './subsuperscript';
import { bibFileCompletionSource } from './bibFile';

// letters, or the delimiter-macro families (\(, \[, \{, \left(, \bigl[, \Biggm|, \left\|, ...)
// mirroring LW's trigger so non-letter macro names stay reachable while typing
const MACRO_TRIGGER = /\\(?:[a-zA-Z]*|(?:left|[Bb]ig{1,2}[lmr]?)?(?:[({[|]|\\[{|])?)$/;
const NON_LETTER_END = /[({[|]$/;

// fires on the bare backslash too: LaTeX Workshop registers "\" as a trigger character
function macroCompletionSource(ctx: CompletionContext): CompletionResult | null {
	const macro = ctx.matchBefore(MACRO_TRIGGER);
	if (!macro) return null;
	// `\\` at a line end (a tabular or align row break) is not a macro being typed: a backslash
	// starts one only when the run of backslashes it ends is odd
	const run = /\\*$/.exec(ctx.state.doc.sliceString(Math.max(0, macro.from - 32), macro.from))![0].length;
	if (run % 2 === 1) return null;
	const options = withMathBoost(macroOptions(docText(ctx.state.doc)), isMathContext(ctx.state, macro.from));
	if (NON_LETTER_END.test(macro.text)) {
		// delimiter names aren't letter-filterable by the widget; offer only the exact match (LW does the same)
		const exact = options.filter((o) => o.label === macro.text);
		return exact.length ? { from: macro.from, options: exact, validFor: /^$/ } : null;
	}
	return { from: macro.from, options, validFor: /^\\[a-zA-Z]*$/ };
}

const TEX_SOURCES = [
	citationCompletionSource,
	referenceCompletionSource,
	environmentCompletionSource,
	packageClassCompletionSource,
	filePathCompletionSource,
	glossaryCompletionSource,
	argumentCompletionSource,
	macroCompletionSource, // must run near-last: "\" + letters matches almost everything above too
	subsuperscriptCompletionSource
];

/** the full LaTeX (.tex/.cls/.sty) completion dispatch. async because the argument source
 * lazy-loads vendored package data; every other source resolves synchronously. */
export async function latexCompletionSource(ctx: CompletionContext): Promise<CompletionResult | null> {
	for (const source of TEX_SOURCES) {
		const result = await source(ctx);
		if (result) return result;
	}
	return null;
}

/** .bib-file completion dispatch (entry types, optional fields, reused field values). */
export { bibFileCompletionSource };
