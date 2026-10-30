import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';

// Which lines of the re-typeset paragraph the edit actually touched.
//
// The follow-and-highlight target used to be the whole paragraph. On a paragraph straddling a
// page break that meant typing at its END scrolled to its START, a page away from the words
// appearing, because the band a split locate reports is its first fragment.
//
// Source characters are matched to emitted glyphs only APPROXIMATELY: commands, braces and
// inter-word space produce no glyph, and a ligature produces fewer than its letters. A
// paragraph dense with markup can therefore land a line out. That is the right precision for
// this: it decides which line to show the user, never what the patch paints.
const SPACING = /[\s&^_#~]/g;
const COMMAND_NAME = /^\\[A-Za-z@]+/;
// the escaped characters that print
const PRINTED_SYMBOL = /^\\[&%$#_{}]$/;

function inkIn(s: string): number {
	return s.replace(SPACING, '').length;
}

const SHOWN_NODES = new Set(['Text', 'VerbatimBody', 'OpenBracket', 'CloseBracket', 'ControlSymbol', 'UrlArgument', 'Verb']);

function glyphsIn(s: string): number {
	let count = 0;
	latexTreeOf(s).iterate({
		enter(node) {
			if (node.name === 'Comment' || node.name === 'Skipped') return false;
			if (!SHOWN_NODES.has(node.name)) return;
			const text = s.slice(node.from, node.to);
			if (node.name === 'Text' || node.name === 'VerbatimBody') count += inkIn(text);
			else if (node.name === 'UrlArgument') count += inkIn(text.slice(1, -1));
			else if (node.name === 'Verb') count += Math.max(0, inkIn(text.replace(COMMAND_NAME, '')) - 2);
			else if (node.name !== 'ControlSymbol' || PRINTED_SYMBOL.test(text)) count++;
		}
	});
	return count;
}

export function editedLineRange(orig: string, text: string, perLine: number[]): { from: number; to: number } {
	const last = Math.max(0, perLine.length - 1);
	if (perLine.length < 2) return { from: 0, to: last };
	let p = 0;
	while (p < orig.length && p < text.length && orig[p] === text[p]) p++;
	let q = 0;
	while (q < orig.length - p && q < text.length - p && orig[orig.length - 1 - q] === text[text.length - 1 - q]) q++;
	const startGlyph = glyphsIn(text.slice(0, p));
	const endGlyph = glyphsIn(text.slice(0, Math.max(p, text.length - q)));
	// cumulative glyphs: line i owns [cum[i-1], cum[i])
	let cum = 0;
	let from = last,
		to = last;
	let seenFrom = false;
	for (let i = 0; i < perLine.length; i++) {
		cum += perLine[i];
		if (!seenFrom && cum > startGlyph) {
			from = i;
			seenFrom = true;
		}
		if (cum > endGlyph) {
			to = i;
			break;
		}
	}
	return { from: Math.min(from, to), to: Math.max(from, to) };
}
