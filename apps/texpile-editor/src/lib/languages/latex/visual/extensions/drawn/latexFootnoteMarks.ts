import { blankComments } from '$lib/languages/latex/texCode';
// the footnote marks in a LaTeX chip: \footnote and \footnotemark step the counter; given a number in brackets, they
// print it and leave the counter alone
const MARK = /\\footnote(?:mark)?(?![a-zA-Z@])\s*(?:\[\s*(\d+)\s*\])?/g;

export function latexFootnoteMarks(source: string): (number | null)[] {
	if (!source.includes('\\footnote')) return [];
	return [...blankComments(source).matchAll(MARK)].map((m) => (m[1] ? Number(m[1]) : null));
}
