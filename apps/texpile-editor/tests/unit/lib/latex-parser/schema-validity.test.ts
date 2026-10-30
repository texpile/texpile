import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

// regression guard: every parsed doc must satisfy the schema's content expressions (doc.check()).
// the converter's builders use NodeType.create, which validates attrs but not content placement,
// so a node in an illegal position parses, renders, and even serializes fine. it only fails on
// the first structural edit: ProseMirror's Node.replace throws "Invalid content for node doc",
// dispatchTransaction has no error path, and the editor silently freezes for add/delete-block.
// found via a real IEEE paper whose figures made the doc invalid. these fixtures pin the
// placements that were invalid, plus the IEEE author block from the original report.
describe('parsed docs satisfy the schema content model', () => {
	const wrap = (body: string) => `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;

	const CASES: Array<[name: string, body: string]> = [
		[
			'figure environment (image as a top-level block)',
			`\\begin{figure}[t]
\\centering
\\includegraphics[width=0.9\\linewidth]{arch.pdf}
\\caption{The architecture.}
\\label{fig:arch}
\\end{figure}`
		],
		[
			'bare standalone \\includegraphics (no figure wrapper)',
			`Intro text.

\\includegraphics[width=\\textwidth]{standalone.pdf}

Outro text.`
		],
		['\\includegraphics mid-paragraph', `Some prose \\includegraphics[scale=0.4]{inlinepic.png} continuing after the image.`],
		[
			'\\includegraphics inside a tabular cell',
			`\\begin{tabular}{ll}
\\includegraphics[width=2cm]{cellpic.png} & caption text \\\\
a & b \\\\
\\end{tabular}`
		],
		[
			'IEEE author block + figure (the reported crash shape)',
			`\\author{\\IEEEauthorblockN{Ada Lovelace}
\\IEEEauthorblockA{\\textit{Dept. of Mathematics} \\\\
\\textit{University of London} \\\\
London, UK \\\\
ada@example.org}
\\and
\\IEEEauthorblockN{Charles Babbage}
\\IEEEauthorblockA{\\textit{Analytical Engines Ltd.} \\\\
London, UK}}

\\maketitle

Body prose.

\\begin{figure}[htbp]
\\centerline{\\includegraphics{fig1.png}}
\\caption{Example of a figure caption.}
\\label{fig}
\\end{figure}

More prose after the figure.`
		]
	];

	for (const [name, body] of CASES) {
		it(`doc.check() passes: ${name}`, () => {
			const parsed = parseLatexFile(wrap(body));
			expect(() => parsed.doc.check()).not.toThrow();
		});

		it(`untouched save round-trips: ${name}`, () => {
			const file = wrap(body);
			const parsed = parseLatexFile(file);
			expect(serializeLatexFile(parsed, parsed.doc)).toBe(file);
		});
	}

	it('doc.check() passes on a fragment parsed without a preamble (raw converter path)', () => {
		const { doc } = treeToProseMirror('Text before.\n\n\\includegraphics{x.png}\n\nText after.', {});
		expect(() => doc.check()).not.toThrow();
	});
});
