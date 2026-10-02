import type { MathSyntax } from './mathFieldFactory';

// MathLive's latex in TeX's terms: what it writes that TeX cannot read, and whether its re-emitted
// latex differs from the source only in ways TeX cannot see.
//
// MathLive parses and re-prints rather than preserving bytes, so `\mid \vecx` comes back as
// `\mid\vecx`. Writing that back rewrites a formula the user only clicked into.

// TeX absorbs the whitespace that terminates a control word, so it is not part of the output.
// `\ ` is a control SYMBOL (a real interword space) and never matches: the class needs a letter
const CONTROL_WORD_GAP = /(\\[a-zA-Z@]+)[ \t]+/g;

// a slot of a fraction, a matrix or the like left empty; only MathLive knows \placeholder. Its id
// stops at a backslash, so a run of unclosed ones is not read to the end once for each
const EMPTY_SLOT = /\\placeholder(?:\[[^\]\\]*\])?\{\}/;

/** `latex` with its empty slots left empty, a space kept where one would run a control word into a letter */
export function withoutEmptySlots(latex: string): string {
	return latex.split(EMPTY_SLOT).reduce((done, part) => done + (/\\[a-zA-Z@]+$/.test(done) && /^[a-zA-Z@]/.test(part) ? ' ' : '') + part);
}

/** true when the two spellings typeset identically, so the source's is worth keeping */
export function mathLatexEquivalent(a: string, b: string): boolean {
	return a === b || a.replace(CONTROL_WORD_GAP, '$1') === b.replace(CONTROL_WORD_GAP, '$1');
}

/** true when the field holds what the node does, so writing it back would change nothing. Typst
 *  comes back byte for byte wherever it was not edited, so for it only equality counts */
export function mathUnchanged(syntax: MathSyntax, stored: string, field: string): boolean {
	return syntax === 'typst' ? stored === field : mathLatexEquivalent(stored, field);
}
