import { describe, expect, it } from 'vitest';
import { readCharacter } from '$lib/languages/latex/visual/plugins/character/characterCommand';

const direct = (source: string) => readCharacter(source)?.direct ?? null;

describe('characterCommand', () => {
	it('gives the one character a file can hold for an accent or a symbol', () => {
		expect(direct("\\'e")).toBe('é');
		expect(direct('\\v c')).toBe('č');
		expect(direct('\\H{o}')).toBe('ő');
		// TeX's dotless i under the accent, a plain i when typed
		expect(direct('\\"{\\i}')).toBe('ï');
		expect(direct('\\AA ')).toBe('Å');
		expect(direct('\\LaTeX')).toBeNull();
	});

	it('reads a letter accent only where TeX ends its name', () => {
		expect(readCharacter('\\uu')).toBeNull();
		expect(readCharacter('\\vc')).toBeNull();
	});
});
