import { describe, expect, it } from 'vitest';
import { latexCount, typstCount } from '$lib/workspace/wordCount/proseWords';

describe('latexCount', () => {
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
		expect(latexCount(tex, false).words).toEqual({ body: 17, headings: 3, captions: 3, footnotes: 3, tables: 0 });
	});

	it('counts only the document body of the main file', () => {
		const tex = String.raw`\documentclass{article}
\title{A Title Never Printed}
\author{Ada Lovelace}
\begin{document}
Two words.
\end{document}
Trailing notes are not printed.`;
		expect(latexCount(tex, true).words).toMatchObject({ body: 2, headings: 0 });
		// a fragment has no preamble to leave out
		expect(latexCount('Two words.', true).words.body).toBe(2);
	});

	it('finds the body by the \\begin{document} and \\end{document} TeX reads, not ones named in a comment', () => {
		const tex = String.raw`\documentclass{article}
% keep every package above \begin{document}
\author{Ada Lovelace}
\begin{document}
Two words. % anything after \end{document} is ignored
Three more words.
\end{document}`;
		expect(latexCount(tex, true).words).toMatchObject({ body: 5, headings: 0 });
	});

	it('counts the title \\maketitle prints as a heading', () => {
		const tex = String.raw`\documentclass{article}
\title{Deep Residual Learning}
\begin{document}
\maketitle
Two words.
\end{document}`;
		expect(latexCount(tex, true).words).toMatchObject({ body: 2, headings: 3 });
	});

	it('counts the cells of a table apart, and its caption as a caption', () => {
		const tex = String.raw`Text here.
\begin{table}\caption{Error rates.}
\begin{tabular}{lc} Method & Error \\ ResNet & 3.57 \end{tabular}
\end{table}`;
		expect(latexCount(tex, false).words).toMatchObject({ body: 2, captions: 2, tables: 4 });
	});

	it('keeps a word with an accent command whole, and counts starred headings', () => {
		expect(latexCount(String.raw`caf\'e na\"{\i}ve \v{C}apek Stra\ss e`, false).words.body).toBe(4);
		expect(latexCount(String.raw`\section*{Acknowledgements} Thanks.`, false).words).toMatchObject({ headings: 1, body: 1 });
	});

	it('leaves out the list of references', () => {
		const tex = String.raw`Body text.
\begin{thebibliography}{9}
\bibitem{a} A. Author. A title. 2020.
\end{thebibliography}`;
		expect(latexCount(tex, false).words.body).toBe(2);
	});
});

describe('typstCount', () => {
	it('counts the cells of a table apart', () => {
		expect(typstCount('Text here.\n#table(columns: 2, [Method], [Error], [ResNet], [3.57])').words).toMatchObject({ body: 2, tables: 4 });
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
		expect(typstCount(typ).words).toEqual({ body: 10, headings: 1, captions: 3, footnotes: 3, tables: 0 });
	});
});
