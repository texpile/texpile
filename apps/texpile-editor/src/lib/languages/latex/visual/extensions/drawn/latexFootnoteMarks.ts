// the footnote marks in a LaTeX chip: \footnote and \footnotemark step the counter; given a number in brackets, they
// print it and leave the counter alone
const MARK = /\\footnote(?:mark)?(?![a-zA-Z@])\s*(?:\[\s*(\d+)\s*\])?/g;
const COMMENT = /(^|[^\\])%.*$/gm;

export function latexFootnoteMarks(source: string): (number | null)[] {
	if (!source.includes('\\footnote')) return [];
	return [...source.replace(COMMENT, '$1').matchAll(MARK)].map((m) => (m[1] ? Number(m[1]) : null));
}
