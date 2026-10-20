import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { referenceCompletionSource } from '../../../../../../src/lib/languages/latex/intellisense/completion/references';
import { labelStore } from '$lib/stores/editorStore';

function completeAt(doc: string) {
	const state = EditorState.create({ doc });
	return referenceCompletionSource(new CompletionContext(state, doc.length, false));
}
const labels = async (r: ReturnType<typeof completeAt>) => ((await r)?.options ?? []).map((o) => o.label);

const LISTINGS = '\\documentclass{article}\n\\usepackage{listings}\n';

describe('reference completion: label keys the data gives the label role', () => {
	beforeEach(() => (labelStore.current = []));

	it('picks up label=name in the options of an environment of a loaded package', async () => {
		const doc = `${LISTINGS}\\begin{lstlisting}[label=lst:x]\n\\end{lstlisting}\n\\ref{lst:`;
		expect(await labels(completeAt(doc))).toContain('lst:x');
	});

	it('picks up label={name} (braced) in a command of a loaded package', async () => {
		const doc = `${LISTINGS}\\lstinputlisting[label={lst:file}]{a.py}\n\\ref{lst:`;
		expect(await labels(completeAt(doc))).toContain('lst:file');
	});

	it('ignores a label= key the data gives no role (enumitem styles the list marker)', async () => {
		const doc = '\\documentclass{article}\n\\usepackage{enumitem}\n\\begin{itemize}[label=$\\star$]\n\\item x\n\\end{itemize}\n\\ref{';
		expect(await completeAt(doc)).toBeNull();
	});

	it('merges with labels already in labelStore', async () => {
		labelStore.current = ['sec:intro'];
		const doc = `${LISTINGS}\\begin{lstlisting}[label=lst:x]\n\\end{lstlisting}\n\\ref{`;
		const found = await labels(completeAt(doc));
		expect(found).toContain('sec:intro');
		expect(found).toContain('lst:x');
	});
});

describe('reference completion: wrappers and cost', () => {
	beforeEach(() => (labelStore.current = ['sec:intro']));

	it('completes inside a wrapper the document defines around \\ref', async () => {
		const doc = '\\newcommand{\\figref}[1]{\\ref{#1}}\n\\figref{';
		expect(await labels(completeAt(doc))).toContain('sec:intro');
	});

	it('reads no whole document for a known command or plain prose', async () => {
		for (const doc of ['\\ref{', 'just some prose \\textbf{bold']) {
			const state = EditorState.create({ doc });
			const spy = vi.spyOn(state.doc, 'toString');
			const result = await referenceCompletionSource(new CompletionContext(state, doc.length, false));
			expect(result === null ? 0 : 1).toBe(doc === '\\ref{' ? 1 : 0);
			expect(spy).toHaveBeenCalledTimes(doc === '\\ref{' ? 1 : 0);
		}
	});
});
