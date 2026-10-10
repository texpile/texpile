const OPENER: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
// what ends a term on its left: space, a relation or operator, a column, or a bracket left open
const TERM_STOP = /[\s+\-=<>,;&$([{]/;

/** where the term ending at the end of `text` starts: `x^2`, `\alpha`, `(a+b)`, `\sqrt{x}` */
export function termStart(text: string): number {
	let i = text.length;
	while (i > 0) {
		const c = text[i - 1];
		const open = OPENER[c];
		if (open && text[i - 2] !== '\\') {
			let depth = 0;
			let j = i - 1;
			for (; j >= 0; j--) {
				if (text[j - 1] === '\\') continue;
				if (text[j] === c) depth++;
				else if (text[j] === open && --depth === 0) break;
			}
			if (j < 0) return i;
			i = j;
			continue;
		}
		if (TERM_STOP.test(c) && text[i - 2] !== '\\') break;
		i--;
	}
	return i;
}

/** the term as a numerator: `(a+b)` loses the brackets it was grouped with */
export function numeratorOf(term: string): string {
	if (!term.startsWith('(') || !term.endsWith(')')) return term;
	let depth = 0;
	for (let i = 0; i < term.length - 1; i++) {
		if (term[i] === '(') depth++;
		else if (term[i] === ')' && --depth === 0) return term;
	}
	return term.slice(1, -1);
}
