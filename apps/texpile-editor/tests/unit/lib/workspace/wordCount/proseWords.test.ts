import { describe, expect, it } from 'vitest';
import { latexWords, typstWords } from '$lib/workspace/wordCount/proseWords';

describe('latexWords', () => {
	it('counts body text, headings, captions and footnotes apart, and no markup', () => {
		const tex = String.raw`\section{Deep Residual Learning}\label{sec:method}
We reformulate the layers as learning residual functions \cite{he2016}, see Fig.~\ref{fig:block}.\footnote{Code is public.}
\begin{figure}[t]
\centering
\includegraphics[width=\linewidth]{block.pdf}
\caption[Short]{A residual block.}
\end{figure}
% a comment that says nothing
The loss is $\mathcal{L} = \sum_i \ell(x_i)$ and
\begin{equation} y = F(x) + x \end{equation}
it \textbf{converges} quickly.`;
		expect(latexWords(tex, false)).toEqual({ body: 17, headings: 3, captions: 3, footnotes: 3, tables: 0 });
	});

	it('counts only the document body of the main file', () => {
		const tex = String.raw`\documentclass{article}
\title{A Title Never Printed}
\author{Ada Lovelace}
\begin{document}
Two words.
\end{document}
Trailing notes are not printed.`;
		expect(latexWords(tex, true)).toMatchObject({ body: 2, headings: 0 });
		// a fragment has no preamble to leave out
		expect(latexWords('Two words.', true).body).toBe(2);
	});

	it('counts the title \\maketitle prints as a heading', () => {
		const tex = String.raw`\documentclass{article}
\title{Deep Residual Learning}
\begin{document}
\maketitle
Two words.
\end{document}`;
		expect(latexWords(tex, true)).toMatchObject({ body: 2, headings: 3 });
	});

	it('counts the cells of a table apart, and its caption as a caption', () => {
		const tex = String.raw`Text here.
\begin{table}\caption{Error rates.}
\begin{tabular}{lc} Method & Error \\ ResNet & 3.57 \end{tabular}
\end{table}`;
		expect(latexWords(tex, false)).toMatchObject({ body: 2, captions: 2, tables: 4 });
	});

	it('keeps a word with an accent command whole, and counts starred headings', () => {
		expect(latexWords(String.raw`caf\'e na\"{\i}ve \v{C}apek Stra\ss e`, false).body).toBe(4);
		expect(latexWords(String.raw`\section*{Acknowledgements} Thanks.`, false)).toMatchObject({ headings: 1, body: 1 });
	});

	it('leaves out the list of references', () => {
		const tex = String.raw`Body text.
\begin{thebibliography}{9}
\bibitem{a} A. Author. A title. 2020.
\end{thebibliography}`;
		expect(latexWords(tex, false).body).toBe(2);
	});
});

describe('typstWords', () => {
	it('counts the cells of a table apart', () => {
		expect(typstWords('Text here.\n#table(columns: 2, [Method], [Error], [ResNet], [3.57])')).toMatchObject({ body: 2, tables: 4 });
	});

	it('counts headings, captions and footnotes apart, and no code, maths or references', () => {
		const typ = `#set page(paper: "a4")
#let accent = rgb("#0074d9")
= Introduction <intro>
Residual nets are *easy* to _optimise_, as @he2016 shows.#footnote[See the appendix.]
// a comment
$ y = F(x) + x $
#figure(image("block.png", width: 80%), caption: [A residual block.])
The end.`;
		expect(typstWords(typ)).toEqual({ body: 10, headings: 1, captions: 3, footnotes: 3, tables: 0 });
	});
});
