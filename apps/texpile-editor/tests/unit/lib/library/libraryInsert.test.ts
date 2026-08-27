import { describe, expect, it } from 'vitest';
import { libraryEntriesToBib } from '$lib/library/insertFromLibrary';
import { citationRefsWithLibrary } from '$lib/library/libraryRefs';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';

const ref = (key: string, extra: Partial<BiblatexReference> = {}): BiblatexReference => ({
	key,
	entrytype: 'article',
	title: 'A title',
	author: 'Doe, Jane',
	year: '2024',
	...extra
});

describe('libraryEntriesToBib', () => {
	it('prefers the verbatim raw when the store has it', () => {
		const raw = '@article{smith2024,\n  title = {Hand written formatting},\n}';
		const out = libraryEntriesToBib(['smith2024'], [ref('smith2024', { raw })]);
		expect(out).toContain(raw);
		expect(out).not.toContain('author');
	});

	it('pretty-prints entries without raw', () => {
		const out = libraryEntriesToBib(['doe2024'], [ref('doe2024')]);
		expect(out).toContain('@article{doe2024,');
		expect(out).toContain('title = {A title}');
	});

	it('keeps the picked order and separates entries with a blank line', () => {
		const out = libraryEntriesToBib(['b', 'a'], [ref('a'), ref('b')]);
		expect(out.indexOf('@article{b,')).toBeLessThan(out.indexOf('@article{a,'));
		expect(out).toContain('\n\n');
	});

	it('skips keys the store does not have', () => {
		const out = libraryEntriesToBib(['present', 'missing'], [ref('present')]);
		expect(out).toContain('@article{present,');
		expect(out).not.toContain('missing');
	});

	it('returns empty text when no key resolves', () => {
		expect(libraryEntriesToBib(['nope'], [ref('other')])).toBe('');
		expect(libraryEntriesToBib([], [ref('other')])).toBe('');
	});
});

describe('citationRefsWithLibrary', () => {
	it('is empty when both shelves are empty', () => {
		expect(citationRefsWithLibrary([])).toEqual([]);
	});

	it('keeps project refs and appends library refs after them', () => {
		const project = [ref('p1')];
		const out = citationRefsWithLibrary(project);
		// the library store is empty in the test env, so only project refs survive
		expect(out.map((r) => r.key)).toEqual(['p1']);
	});

	it('never duplicates a project key', () => {
		const project = [ref('shared')];
		const out = citationRefsWithLibrary(project);
		expect(out.filter((r) => r.key === 'shared')).toHaveLength(1);
	});
});
