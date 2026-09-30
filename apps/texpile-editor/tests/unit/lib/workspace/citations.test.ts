import { describe, it, expect } from 'vitest';
import { mergeReferences, parseBibItems, bblToReferences, loadReferences, references } from '../../../../src/lib/workspace/citations';

const bibA = `@book{smith2020, author = {Smith, J.}, title = {Alpha}, year = {2020}}`;
const bibB = `@book{jones2019, author = {Jones, K.}, title = {Beta}, year = {2019}}`;
const bibDupe = `@book{smith2020, author = {Other, X.}, title = {Different}, year = {1999}}`;

describe('mergeReferences (multiple .bib files)', () => {
	it('merges entries from several files', () => {
		const keys = mergeReferences([bibA, bibB]).map((r) => r.key);
		expect(keys).toEqual(['smith2020', 'jones2019']);
	});

	it('de-dupes by key, first file wins', () => {
		const merged = mergeReferences([bibA, bibDupe]);
		expect(merged).toHaveLength(1);
		expect(merged[0].key).toBe('smith2020');
		expect(merged[0].title).toBe('Alpha'); // from bibA, not the later duplicate
	});

	it('skips an unparseable file instead of failing the whole load', () => {
		const keys = mergeReferences(['@@@ not valid bibtex {{{', bibB]).map((r) => r.key);
		expect(keys).toContain('jones2019');
	});
});

// IEEE-template style embedded bibliography
const ieeeBib = `\\begin{thebibliography}{00}
\\bibitem{b1} G. Eason, B. Noble, and I. N. Sneddon, \`\`On certain integrals of Lipschitz-Hankel type involving products of Bessel functions,'' Phil. Trans. Roy. Soc. London, vol. A247, pp. 529--551, April 1955.
\\bibitem{b2} J. Clerk Maxwell, A Treatise on Electricity and Magnetism, 3rd ed., vol. 2. Oxford: Clarendon, 1892, pp.68--73.
\\bibitem{b3} K. Elissa, \`\`Title of paper if known,'' unpublished.
\\end{thebibliography}`;

describe('parseBibItems (embedded thebibliography)', () => {
	it('extracts every \\bibitem key', () => {
		const keys = parseBibItems(ieeeBib).map((r) => r.key);
		expect(keys).toEqual(['b1', 'b2', 'b3']);
	});

	it('pulls best-effort author / quoted title / year for autocomplete display', () => {
		const [b1] = parseBibItems(ieeeBib);
		expect(b1.author).toBe('G. Eason, B. Noble, and I. N. Sneddon');
		expect(b1.title).toBe('On certain integrals of Lipschitz-Hankel type involving products of Bessel functions');
		expect(b1.year).toBe('1955');
		expect(b1.fromBibitem).toBe(true);
	});

	it('falls back to "Name, rest" splitting when there is no quoted title', () => {
		const b2 = parseBibItems(ieeeBib)[1];
		expect(b2.author).toBe('J. Clerk Maxwell');
		expect(b2.title).toContain('A Treatise on Electricity and Magnetism');
		expect(b2.year).toBe('1892');
	});

	it('handles an entry with no year (unpublished)', () => {
		const b3 = parseBibItems(ieeeBib)[2];
		expect(b3.title).toBe('Title of paper if known');
		expect(b3.year).toBeUndefined();
	});

	it('supports the optional [label] argument and de-dupes keys', () => {
		const refs = parseBibItems('\\bibitem[Foo 99]{foo} A. Author, some text, 1999.\n\\bibitem{foo} duplicate.');
		expect(refs).toHaveLength(1);
		expect(refs[0].key).toBe('foo');
	});

	it('returns nothing for a document without \\bibitem', () => {
		expect(parseBibItems('\\section{Intro}\nNo bibliography here.')).toEqual([]);
	});

	it('ignores \\bibitem inside verbatim and comments (AST scan, not regex)', () => {
		const tex = [
			'\\begin{verbatim}',
			'\\bibitem{fake1} Not a real entry.',
			'\\end{verbatim}',
			'% \\bibitem{fake2} commented out',
			'\\begin{thebibliography}{9}',
			"\\bibitem{real} A. Author, ``A real title,'' 2001.",
			'\\end{thebibliography}'
		].join('\n');
		const keys = parseBibItems(tex).map((r) => r.key);
		expect(keys).toEqual(['real']);
	});
});

const bibtexBbl = `\\begin{thebibliography}{9}
\\bibitem{eason55} G. Eason, \`\`On certain integrals,'' 1955.
\\end{thebibliography}`;

const biberBbl = `\\entry{knuth1984}{article}{}
\\field{title}{Literate Programming}
\\field{year}{1984}
\\endentry`;

describe('bblToReferences (dialect dispatch)', () => {
	it('routes a biber .bbl through the \\entry parser', () => {
		const [ref] = bblToReferences(biberBbl);
		expect(ref.key).toBe('knuth1984');
		expect(ref.title).toBe('Literate Programming');
		expect(ref.fromBbl).toBe(true);
	});

	it('routes a classic bibtex .bbl through the \\bibitem heuristics', () => {
		const [ref] = bblToReferences(bibtexBbl);
		expect(ref.key).toBe('eason55');
		expect(ref.title).toBe('On certain integrals');
		expect(ref.year).toBe('1955');
		expect(ref.fromBibitem).toBe(true);
	});
});

describe('loadReferences (.bib beats .bbl on key clashes)', () => {
	const clashBbl = `\\begin{thebibliography}{9}
\\bibitem{smith2020} S. Smith, stale generated text, 2020.
\\bibitem{bblonly} B. Only, \`\`Shipped without a bib,'' 2021.
\\end{thebibliography}`;

	it('keeps the .bib entry for a shared key and adds .bbl-only keys', async () => {
		const files = [
			{ name: 'main.bbl', path: '/p/main.bbl', relPath: 'main.bbl' },
			{ name: 'main.bib', path: '/p/main.bib', relPath: 'main.bib' }
		];
		await loadReferences('/p', {
			scan: async () => files,
			read: async (p) => (p.endsWith('.bib') ? bibA : clashBbl)
		});
		const refs = references.current;
		expect(refs.map((r) => r.key)).toEqual(['smith2020', 'bblonly']);
		expect(refs[0].title).toBe('Alpha'); // the .bib's entry, despite the .bbl being scanned first
		expect(refs[1].fromBibitem).toBe(true);
	});
});

describe('loadReferences (Hayagriva .yml files)', () => {
	const hayagriva = 'doan2020:\n  type: article\n  title: Kinetics\n  author: Doan, T. D.\n  date: 2020-10-14\n';
	const workflow = 'name: CI\non:\n  push:\njobs:\n  build:\n    runs-on: ubuntu-latest\n';

	const sources: Record<string, string> = {
		'/p/main.bib': bibA,
		'/p/refs.yml': hayagriva,
		'/p/ci.yaml': workflow,
		'/p/main.typ': '#bibliography(("main.bib", "refs.yml"))',
		'/p/main.tex': '\\bibliography{main}'
	};

	async function load(main: string): Promise<string[]> {
		const read: string[] = [];
		await loadReferences(
			'/p',
			{
				scan: async () => [{ name: 'main.bib', path: '/p/main.bib', relPath: 'main.bib' }],
				read: async (p) => (read.push(p), sources[p] ?? '')
			},
			main
		);
		return read;
	}

	it("reads the Hayagriva bibliography a Typst main names, and none of the project's other YAML", async () => {
		const read = await load('/p/main.typ');
		expect(read).not.toContain('/p/ci.yaml');
		const refs = references.current;
		expect(refs.map((r) => r.key)).toEqual(['smith2020', 'doan2020']);
		expect(refs[1]).toMatchObject({ title: 'Kinetics', author: 'Doan, T. D.', year: '2020', fromHayagriva: true });
	});

	it('reads no YAML for a LaTeX main', async () => {
		const read = await load('/p/main.tex');
		expect(read.filter((p) => /\.ya?ml$/.test(p))).toEqual([]);
		expect(references.current.map((r) => r.key)).toEqual(['smith2020']);
	});
});
