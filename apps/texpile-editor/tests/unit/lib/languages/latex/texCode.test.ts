import { describe, expect, it } from 'vitest';
import { codeOnly } from '$lib/languages/latex/texCode';

/** the text that survives, spaces collapsed */
const kept = (tex: string) => codeOnly(tex).replace(/\s+/g, ' ').trim();

describe('codeOnly: \\iffalse blocks', () => {
	it('blanks to the \\fi that closes the \\iffalse, past a nested conditional and its own \\fi', () => {
		const tex = '\\iffalse\n\\ifx\\a\\b one \\else two \\fi\n\\label{gone}\n\\fi\n\\label{kept}';
		expect(kept(tex)).toBe('\\label{kept}');
		expect(codeOnly(tex)).toHaveLength(tex.length);
	});

	it('counts no \\ifthenelse, \\iftoggle or \\iff as a conditional that needs a \\fi', () => {
		expect(kept('\\iffalse \\ifthenelse{\\boolean{x}}{a}{b} \\iftoggle{t}{a}{b} $p \\iff q$ \\fi after')).toBe('after');
	});

	it('counts no conditional that \\newif or \\let only names', () => {
		expect(kept('\\iffalse \\newif\\ifdraft \\let\\ifdraft=\\iftrue \\fi \\label{kept} \\fi')).toBe('\\label{kept} \\fi');
		// \let names a conditional; it opens no block
		expect(kept('\\let\\ifdraft\\iffalse \\label{kept} \\fi')).toBe('\\let\\ifdraft\\iffalse \\label{kept} \\fi');
	});

	it('blanks an \\iffalse its \\fi never closes only to the first \\fi, and one with no \\fi not at all', () => {
		expect(kept('\\iffalse \\ifnum1=1 a \\fi b \\label{kept}')).toBe('b \\label{kept}');
		expect(kept('\\iffalse a \\label{kept}')).toBe('\\iffalse a \\label{kept}');
	});
});
