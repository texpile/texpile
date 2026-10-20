// the characters LaTeX's accent and symbol commands print: which commands the editor reads is a list of names here,
// what each prints comes from the package data
import { commandsWith, commonFacts } from './commandFacts';

const ACCENT_NAMES = ["'", '`', '^', '"', '~', '=', '.', 'u', 'v', 'H', 'r', 'c', 'k', 'd', 'b'];

// \t puts a tie over two letters, which no single-letter composition draws; it parses like an accent and stays source
const TIE_ACCENT = 't';

const SYMBOL_NAMES = (
	'S P AA aa ss o O ae AE oe OE l L i j dag ddag dh DH th TH ng NG copyright textcopyright ' +
	'textregistered texttrademark pounds textsterling euro texteuro textyen textcent ldots dots ' +
	'textellipsis textbackslash textasciitilde textasciicircum textbar textbullet textperiodcentered ' +
	'textdegree textless textgreater textquotedbl textquotesingle textquoteleft textquoteright ' +
	'textquotedblleft textquotedblright textendash textemdash textexclamdown textquestiondown ' +
	'guillemotleft guillemotright guilsinglleft guilsinglright textsection textparagraph textdagger ' +
	'textdaggerdbl textmu textonehalf textonequarter textthreequarters textpm texttimes textdiv ' +
	'textminus checkmark textdollar textunderscore textbraceleft textbraceright SS LaTeX LaTeXe TeX BibTeX'
).split(' ');

function printedBy(names: string[]): Record<string, string> {
	const out: Record<string, string> = {};
	for (const name of names) {
		const { prints } = commonFacts(name);
		if (prints) out[name] = prints;
	}
	return out;
}

/** accent command name to the combining mark it puts over (or under) its letter */
export const ACCENTS: Record<string, string> = printedBy(ACCENT_NAMES);

/** every command whose argument is the letter it marks, \t's tie included */
export const ACCENT_COMMANDS: ReadonlySet<string> = new Set([...ACCENT_NAMES, TIE_ACCENT]);

/** symbol commands that take no argument, to what they print */
export const SYMBOLS: Record<string, string> = printedBy(SYMBOL_NAMES);

/** the symbol commands that print one letter (\ss, \o, \th) */
export const LETTER_SYMBOLS: string[] = Object.keys(SYMBOLS)
	.filter((name) => /^\p{L}$/u.test(SYMBOLS[name]))
	.sort((a, b) => b.length - a.length);

let selfPrinting: Set<string> | undefined;

/** the character a control symbol that prints itself stands for (\& is &), or null for any other command */
export function escapedCharacter(command: string): string | null {
	if (command.length !== 2 || command[0] !== '\\') return null;
	selfPrinting ??= new Set(
		commandsWith('prints').filter((name) => name.length === 1 && !/[a-zA-Z]/.test(name) && commonFacts(name).prints === name)
	);
	return selfPrinting.has(command[1]) ? command[1] : null;
}

/** the letter with a dotless i or j under a mark written as the dotted letter, which draws the same */
export function dottedLetters(text: string): string {
	return text
		.replace(/\u0131(?=\p{M})/gu, 'i')
		.replace(/\u0237(?=\p{M})/gu, 'j')
		.normalize('NFC');
}

/** the letter an accent's argument names: a letter, or a dotless i or j */
export function accentBase(argument: string): string | null {
	const t = argument.trim();
	if (/^\\i$/.test(t)) return 'ı';
	if (/^\\j$/.test(t)) return 'ȷ';
	if (/^\p{L}$/u.test(t)) return t;
	return null;
}

/** the accented letter as one character where Unicode has one */
export function accented(accent: string, base: string): string {
	return (base + ACCENTS[accent]).normalize('NFC');
}

// an accent's letter: a letter accent (\v) ends at a space or a brace, as TeX reads it
const ACCENT_LETTER = /^\s*\{([^{}]*)\}|^\s+(\\[ij](?![a-zA-Z])|\p{L})/u;
const SYMBOL_ACCENT_LETTER = /^\s*\{([^{}]*)\}|^\s*(\\[ij](?![a-zA-Z])|\p{L})/u;

/** the accented letter or symbol the command whose backslash is at `at` prints, and where the command ends */
export function readTexCharacter(s: string, at: number): { text: string; end: number } | null {
	const name = /^(?:[a-zA-Z]+|[^a-zA-Z\s])/.exec(s.slice(at + 1, at + 32))?.[0];
	if (!name) return null;
	let i = at + 1 + name.length;
	if (Object.hasOwn(SYMBOLS, name)) {
		if (s.startsWith('{}', i)) i += 2;
		else while (/\s/.test(s[i] ?? '')) i++;
		return { text: SYMBOLS[name], end: i };
	}
	if (!Object.hasOwn(ACCENTS, name)) return null;
	const letter = (/[a-zA-Z]/.test(name) ? ACCENT_LETTER : SYMBOL_ACCENT_LETTER).exec(s.slice(i));
	const base = letter && accentBase(letter[1] ?? letter[2]);
	return base ? { text: accented(name, base), end: i + letter[0].length } : null;
}

/** `text` with each accent and symbol command, and each control symbol that prints itself, replaced by what it prints */
export function decodeTexCharacters(text: string): string {
	let out = '';
	let i = 0;
	for (let at = text.indexOf('\\'); at >= 0; at = text.indexOf('\\', i)) {
		out += text.slice(i, at);
		const escaped = escapedCharacter(text.slice(at, at + 2));
		const read = escaped === null ? readTexCharacter(text, at) : null;
		if (escaped !== null) {
			out += escaped;
			i = at + 2;
		} else if (read) {
			out += dottedLetters(read.text);
			i = read.end;
		} else {
			// a second backslash or a space after the first is not the start of a command
			i = at + (/[a-zA-Z]/.test(text[at + 1] ?? '') ? 1 : 2);
			out += text.slice(at, i);
		}
	}
	return out + text.slice(i);
}
