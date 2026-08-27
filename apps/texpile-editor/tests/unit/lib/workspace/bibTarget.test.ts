import { describe, expect, it } from 'vitest';
import { appendBibEntries, bibPathFromSource, citationTextFor, translatorForSource } from '$lib/workspace/bibTarget';

describe('bibPathFromSource', () => {
	it('takes addbibresource as written, options and all', () => {
		expect(bibPathFromSource('\\addbibresource{refs.bib}', 'tex')).toBe('refs.bib');
		expect(bibPathFromSource('\\addbibresource[datatype=bibtex]{sub/refs.bib}', 'tex')).toBe('sub/refs.bib');
	});

	it('appends .bib to extensionless names (both commands)', () => {
		expect(bibPathFromSource('\\addbibresource{refs}', 'tex')).toBe('refs.bib');
		expect(bibPathFromSource('\\bibliography{refs}', 'tex')).toBe('refs.bib');
	});

	it('takes the first file of a \\bibliography list', () => {
		expect(bibPathFromSource('\\bibliography{main, extra}', 'tex')).toBe('main.bib');
	});

	it('prefers addbibresource when both appear', () => {
		expect(bibPathFromSource('\\bibliography{old}\n\\addbibresource{new.bib}', 'tex')).toBe('new.bib');
	});

	it('reads typst bibliography calls, including the array form', () => {
		expect(bibPathFromSource('#bibliography("refs.bib")', 'typ')).toBe('refs.bib');
		expect(bibPathFromSource('#bibliography(("a.bib", "b.bib"), style: "apa")', 'typ')).toBe('a.bib');
	});

	it('returns null when nothing is declared', () => {
		expect(bibPathFromSource('\\documentclass{article}', 'tex')).toBeNull();
		expect(bibPathFromSource('= Heading', 'typ')).toBeNull();
	});
});

describe('translatorForSource', () => {
	it('picks biblatex for addbibresource or an explicit biblatex load', () => {
		expect(translatorForSource('\\addbibresource{r.bib}', 'tex')).toBe('Better BibLaTeX');
		expect(translatorForSource('\\usepackage[backend=biber]{biblatex}', 'tex')).toBe('Better BibLaTeX');
	});

	it('classic bibliography gets plain BibTeX; typst always biblatex', () => {
		expect(translatorForSource('\\bibliography{r}', 'tex')).toBe('Better BibTeX');
		expect(translatorForSource('anything', 'typ')).toBe('Better BibLaTeX');
	});
});

const KNUTH = '@article{knuth84,\n  title = {Literate Programming},\n  author = {Knuth, Donald E.},\n  year = {1984}\n}';
const LAMPORT = '@book{lamport94,\n  title = {LaTeX: A Document Preparation System},\n  author = {Lamport, Leslie},\n  year = {1994}\n}';

describe('appendBibEntries', () => {
	it('appends new entries and reports their keys', () => {
		const r = appendBibEntries(KNUTH, LAMPORT);
		expect(r.added).toEqual(['lamport94']);
		expect(r.skipped).toEqual([]);
		expect(r.text).toContain('knuth84');
		expect(r.text).toContain('lamport94');
	});

	it('skips keys the file already has, keeping the existing entry byte-for-byte', () => {
		const edited = KNUTH.replace('1984', '1984, note = {hand-edited}');
		const r = appendBibEntries(edited, KNUTH + '\n\n' + LAMPORT);
		expect(r.added).toEqual(['lamport94']);
		expect(r.skipped).toEqual(['knuth84']);
		expect(r.text).toContain('hand-edited');
		expect(r.text.match(/knuth84/g)).toHaveLength(1);
	});

	it('leaves the file untouched when nothing is new', () => {
		const r = appendBibEntries(KNUTH, KNUTH);
		expect(r.text).toBe(KNUTH);
		expect(r.added).toEqual([]);
		expect(r.skipped).toEqual(['knuth84']);
	});

	it('starts an empty file without leading blank lines', () => {
		const r = appendBibEntries('', KNUTH);
		expect(r.text.startsWith('@article')).toBe(true);
		expect(r.text.endsWith('\n')).toBe(true);
	});

	it("matches the existing file's CRLF line endings in what it appends", () => {
		const crlf = KNUTH.replace(/\n/g, '\r\n');
		const r = appendBibEntries(crlf, LAMPORT);
		const appended = r.text.slice(crlf.replace(/\s+$/, '').length);
		expect(appended).not.toMatch(/(?<!\r)\n/);
	});
});

describe('citationTextFor', () => {
	it('renders each dialect', () => {
		expect(citationTextFor(['a', 'b'], 'tex')).toBe('\\cite{a,b}');
		expect(citationTextFor(['a', 'b'], 'typ')).toBe('@a @b');
	});
});
