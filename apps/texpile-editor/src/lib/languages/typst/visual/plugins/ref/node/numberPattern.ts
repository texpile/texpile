// Typst's numbering patterns ("1.", "1.1", "(a)", "I.") applied to a list of counters, as a reference prints them
type Piece = { prefix: string; symbol: string };
export type NumberPattern = { pieces: Piece[]; suffix: string };

const SYMBOLS = '1aAiI';

export function parseNumberPattern(text: string): NumberPattern | null {
	const pieces: Piece[] = [];
	let prefix = '';
	let suffix = '';
	for (const char of text) {
		if (SYMBOLS.includes(char)) {
			pieces.push({ prefix: suffix || prefix, symbol: char });
			prefix = '';
			suffix = '';
		} else if (pieces.length > 0) suffix += char;
		else prefix += char;
	}
	return pieces.length ? { pieces, suffix } : null;
}

function letters(n: number, upper: boolean): string {
	let out = '';
	for (let rest = n; rest > 0; rest = Math.floor((rest - 1) / 26)) out = String.fromCharCode(97 + ((rest - 1) % 26)) + out;
	return upper ? out.toUpperCase() : out;
}

const ROMAN: [number, string][] = [
	[1000, 'm'],
	[900, 'cm'],
	[500, 'd'],
	[400, 'cd'],
	[100, 'c'],
	[90, 'xc'],
	[50, 'l'],
	[40, 'xl'],
	[10, 'x'],
	[9, 'ix'],
	[5, 'v'],
	[4, 'iv'],
	[1, 'i']
];

function roman(n: number, upper: boolean): string {
	let out = '';
	let rest = n;
	for (const [value, glyph] of ROMAN) {
		while (rest >= value) {
			out += glyph;
			rest -= value;
		}
	}
	return upper ? out.toUpperCase() : out;
}

function counted(symbol: string, n: number): string {
	switch (symbol) {
		case 'a':
		case 'A':
			return n > 0 ? letters(n, symbol === 'A') : String(n);
		case 'i':
		case 'I':
			return n > 0 ? roman(n, symbol === 'I') : String(n);
		default:
			return String(n);
	}
}

export function numberReferenced(pattern: NumberPattern, counters: number[]): string {
	let out = '';
	counters.forEach((n, i) => {
		const piece = pattern.pieces[Math.min(i, pattern.pieces.length - 1)];
		if (i === 0) out += counted(piece.symbol, n);
		else out += (piece.prefix || '.') + counted(piece.symbol, n);
	});
	return out;
}
