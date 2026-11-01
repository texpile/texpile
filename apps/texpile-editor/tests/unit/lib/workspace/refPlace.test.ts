import { describe, expect, it } from 'vitest';
import { countFileRefs, fileRefOffsets, replaceFileRefs, type RefPlace } from '$lib/workspace/fileRefs';
import { refPlaceOf } from '$lib/workspace/refPlace';
import { paperCropsAt } from '$lib/images/uses/paperCropsAt';

const inCh: RefPlace = { folder: 'ch', graphicDirs: [] };

describe('a Typst or Markdown name is read from its own file', () => {
	it('points at the file beside it, not at one of that name in the root', () => {
		const src = '#image("a.png")';
		expect(countFileRefs(src, 'ch/a.png', 'typ', inCh)).toBe(1);
		expect(countFileRefs(src, 'a.png', 'typ', inCh)).toBe(0);
		expect(countFileRefs('#image("../a.png")', 'a.png', 'typ', inCh)).toBe(1);
		expect(countFileRefs('#image("/a.png")', 'a.png', 'typ', inCh)).toBe(1);
		expect(countFileRefs('![x](a.png)', 'ch/a.png', 'md', inCh)).toBe(1);
	});

	it('is written again from there', () => {
		expect(replaceFileRefs('#image("a.png")', 'ch/a.png', 'ch/b.png', 'typ', inCh).text).toBe('#image("b.png")');
		expect(replaceFileRefs('#image("a.png")', 'ch/a.png', 'img/b.png', 'typ', inCh).text).toBe('#image("../img/b.png")');
		expect(replaceFileRefs('#image("/ch/a.png")', 'ch/a.png', 'img/b.png', 'typ', inCh).text).toBe('#image("/img/b.png")');
	});
});

describe('a LaTeX name is read from where TeX runs', () => {
	it('finds a graphic through \\graphicspath, and keeps the name short', () => {
		const place: RefPlace = { folder: '', graphicDirs: ['figs'] };
		const src = '\\includegraphics{a.png}';
		expect(countFileRefs(src, 'figs/a.png', 'tex', place)).toBe(1);
		expect(replaceFileRefs(src, 'figs/a.png', 'figs/b.png', 'tex', place).text).toBe('\\includegraphics{b.png}');
		expect(countFileRefs('\\input{a.png}', 'figs/a.png', 'tex', place)).toBe(0);
	});

	it('takes a fragment from the main file, a document of its own from its own folder', () => {
		const main = '\\graphicspath{{./figs/}{pics/}}% {old/}\n\\begin{document}\\end{document}';
		expect(refPlaceOf('tex', 'paper/ch/one.tex', 'paper/main.tex', 'Text.', main)).toEqual({
			folder: 'paper',
			graphicDirs: ['figs', 'pics']
		});
		expect(refPlaceOf('tex', 'other/doc.tex', 'paper/main.tex', '\\begin{document}\\end{document}', main)).toEqual({
			folder: 'other',
			graphicDirs: []
		});
		expect(refPlaceOf('typ', 'ch/one.typ', null, '', '')).toEqual({ folder: 'ch', graphicDirs: [] });
	});
});

describe('a use that cuts the image', () => {
	const cut = (text: string, dialect: 'tex' | 'typ') => paperCropsAt(text, fileRefOffsets(text, 'a.png', dialect)[0], dialect);

	it('is read from its call', () => {
		expect(cut('\\includegraphics[width=2cm, trim=1 2 3 4, clip]{a.png}', 'tex')).toBe(true);
		expect(cut('\\includegraphics[viewport=0 0 1 1]{a.png}', 'tex')).toBe(true);
		expect(cut('\\includegraphics[width=2cm, angle=90]{a.png}', 'tex')).toBe(false);
		expect(cut('\\includegraphics{a.png}', 'tex')).toBe(false);
		expect(cut('#texpile-crop(left: 10%, image("a.png"))', 'typ')).toBe(true);
		expect(cut('#texpile-crop(turn: 90deg, image("a.png"))', 'typ')).toBe(false);
		expect(cut('#image("a.png")', 'typ')).toBe(false);
	});
});
