// a counter's value as TeX prints it in each style, and read back from the end of a printed number
export type NumberStyle = 'arabic' | 'Alph' | 'alph' | 'Roman' | 'roman' | 'fnsymbol';

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
// the kernel's \@fnsymbol, as text
const SYMBOLS = ['*', '†', '‡', '§', '¶', '‖', '**', '††', '‡‡'];

function toRoman(n: number): string {
	let out = '';
	let rest = n;
	for (const [value, letters] of ROMAN)
		while (rest >= value) {
			out += letters;
			rest -= value;
		}
	return out;
}

export function printedValue(value: number, style: NumberStyle): string {
	// a letter for 0 is nothing, as \@Alph's \ifcase prints
	if (style === 'Alph') return value < 1 ? '' : String.fromCharCode(64 + Math.min(26, value));
	if (style === 'alph') return value < 1 ? '' : String.fromCharCode(96 + Math.min(26, value));
	if (style === 'Roman') return toRoman(value).toUpperCase();
	if (style === 'roman') return toRoman(value);
	if (style === 'fnsymbol') return SYMBOLS[value - 1] ?? String(value);
	return String(value);
}

function romanValue(s: string): number | null {
	let n = 0;
	let rest = s.toLowerCase();
	for (const [value, letters] of ROMAN)
		while (rest.startsWith(letters)) {
			n += value;
			rest = rest.slice(letters.length);
		}
	return rest === '' && n > 0 && toRoman(n) === s.toLowerCase() ? n : null;
}

/** the value a printed number ends in; `prefer`, the style of the counter's form, settles a letter a roman numeral could be too */
export function trailingValue(text: string, prefer?: NumberStyle): { value: number; style: NumberStyle; length: number } | null {
	const digits = /\d+$/.exec(text);
	if (digits) return { value: Number(digits[0]), style: 'arabic', length: digits[0].length };
	const symbol = [...SYMBOLS].reverse().find((s) => text.endsWith(s));
	if (symbol) return { value: SYMBOLS.indexOf(symbol) + 1, style: 'fnsymbol', length: symbol.length };
	const run = /[A-Za-z]+$/.exec(text)?.[0];
	if (!run) return null;
	const roman = romanValue(run);
	const romanStyle: NumberStyle = run === run.toUpperCase() ? 'Roman' : 'roman';
	const letter = run[run.length - 1];
	const letterRead = {
		value: letter.toLowerCase().charCodeAt(0) - 96,
		style: (letter === letter.toUpperCase() ? 'Alph' : 'alph') as NumberStyle,
		length: 1
	};
	if (run.length > 1) return roman !== null ? { value: roman, style: romanStyle, length: run.length } : letterRead;
	if (prefer === 'Roman' || prefer === 'roman') return roman !== null ? { value: roman, style: romanStyle, length: 1 } : letterRead;
	if (prefer === 'Alph' || prefer === 'alph') return letterRead;
	// a lone I is a part's or front matter's numeral
	return /^[Ii]$/.test(run) ? { value: 1, style: romanStyle, length: 1 } : letterRead;
}
