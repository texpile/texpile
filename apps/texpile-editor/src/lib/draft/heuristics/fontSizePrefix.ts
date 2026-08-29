// Puts the daemon's box in another size and leading. Shared by the learned variants and by a
// band's own measured font so the two produce the SAME text: one memoized typeset per locate
// rather than two spellings of one question.
export function fontSizePrefix(size: number, lead: number): string {
	return `\\fontsize{${size.toFixed(4)}pt}{${lead.toFixed(4)}pt}\\selectfont `;
}
