import { latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { nextItem, wordOf } from '$lib/languages/latex/syntax/treeSiblings';
// the footnote marks in a LaTeX chip: \footnote and \footnotemark step the counter; given a number in brackets, they
// print it and leave the counter alone
const MARKS = new Set(['footnote', 'footnotemark']);

export function latexFootnoteMarks(source: string): (number | null)[] {
	if (!source.includes('\\footnote')) return [];
	const out: (number | null)[] = [];
	latexTreeOf(source).iterate({
		enter(n) {
			if (!MARKS.has(wordOf(source, n.node) ?? '')) return;
			const open = nextItem(source, n.node);
			const number = open?.name === 'OpenBracket' ? open.nextSibling : null;
			const digits =
				number?.name === 'Text' && number.nextSibling?.name === 'CloseBracket' ? source.slice(number.from, number.to).trim() : '';
			out.push(/^\d+$/.test(digits) ? Number(digits) : null);
		}
	});
	return out;
}
