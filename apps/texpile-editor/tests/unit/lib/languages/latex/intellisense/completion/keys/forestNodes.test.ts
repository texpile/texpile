import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { forestOptionsStart } from '$lib/languages/latex/intellisense/completion/keys/forestNodes';
import { latex } from '$lib/languages/latex/source/latexLanguage';
import { argumentCompletionSource } from '$lib/languages/latex/intellisense/completion/arguments';

const startAfter = (text: string) => forestOptionsStart(EditorState.create({ doc: text, extensions: [latex()] }), text.length);

describe('forestOptionsStart', () => {
	it('starts after the first comma of the open node', () => {
		const text = '\\begin{forest}\n[root, grow=east [child, dr';
		expect(startAfter(text)).toBe(text.lastIndexOf('[child,') + '[child,'.length);
	});

	it('is no option list in the node content, in a braced value or outside the tree', () => {
		expect(startAfter('\\begin{forest}\n[root [chi')).toBe(-1);
		expect(startAfter('\\begin{forest}\n[root, tikz={\\draw[re')).toBe(-1);
		expect(startAfter('\\begin{forest}[a, b]\\end{forest} [x, y')).toBe(-1);
		expect(startAfter('\\verb+\\begin{forest}+ [x, y')).toBe(-1);
	});
});

describe('forest node completion', () => {
	it('offers the keys of \\forestset after a comma in a node', async () => {
		const doc = '\\documentclass{article}\\usepackage{forest}\\begin{document}\n\\begin{forest}\n[root, gro';
		const r = await argumentCompletionSource(new CompletionContext(EditorState.create({ doc, extensions: [latex()] }), doc.length, false));
		expect((r?.options ?? []).map((o) => o.label)).toContain('grow=');
	});
});
