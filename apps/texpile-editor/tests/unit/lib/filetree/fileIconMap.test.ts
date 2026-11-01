import { describe, it, expect } from 'vitest';
import { fileIconSvg, folderIconSvg } from '$lib/filetree/fileIconMap';

/** the vendored icons are single-path; identify one by a distinctive slice of its markup */
const distinct = (name: string) => fileIconSvg(name)?.replace(/\s+/g, '') ?? '';

describe('fileIconSvg', () => {
	it('resolves the editor formats to their own icons', () => {
		const tex = distinct('paper.tex');
		const md = distinct('notes.md');
		const bib = distinct('refs.bib');
		const pdf = distinct('out.pdf');
		expect(new Set([tex, md, bib, pdf]).size).toBe(4); // all different
	});

	// the pack's own hues are what distinguish the icons; a retint to a single tone made dense
	// glyphs read heavier than sparse ones, so the colours are deliberately kept (see NOTICE.md)
	it('keeps the upstream colors', () => {
		for (const f of ['a.tex', 'a.md', 'a.bib', 'a.png', 'a.pdf', 'a.zip', 'a.csv']) {
			expect(fileIconSvg(f)).toMatch(/fill="#[0-9a-fA-F]{3,8}"/);
		}
		expect(fileIconSvg('a.tex')).not.toContain('currentColor');
	});

	it('groups extensions onto a shared icon', () => {
		expect(distinct('fig.png')).toBe(distinct('fig.jpeg'));
		expect(distinct('a.cls')).toBe(distinct('a.tex')); // LaTeX class/style files
		expect(distinct('a.yml')).toBe(distinct('a.yaml'));
		expect(distinct('a.tgz')).toBe(distinct('a.zip'));
	});

	it('svg is its own icon, not the raster image one', () => {
		expect(distinct('logo.svg')).not.toBe(distinct('logo.png'));
	});

	it('a tikz file has its own icon', () => {
		expect(distinct('hi.tikz')).not.toBe(distinct('hi.tex'));
		expect(distinct('hi.tikz')).not.toBe(distinct('plain.txt'));
	});

	it('matches known filenames ahead of the extension', () => {
		expect(distinct('README.md')).not.toBe(distinct('notes.md'));
		expect(distinct('LICENSE')).toBe(distinct('license.txt'));
		expect(distinct('.gitignore')).toBe(distinct('.gitattributes'));
	});

	it('is case-insensitive and path-tolerant', () => {
		expect(distinct('C:/ws/sub/Paper.TEX')).toBe(distinct('paper.tex'));
		expect(distinct('C:\\ws\\sub\\Notes.Md')).toBe(distinct('notes.md'));
	});

	it('multi-dot names use the last segment', () => {
		expect(distinct('paper.final.v2.tex')).toBe(distinct('paper.tex'));
	});

	it('unknown and extensionless files fall back to the document glyph', () => {
		expect(distinct('mystery.qqq')).toBe(distinct('plain.txt'));
		expect(distinct('Makefile')).toBe(distinct('plain.txt'));
		// the create-file row renders before a name is typed; a null here collapses its icon slot
		expect(distinct('')).toBe(distinct('plain.txt'));
	});

	it('every icon carries a square viewBox, which is what centres them uniformly', () => {
		for (const f of ['a.tex', 'a.md', 'a.bib', 'a.png', 'a.svg', 'a.pdf', 'a.csv', 'a.zip', 'a.mp3']) {
			const m = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(fileIconSvg(f) ?? '');
			expect(m, `${f} has no parsable viewBox`).toBeTruthy();
			expect(m![1], `${f} is not square`).toBe(m![2]);
		}
	});
});

describe('folderIconSvg', () => {
	it('open and closed are different glyphs', () => {
		expect(folderIconSvg(true)).toBeTruthy();
		expect(folderIconSvg(false)).toBeTruthy();
		expect(folderIconSvg(true)).not.toBe(folderIconSvg(false));
	});

	it('is not a file glyph, and no filename can reach it', () => {
		expect(folderIconSvg(false)).not.toBe(fileIconSvg('plain.txt'));
		// directories have no extension, so the file table must never resolve to a folder
		for (const f of ['folder', 'folder.md', 'images', 'output']) {
			expect(fileIconSvg(f)).not.toBe(folderIconSvg(false));
			expect(fileIconSvg(f)).not.toBe(folderIconSvg(true));
		}
	});

	it('keeps the upstream colour and a square viewBox, like the file icons', () => {
		for (const svg of [folderIconSvg(false), folderIconSvg(true)]) {
			expect(svg).toMatch(/fill="#[0-9a-fA-F]{3,8}"/);
			const m = /viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/.exec(svg ?? '');
			expect(m, 'folder icon has no parsable viewBox').toBeTruthy();
			expect(m![1], 'folder icon is not square').toBe(m![2]);
		}
	});
});
