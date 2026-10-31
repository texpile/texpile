// @vitest-environment jsdom
// The move-aware reference updater, per dialect. What has to hold everywhere: a path inside a
// comment or a code block is NOT a reference, a partial match is not a match, and a rewrite
// disturbs nothing but the path itself. The typst collector needs the wasm parser, hence jsdom.
import { describe, it, expect } from 'vitest';
import { countFileRefs, fileRefOffsets, replaceFileRefs, refDialectOf } from '$lib/workspace/fileRefs';

describe('refDialectOf', () => {
	it('recognises the three referring dialects and nothing else', () => {
		expect(refDialectOf('C:\\p\\a.tex')).toBe('tex');
		expect(refDialectOf('/p/a.typ')).toBe('typ');
		expect(refDialectOf('/p/README.MD')).toBe('md'); // extension case is not meaningful
		expect(refDialectOf('/p/a.png')).toBe(null);
		expect(refDialectOf('/p/Makefile')).toBe(null);
	});
});

describe('typst references', () => {
	const src = [
		'#include "ch/one.typ"',
		'#import "ch/one.typ": thing',
		'#image("img/a.png", width: 50%)',
		'#figure(image("img/a.png"), caption: [img/a.png])',
		'#bibliography("refs.bib")',
		'// #image("img/a.png") in a comment',
		'`#image("img/a.png")` in raw',
		'#let label = "img/a.png"'
	].join('\n');

	it('counts only real path arguments', () => {
		// two #image calls; the comment, the raw span, the caption text and the let binding are not
		expect(countFileRefs(src, 'img/a.png', 'typ')).toBe(2);
		expect(countFileRefs(src, 'ch/one.typ', 'typ')).toBe(2); // include + import
		expect(countFileRefs(src, 'refs.bib', 'typ')).toBe(1);
	});

	it('requires the extension, unlike LaTeX', () => {
		expect(countFileRefs('#include "ch/one"', 'ch/one.typ', 'typ')).toBe(0);
	});

	it('repoints the path and leaves everything around it alone', () => {
		const { text, count } = replaceFileRefs(src, 'img/a.png', 'assets/b.png', 'typ');
		expect(count).toBe(2);
		expect(text).toContain('#image("assets/b.png", width: 50%)');
		expect(text).toContain('#figure(image("assets/b.png"), caption: [img/a.png])');
		expect(text).toContain('// #image("img/a.png") in a comment');
		expect(text).toContain('`#image("img/a.png")` in raw');
	});

	it('keeps a root-absolute path root-absolute', () => {
		// typst reads a leading / as "from the project root" - dropping it would change the meaning
		expect(replaceFileRefs('#image("/img/a.png")', 'img/a.png', 'assets/b.png', 'typ').text).toBe('#image("/assets/b.png")');
	});
});

describe('markdown references', () => {
	const src = [
		'![alt](img/a.png)',
		'See [the doc](docs/b.md) and [again](./img/a.png).',
		'',
		'```',
		'![no](img/a.png)',
		'```',
		'',
		'`![also no](img/a.png)`',
		'',
		'[ref]: img/a.png'
	].join('\n');

	it('counts links, images and reference definitions, never code', () => {
		expect(countFileRefs(src, 'img/a.png', 'md')).toBe(3); // inline image, ./ link, [ref]:
		expect(countFileRefs(src, 'docs/b.md', 'md')).toBe(1);
	});

	it('preserves a ./ prefix and rewrites the rest', () => {
		const { text, count } = replaceFileRefs(src, 'img/a.png', 'assets/b.png', 'md');
		expect(count).toBe(3);
		expect(text).toContain('![alt](assets/b.png)');
		expect(text).toContain('[again](./assets/b.png)');
		expect(text).toContain('[ref]: assets/b.png');
		// the fenced block and the code span are untouched
		expect(text).toContain('![no](img/a.png)');
		expect(text).toContain('`![also no](img/a.png)`');
	});

	it('matches a percent-encoded destination and encodes a new path that needs it', () => {
		const enc = '[x](img/a%20b.png)';
		expect(countFileRefs(enc, 'img/a b.png', 'md')).toBe(1);
		expect(replaceFileRefs(enc, 'img/a b.png', 'assets/c d.png', 'md').text).toBe('[x](assets/c%20d.png)');
	});

	it('leaves an angle-bracketed destination bracketed', () => {
		expect(replaceFileRefs('[x](<a b.md>)', 'a b.md', 'c d.md', 'md').text).toBe('[x](<c d.md>)');
	});
});

describe('fileRefOffsets', () => {
	it('finds where each dialect includes an image, and nothing for another file', () => {
		const tex = 'Text\n\\includegraphics[width=0.5\\textwidth]{figs/loss.png}\n\\includegraphics{figs/other.png}';
		expect(fileRefOffsets(tex, 'figs/loss.png', 'tex')).toEqual([tex.indexOf('figs/loss.png')]);
		const typ = '#figure(texpile-crop(left: 10%, image("figs/loss.png")))';
		expect(fileRefOffsets(typ, 'figs/loss.png', 'typ')).toEqual([typ.indexOf('figs/loss.png')]);
		expect(fileRefOffsets('![a](figs/loss.png)', 'figs/loss.png', 'md')).toEqual([5]);
	});
});
