// The generated symbol table (scripts/gen-typst-symbols.mjs) as the picker reads it: every row lands
// in a tab, names are unique, deprecated names stay out, and every shorthand names a real symbol.
import { describe, expect, it } from 'vitest';
import { TYPST_MARKUP_SHORTHANDS, TYPST_MATH_SHORTHANDS, TYPST_SYMBOL_ROWS } from '$lib/languages/typst/symbols/typstSymbolTable';
import { typstSymbolByName, typstSymbolList } from '$lib/languages/typst/symbols/typstSymbols';
import { invisibleSymbolLabel, typstSymbolGlyphText } from '$lib/languages/typst/symbols/typstSymbolLabels';

const list = typstSymbolList();

describe('the table', () => {
	it('puts every row in exactly one tab', () => {
		const rows = Object.values(TYPST_SYMBOL_ROWS).reduce((n, r) => n + r.length, 0);
		expect(list).toHaveLength(rows);
		expect(new Set(list.map((s) => s.name)).size).toBe(rows);
	});

	it('holds both modules', () => {
		expect(typstSymbolByName('sym.arrow.r.double')?.value).toBe('⇒');
		expect(typstSymbolByName('emoji.face.grin')?.value).toBe('😀');
		expect(typstSymbolByName('sym.alpha')?.group).toBe('greek');
		expect(typstSymbolByName('emoji.face.grin')?.group).toBe('emoji');
	});

	it('leaves deprecated names out', () => {
		expect(typstSymbolByName('sym.join')).toBeUndefined();
		expect(typstSymbolByName('sym.gt.tri')).toBeUndefined();
		expect(typstSymbolByName('sym.gt.closed')).toBeDefined();
	});

	it('names a real symbol for every shorthand', () => {
		for (const name of [...Object.keys(TYPST_MATH_SHORTHANDS), ...Object.keys(TYPST_MARKUP_SHORTHANDS)])
			expect(typstSymbolByName(name), name).toBeDefined();
		expect(typstSymbolByName('sym.arrow.r.double')?.mathShorthand).toBe('=>');
		expect(typstSymbolByName('sym.dash.en')?.markupShorthand).toBe('--');
	});
});

describe('how a tile shows a symbol', () => {
	it('labels a character with no ink by name', () => {
		const thin = typstSymbolByName('sym.space.thin')!;
		expect(thin.invisible).toBe(true);
		expect(invisibleSymbolLabel(thin)).toBe('thin');
		expect(invisibleSymbolLabel(typstSymbolByName('sym.zws')!)).toBe('zws');
	});

	it('puts a combining mark on a dotted circle', () => {
		const mark = typstSymbolByName('sym.dot.triple')!;
		expect(mark.invisible).toBe(false);
		expect(typstSymbolGlyphText(mark)).toBe('◌' + mark.value);
		expect(typstSymbolGlyphText(typstSymbolByName('sym.alpha')!)).toBe('α');
	});
});
