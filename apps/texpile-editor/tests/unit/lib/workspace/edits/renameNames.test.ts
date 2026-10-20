import { describe, expect, it } from 'vitest';
import { definedNamesIn, renameNameProblem } from '$lib/workspace/edits/renameNames';
import { wrapperReadingsIn } from '$lib/workspace/edits/renameUses';
import { loadedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';

describe('renameNameProblem', () => {
	it('keeps a citation key clear of the characters of a BibTeX field', () => {
		for (const c of ['"', '#', '%', "'", '(', ')', ',', '=', '{', '}', '\\', ' ', '\t']) {
			expect(renameNameProblem('cite', `a${c}b`)).toBe('invalid');
		}
		expect(renameNameProblem('cite', 'knuth:1984_a-b.c/d')).toBeNull();
		expect(renameNameProblem('cite', '  ')).toBe('empty');
	});

	it('keeps a label and a glossary entry clear of the characters TeX takes apart', () => {
		for (const kind of ['label', 'glossary'] as const) {
			for (const c of ['\\', '#', '%', '{', '}', ',', ' ', '\n']) expect(renameNameProblem(kind, `a${c}b`)).toBe('invalid');
			// the characters only a BibTeX key stops at
			for (const c of ['"', "'", '(', ')', '=']) expect(renameNameProblem(kind, `a${c}b`)).toBeNull();
		}
	});
});

describe('definedNamesIn', () => {
	it('counts a label= key of a listing as taken, whatever the environment hides', async () => {
		const loaded = await loadedPackages([{ name: 'listings', options: [] }]);
		const text = '\\begin{lstlisting}[language=C, label=lst:taken]\nint x;\n\\end{lstlisting}\n% \\label{lst:commented}';
		const names = definedNamesIn('label', [{ path: '/p/a.tex', text }], loaded);
		expect(names.has('lst:taken')).toBe(true);
		expect(names.has('lst:commented')).toBe(false);
	});

	it('counts a label the document defines through its own wrapper as taken', () => {
		const text = '\\newcommand{\\mylabel}[1]{\\label{#1}}\n\\mylabel{sec:wrapped}\\mybib{k}';
		const wrappers = wrapperReadingsIn([text]);
		expect(definedNamesIn('label', [{ path: '/p/a.tex', text }], [], wrappers).has('sec:wrapped')).toBe(true);
		expect(definedNamesIn('label', [{ path: '/p/a.tex', text }], []).has('sec:wrapped')).toBe(false);
	});
});
