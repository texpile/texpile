import { describe, it, expect } from 'vitest';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';


describe('verbatim-family environments are not silently dropped', () => {
	it('a plain, well-formed verbatim block is visible in the parsed doc', () => {
		const src = 'Before text.\n\n\\begin{verbatim}\ncode here\nmore code\n\\end{verbatim}\n\nAfter text.\n';
		const parsed = parseLatexFile(src);
		expect(parsed.doc.textContent).toContain('code here');
	});

	it('does not silently drop a recognized verbatim block even inside pathological/invalid surrounding LaTeX', () => {
		const src = String.raw`\begin{verbatim}
\begin{verbatim}
\begin{verbatim}
\begin{verbatim}
\begin{quote}
\begin{quote}
\begin{quote}
\begin{quote}
\begin{quote}
\begin{quote}
\subsubsection{\subsection{\subsection{\subsection{\subsection{\subsection{}}}}}}
\end{quote}
\end{quote}
\end{quote}
\end{quote}
\end{quote}
\end{quote}
\end{verbatim}
\end{verbatim}
\end{verbatim}
\end{verbatim}\hypersetup{colorlinks=false}

a \par
`;
		const parsed = parseLatexFile(src);
		expect(parsed.doc.textContent).toContain('\\begin{quote}');
		expect(parsed.doc.textContent).toContain('\\subsubsection');
	});
});
