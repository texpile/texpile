import { describe, it, expect, beforeEach } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { latexCompletionSource } from '../../../../../../src/lib/editor/extensions/intellisense/completion/dispatch';
import { referenceStore, labelStore, filePathStore } from '$lib/stores/editorStore';
import { projectIntelStore, EMPTY_PROJECT_INTEL } from '$lib/stores/projectIntel';

function completeAt(doc: string, explicit = false) {
	const state = EditorState.create({ doc });
	return latexCompletionSource(new CompletionContext(state, doc.length, explicit));
}
const labels = (r: Awaited<ReturnType<typeof completeAt>>) => (r?.options ?? []).map((o) => o.displayLabel ?? o.label);

describe('latex completion source', () => {
	beforeEach(() => {
		referenceStore.set(null as never);
		labelStore.set([]);
		filePathStore.set([]);
		projectIntelStore.set(EMPTY_PROJECT_INTEL);
	});

	it('offers labels and macros from other project files, with resolved .aux numbers', async () => {
		projectIntelStore.set({
			...EMPTY_PROJECT_INTEL,
			labels: [{ name: 'fig:remote', file: 'C:/proj/chapters/two.tex', line: 4, context: '' }],
			macros: [{ name: 'projmacro', signature: 'm', file: 'C:/proj/defs.tex', line: 2 }],
			auxNumbers: { 'fig:remote': '3.2' },
			auxPages: { 'fig:remote': '14' }
		});
		const ref = await completeAt('\\ref{fig');
		const remote = (ref?.options ?? []).find((o) => o.label === 'fig:remote');
		expect(remote?.detail).toBe('3.2, p.14 · two.tex');
		const mac = await completeAt('\\projm');
		const pm = (mac?.options ?? []).find((o) => o.label === '\\projmacro');
		expect(pm?.detail).toContain('defs.tex');
	});

	it('completes commands after a backslash + letter', async () => {
		const r = await completeAt('\\sec');
		expect(r?.from).toBe(0); // replaces from the backslash
		expect(labels(r)).toContain('\\section');
		expect(labels(r)).toContain('\\subsection');
	});

	it('fires on a lone backslash, like LaTeX Workshop', async () => {
		expect(labels(await completeAt('\\'))).toContain('\\textbf');
		expect(labels(await completeAt('\\', true))).toContain('\\textbf');
	});

	it('shows argument shapes, never raw xparse signature letters', async () => {
		const r = await completeAt('\\fra');
		const frac = (r?.options ?? []).find((o) => o.label === '\\frac');
		expect(frac?.detail).toBe('{}{}');
		const r2 = await completeAt('\\textbf');
		const textbf = (r2?.options ?? []).find((o) => o.label === '\\textbf');
		expect(textbf?.detail).toBe('{}');
		// no completion anywhere shows bare signature letters like "m", "o m", "s o m"
		const all = [...(r?.options ?? []), ...(r2?.options ?? [])];
		expect(all.some((o) => /^[somv](?: [somv])*$/.test(o.detail ?? ''))).toBe(false);
	});

	it('shows environment argument shapes inside \\begin{…}', async () => {
		const r = await completeAt('\\begin{tabul');
		const tabular = (r?.options ?? []).find((o) => o.label === 'tabular');
		expect(tabular?.detail).toBe('[]{}');
	});

	it('completes environment names inside \\begin{…}', async () => {
		const r = await completeAt('\\begin{it');
		expect(r?.from).toBe('\\begin{'.length); // inside the braces
		expect(labels(r)).toContain('itemize');
		expect(labels(r)).toContain('enumerate');
	});

	it('completes environment names inside \\end{…} too', async () => {
		expect(labels(await completeAt('\\end{align'))).toContain('align*');
	});

	it('ranks the still-open environment first inside \\end{…}', async () => {
		const r = await completeAt('\\begin{align}\nx=1\n\\end{');
		const align = (r?.options ?? []).find((o) => o.label === 'align');
		expect(align?.boost).toBe(99);
	});

	it('completes bib keys inside \\cite{…} from referenceStore', async () => {
		referenceStore.set([{ key: 'knuth1984', title: 'The TeXbook' }] as never);
		const r = await completeAt('\\cite{kn');
		expect(r?.from).toBe('\\cite{'.length);
		expect((r?.options ?? []).map((o) => o.apply)).toEqual(['knuth1984']);
	});

	it('matches citations on author/title text, inserting just the key', async () => {
		referenceStore.set([{ key: 'vaswani2017', title: 'Attention Is All You Need', author: 'Vaswani' }] as never);
		const r = await completeAt('\\cite{');
		const item = (r?.options ?? [])[0];
		expect(item?.label).toContain('Vaswani'); // matched by CodeMirror's filter
		expect(item?.displayLabel).toBe('vaswani2017'); // shown
		expect(item?.apply).toBe('vaswani2017'); // inserted
	});

	it('completes the last key after a comma in a multi-key cite', async () => {
		referenceStore.set([{ key: 'a1' }, { key: 'b2' }] as never);
		const r = await completeAt('\\citep{a1, b');
		expect(r?.from).toBe('\\citep{a1, '.length); // skips the space after the comma
		expect((r?.options ?? []).map((o) => o.apply)).toEqual(['a1', 'b2']);
	});

	it('completes \\label keys inside \\ref / \\eqref / \\cref from labelStore', async () => {
		labelStore.set(['fig:one', 'eq:main', 'sec:intro']);
		expect(labels(await completeAt('\\ref{fig'))).toContain('fig:one');
		expect(labels(await completeAt('\\eqref{eq'))).toEqual(['fig:one', 'eq:main', 'sec:intro']);
		const cref = await completeAt('\\cref{sec:intro, fig'); // last token after a comma
		expect(cref?.from).toBe('\\cref{sec:intro, '.length);
		expect(labels(cref)).toContain('fig:one');
	});

	it('completes labels in ref-like macros outside the classic list (\\vpageref, user \\fooref)', async () => {
		labelStore.set(['fig:one']);
		expect(labels(await completeAt('\\vpageref{'))).toContain('fig:one');
		expect(labels(await completeAt('\\myfancyref{'))).toContain('fig:one');
	});

	it('completes image file paths inside \\includegraphics (filtered to image types)', async () => {
		filePathStore.set(['images/plot.png', 'chapters/intro.tex', 'images/diagram.pdf']);
		const r = await completeAt('\\includegraphics{im');
		expect(r?.from).toBe('\\includegraphics{'.length);
		expect(labels(r)).toEqual(['images/plot.png', 'images/diagram.pdf']); // .tex excluded
	});

	it('completes .tex files inside \\input, and handles an optional [..] arg first', async () => {
		filePathStore.set(['chapters/intro.tex', 'images/plot.png']);
		expect(labels(await completeAt('\\input{'))).toEqual(['chapters/intro.tex']);
		expect(labels(await completeAt('\\includegraphics[width=5cm]{'))).toEqual(['images/plot.png']);
	});

	it('completes the file arg of the \\import family (second brace group)', async () => {
		filePathStore.set(['chapters/two.tex', 'main.tex']);
		const r = await completeAt('\\import{chapters/}{t');
		expect(labels(r)).toContain('chapters/two.tex');
	});

	it('strips the extension \\include and \\bibliography insert (LaTeX appends its own)', async () => {
		filePathStore.set(['chapters/intro.tex', 'refs/main.bib']);
		const inc = await completeAt('\\include{');
		expect((inc?.options ?? [])[0]?.apply).toBe('chapters/intro');
		const bib = await completeAt('\\bibliography{');
		expect((bib?.options ?? [])[0]?.apply).toBe('refs/main');
	});

	it('does not offer labels for \\href (not a cross-reference)', async () => {
		labelStore.set(['fig:one']);
		expect(await completeAt('\\href{')).toBeNull();
	});

	it('returns nothing for plain prose', async () => {
		expect(await completeAt('hello world')).toBeNull();
	});

	it('sources a broad command set from the CTAN database, with argument snippets', async () => {
		const r = await completeAt('\\fra');
		expect(r?.options.length ?? 0).toBeGreaterThan(200); // a real DB, not a hand list
		const frac = r?.options.find((o) => o.label === '\\frac');
		expect(typeof frac?.apply).toBe('function'); // \frac{·}{·} inserted as a snippet
	});
});
