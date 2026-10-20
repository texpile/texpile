import { describe, expect, it } from 'vitest';
import {
	ACCENTS,
	ACCENT_COMMANDS,
	SYMBOLS,
	accented,
	decodeTexCharacters,
	escapedCharacter
} from '$lib/languages/latex/knowledge/commands/texCharacters';

describe('texCharacters', () => {
	it('reads the marks and symbols from the package data', () => {
		expect(Object.keys(ACCENTS)).toHaveLength(15);
		expect(accented('v', 'c')).toBe('č');
		expect(accented('b', 't')).toBe('ṯ');
		expect(SYMBOLS.textdollar).toBe('$');
		expect(SYMBOLS.ldots).toBe('…');
		// the letters TeX builds from pieces have no prints in the data
		expect(SYMBOLS.LaTeX).toBe('LaTeX');
	});

	it('parses \\t like an accent but never composes it', () => {
		expect(ACCENT_COMMANDS.has('t')).toBe(true);
		expect(ACCENTS.t).toBeUndefined();
	});

	it('decodes accents, symbols and self-printing control symbols', () => {
		expect(escapedCharacter('\\&')).toBe('&');
		expect(escapedCharacter('\\,')).toBeNull();
		expect(decodeTexCharacters('Na\\"{\\i}ve \\S 1 \\textendash{}5 100\\%')).toBe('Naïve §1 –5 100%');
		expect(decodeTexCharacters('a\\\\ss')).toBe('a\\\\ss');
	});
});
