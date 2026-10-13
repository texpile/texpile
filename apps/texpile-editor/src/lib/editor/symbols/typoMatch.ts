// a search word typed with a slip: a letter missing, extra, wrong, or two swapped ("lamda", "integarl", "desnity").
// Short words must be exact, as must the first letter, which people rarely get wrong; that keeps "rho" from "tho"

const SHORTEST = 4;
const TWO_SLIPS_FROM = 7;

/** edit distance counting a swap of neighbours as one edit, cut short once it passes `max` */
function slips(a: string, b: string, max: number): number {
	const rows = [Array.from({ length: b.length + 1 }, (_, j) => j)];
	for (let i = 1; i <= a.length; i++) {
		const row = [i];
		let least = i;
		for (let j = 1; j <= b.length; j++) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let d = Math.min(rows[i - 1][j] + 1, row[j - 1] + 1, rows[i - 1][j - 1] + cost);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, rows[i - 2][j - 2] + 1);
			row.push(d);
			least = Math.min(least, d);
		}
		if (least > max) return max + 1;
		rows.push(row);
	}
	return rows[a.length][b.length];
}

/** whether `typed` is `word` with a slip or two; an exact or prefix match is the caller's to find first */
export function isTypoOf(typed: string, word: string): boolean {
	if (typed.length < SHORTEST || typed === word || typed[0] !== word[0]) return false;
	const max = typed.length >= TWO_SLIPS_FROM ? 2 : 1;
	return Math.abs(typed.length - word.length) <= max && slips(typed, word, max) <= max;
}
