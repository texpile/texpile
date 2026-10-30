import { TreeFragment, type Tree } from '@lezer/common';
import { latexParserFor, latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { NO_OWN_SYNTAX, type OwnSyntax } from '$lib/languages/latex/syntax/tokens/ownSyntax';
import { ownLiteralsIn } from '$lib/languages/latex/userDefinitions';

/** a source with its tree; `own` is the syntax the document defines, read once and kept for the edits that follow */
export type ReadSource = { src: string; tree: Tree; own: OwnSyntax };

export function readSource(src: string): ReadSource {
	return { src, tree: latexTreeOf(src), own: { math: NO_OWN_SYNTAX.math, literals: ownLiteralsIn(src) } };
}

// the definitions are scanned from the whole text, so an edit is read with the ones its baseline made
export function readEdited(before: ReadSource, src: string): ReadSource {
	const old = before.src;
	const limit = Math.min(old.length, src.length);
	let from = 0;
	while (from < limit && old.charCodeAt(from) === src.charCodeAt(from)) from++;
	let oldEnd = old.length;
	let end = src.length;
	while (oldEnd > from && end > from && old.charCodeAt(oldEnd - 1) === src.charCodeAt(end - 1)) {
		oldEnd--;
		end--;
	}
	const fragments = TreeFragment.applyChanges(TreeFragment.addTree(before.tree), [{ fromA: from, toA: oldEnd, fromB: from, toB: end }]);
	return { src, own: before.own, tree: latexParserFor(false, before.own).parse(src, fragments) };
}
