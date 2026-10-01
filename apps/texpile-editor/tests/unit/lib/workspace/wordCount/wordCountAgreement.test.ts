// the top bar used to count words its own way; now it gives the details' number in either view
import { describe, expect, it, vi } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import { createWordCountPlugin } from '$lib/editor/visual/extensions/wordcount/wordCountPlugin';
import {
	countOpenFile,
	documentCountStore,
	setSourceDocCount,
	setSourceSelectionCount,
	sourceCounting
} from '$lib/stores/countStore.svelte';
import { latexProse, latexCount, tallyTotal, typstCount } from '$lib/workspace/wordCount/proseWords';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';

function topBar(path: string, text: string): number {
	countOpenFile(path, text);
	return documentCountStore.words;
}

const CITED = String.raw`\section{Model}
We follow the Transformer \parencite{vaswani2017} and its encoder \parencite{attention}, with residual connections \parencite[p.~772]{he2016}.
`;

const PAPER = String.raw`\documentclass{article}
\usepackage{graphicx}
\title{Deep Residual Learning}
\begin{document}
\maketitle
\section{Deep Residual Learning}\label{sec:method}
We reformulate the layers as learning residual functions \cite{he2016}, see Fig.~\ref{fig:block}.\footnote{Code is public.}
\begin{figure}[t]
\centering
\includegraphics[width=\linewidth]{block.pdf}
\caption{A residual block.}
\end{figure}
% a comment that says nothing
The loss is $\mathcal{L} = \sum_i \ell(x_i)$ and
\begin{equation} y = F(x) + x \end{equation}
it \textbf{converges} quickly -- see \cref{sec:method}.
\begin{tabular}{lc} Method & Error \\ ResNet & 3.57 \end{tabular}
\begin{thebibliography}{9}
\bibitem{he2016} K. He. Deep residual learning. 2016.
\end{thebibliography}
\end{document}
`;

const TYPST = `= Introduction <intro>
Residual nets are *easy* to _optimise_, as @he2016 shows.#footnote[See the appendix.]
$ y = F(x) + x $
The end.
`;

describe('the top bar counts a file as the details do', () => {
	it('leaves out the comma and full stop a citation leaves behind', () => {
		const details = tallyTotal(latexCount(CITED, true).words);
		expect(details).toBe(11);
		expect(topBar('/p/chapters/model.tex', CITED)).toBe(details);
	});

	it('agrees on a paper with a title, references, a footnote, a caption, maths, a table and a bibliography', () => {
		const details = latexCount(PAPER, true);
		expect(topBar('/p/main.tex', PAPER)).toBe(tallyTotal(details.words));
		expect(documentCountStore.charactersWithSpaces).toBe(details.characters);
	});

	it('agrees for Typst', () => {
		const details = typstCount(TYPST);
		expect(topBar('/p/main.typ', TYPST)).toBe(tallyTotal(details.words));
		expect(documentCountStore.charactersWithSpaces).toBe(details.characters);
	});

	it('counts a new file at once and edits to it once typing settles', () => {
		vi.useFakeTimers();
		try {
			expect(topBar('/p/a.tex', 'One two three.')).toBe(3);
			countOpenFile('/p/a.tex', 'One two three four.');
			expect(documentCountStore.words).toBe(3);
			vi.advanceTimersByTime(300);
			expect(documentCountStore.words).toBe(4);
			// a pending count of the last file never lands on the next one
			countOpenFile('/p/a.tex', 'One two three four five.');
			expect(topBar('/p/b.tex', 'Six.')).toBe(1);
			vi.advanceTimersByTime(300);
			expect(documentCountStore.words).toBe(1);
		} finally {
			vi.useRealTimers();
		}
	});

	it('leaves any other file to its editor', () => {
		setSourceDocCount('@article{he2016, title = {Deep Residual Learning}}');
		countOpenFile('/p/refs.bib', 'ignored');
		expect(documentCountStore.words).toBe(6);
		expect(documentCountStore.charactersWithSpaces).toBe(50);
		expect(sourceCounting('/p/refs.bib')).toBe('text');
	});
});

describe('a selection counts by the same rule', () => {
	it('in the source view', () => {
		setSourceSelectionCount(String.raw`its encoder \parencite{attention}, with`, 'latex');
		expect(documentCountStore.selectionWords).toBe(3);
		setSourceSelectionCount(null, 'latex');
		expect(documentCountStore.selectionWords).toBeNull();
	});

	it('in the visual editor, which leaves the whole file to countOpenFile', () => {
		const doc = parseLatexFile(CITED).doc;
		documentCountStore.words = -1;
		const state = EditorState.create({ doc, plugins: [createWordCountPlugin((raw) => latexProse(raw, false))] });
		expect(documentCountStore.words).toBe(-1);
		// the whole document selected: the same words as the file's count
		EditorState.create({
			doc,
			selection: TextSelection.create(doc, 1, doc.content.size - 1),
			plugins: state.plugins
		});
		expect(documentCountStore.selectionWords).toBe(11);
	});
});
