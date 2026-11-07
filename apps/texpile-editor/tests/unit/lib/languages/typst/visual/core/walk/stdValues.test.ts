// @vitest-environment jsdom
// the values Typst's own calls print: a picture's file, a date, a footnote's note, code, a line, and a code chip's edit
import { describe, it, expect } from 'vitest';
import { typstFace } from '$lib/languages/typst/visual/core/walk/typstFace';
import { typstChipKind } from '$lib/languages/typst/visual/extensions/typstChipKind';
import { readImage } from '$lib/languages/typst/visual/plugins/image/imageCall';
import { typstScopeNow } from '$lib/languages/typst/visual/core/scope/fileScopeNow.svelte';
import { typSchema } from '$lib/languages/typst/visual/schema';

typstScopeNow.current = null;

describe('values', () => {
	it('reads the file of an image and its size, a root path from the root', () => {
		expect(readImage('#image("/figures/a.svg", width: 60%)')).toEqual({ path: 'figures/a.svg', width: '60%', height: null });
		expect(readImage('#image("a.png", width: 2cm, height: 1cm)')).toMatchObject({ width: '2cm', height: '1cm' });
		expect(readImage('#link("a.png")')).toBeNull();
	});

	it('draws a date as Typst prints it', () => {
		const year = String(new Date().getFullYear());
		expect(typstFace('#datetime.today().display("[year]")')?.dom.textContent).toBe(year);
		expect(typstFace('#datetime(year: 2024, month: 3, day: 5).display("[day].[month]")')?.dom.textContent).toBe('05.03');
	});

	it('draws code with its language as code, a block as a block', () => {
		const inline = typstFace('#raw("let x = 1", lang: "rust")');
		expect(inline?.dom.tagName).toBe('CODE');
		expect(inline?.dom.textContent).toBe('let x = 1');
		expect(typstFace('#raw("a\\nb", lang: "rust", block: true)')?.dom.tagName).toBe('PRE');
	});

	it('draws text with a language as words, and a styling call in its style without a border', () => {
		expect(typstFace('#text("Guten Tag", lang: "de")')?.dom.tagName).toBe('SPAN');
		const strong = typstFace('#strong("Heavy")')?.dom;
		expect(strong?.style.fontWeight).toBe('bold');
		expect(typstFace('#underline("Under", stroke: 2pt + red)')?.dom.style.border).toBe('');
	});

	it('draws a line shorter than the column at its length and leaves one along an angle as code', () => {
		expect(typstFace('#line(length: 40%)')?.dom.style.width).toBe('40%');
		expect(typstFace('#line(length: 40%, angle: 30deg)')).toBeNull();
	});
});

describe('a footnote whose note is an argument', () => {
	it('is drawn as the mark with its note in the hint, and no other call with a string is', () => {
		expect(typstFace('#footnote(note)')).toBeNull();
		expect(typstFace('#footnote("A note")')?.dom.tagName).toBe('SUP');
		expect(typstFace('#heading("A heading")')).toBeNull();
	});
});

describe('a chip of code without its hash', () => {
	it('is edited as that code, never read again as words', () => {
		const chip = typSchema.nodes.raw_latex.create({ lang: 'typst' }, typSchema.text('rect(width: 1cm)'));
		expect(typstChipKind(true).reparse('rect(width: 2cm)', chip)).toBeNull();
	});
});
