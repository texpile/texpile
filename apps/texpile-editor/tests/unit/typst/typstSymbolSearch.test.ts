// The symbol picker's search, against the real generated table: by Typst name, by meaning (the
// words a modifier stands for and Unicode's character names), by shorthand and by the glyph itself.
import { describe, expect, it } from 'vitest';
import { typstSymbolList } from '$lib/languages/typst/symbols/typstSymbols';
import { searchTypstSymbols } from '$lib/languages/typst/symbols/typstSymbolSearch';

const symbols = typstSymbolList();

/** the names a query finds, best first */
function find(query: string, recent: string[] = []): string[] {
	return searchTypstSymbols(symbols, query, recent).map((s) => s.name);
}

describe('searching by meaning', () => {
	it('reads the modifiers as words', () => {
		expect(find('arrow right double')[0]).toBe('sym.arrow.r.double');
		expect(find('double arrow right')[0]).toBe('sym.arrow.r.double');
		expect(find('arrow left')[0]).toBe('sym.arrow.l');
	});

	it('finds not equal in either order', () => {
		expect(find('not equal')[0]).toBe('sym.eq.not');
		expect(find('equal not')[0]).toBe('sym.eq.not');
	});

	it('matches Unicode names', () => {
		expect(find('rightwards double arrow')[0]).toBe('sym.arrow.r.double');
		expect(find('infinity')).toContain('sym.infinity');
		expect(find('partial')[0]).toBe('sym.partial');
	});

	it('matches word prefixes, every word required', () => {
		expect(find('arr ri dou')[0]).toBe('sym.arrow.r.double');
		expect(find('arrow zzz')).toEqual([]);
	});

	it('finds a whole category by its name', () => {
		expect(find('greek')).toContain('sym.alpha');
		expect(find('currency')).toContain('sym.euro');
	});
});

describe('searching by name', () => {
	it('puts the exact name first, the same case before another', () => {
		expect(find('alpha')[0]).toBe('sym.alpha');
		expect(find('Alpha')[0]).toBe('sym.Alpha');
	});

	it('takes the dotted spelling and the module prefix', () => {
		expect(find('arrow.r.double')[0]).toBe('sym.arrow.r.double');
		expect(find('sym.arrow.r')[0]).toBe('sym.arrow.r');
		expect(find('emoji.face.grin')[0]).toBe('emoji.face.grin');
	});

	it('ranks shorter names first among equal matches', () => {
		const found = find('arrow r');
		expect(found.indexOf('sym.arrow.r')).toBeLessThan(found.indexOf('sym.arrow.r.long'));
	});

	it('prefers sym to emoji for a shared word', () => {
		const found = find('arrow');
		const firstEmoji = found.findIndex((n) => n.startsWith('emoji.'));
		expect(found[0].startsWith('sym.')).toBe(true);
		expect(firstEmoji).toBeGreaterThan(0);
	});
});

describe('searching by shorthand or glyph', () => {
	it('finds the symbol a math shorthand stands for', () => {
		expect(find('=>')[0]).toBe('sym.arrow.r.double');
		expect(find('!=')[0]).toBe('sym.eq.not');
		expect(find('->')[0]).toBe('sym.arrow.r');
	});

	it('finds the symbol a markup shorthand stands for', () => {
		expect(find('---')[0]).toBe('sym.dash.em');
		expect(find('~')).toContain('sym.space.nobreak');
	});

	it('lists the longer shorthands a partial one starts', () => {
		expect(find('<=')).toEqual(expect.arrayContaining(['sym.lt.eq', 'sym.arrow.l.r.double', 'sym.arrow.l.double.long']));
	});

	it('finds a pasted character', () => {
		expect(find('⇒')[0]).toBe('sym.arrow.r.double');
		expect(find('α')[0]).toBe('sym.alpha');
	});
});

describe('recent symbols', () => {
	it('rise above equal matches', () => {
		expect(find('arrow right double')[0]).toBe('sym.arrow.r.double');
		expect(find('arrow right double', ['sym.arrow.l.r.double'])[0]).toBe('sym.arrow.l.r.double');
	});

	it('do not lift a symbol the query does not match', () => {
		expect(find('alpha', ['sym.arrow.r'])).not.toContain('sym.arrow.r');
	});
});

it('finds nothing for an empty query', () => {
	expect(find('')).toEqual([]);
	expect(find('   ')).toEqual([]);
});
