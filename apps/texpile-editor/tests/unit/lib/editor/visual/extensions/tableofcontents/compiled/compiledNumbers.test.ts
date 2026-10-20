import { describe, expect, it } from 'vitest';
import { assembleProjectOutline, parseOutlineRaw } from '$lib/editor/visual/extensions/tableofcontents/latexHeadings';
import { parseAuxContents } from '$lib/editor/visual/extensions/tableofcontents/compiled/auxContents';
import type { CompiledEntry } from '$lib/editor/visual/extensions/tableofcontents/compiled/compiledNumbers';

// what pdflatex wrote for a book of three \include'd chapters, the last after \appendix (trimmed to the lines read)
const MAIN_AUX = String.raw`\relax
\@input{ch1.aux}
\@input{ch2.aux}
\@input{ch3.aux}`;
const CH1_AUX = String.raw`\@writefile{toc}{\contentsline {chapter}{\numberline {1}First}{1}{chapter.1}\protected@file@percent }
\@writefile{lof}{\addvspace {10\p@ }}
\@writefile{toc}{\contentsline {section}{\numberline {1.1}Short A}{1}{section.1.1}\protected@file@percent }
\@writefile{toc}{\contentsline {subsection}{\numberline {1.1.1}A1}{1}{subsection.1.1.1}\protected@file@percent }
\@writefile{toc}{\contentsline {subsubsection}{A1a}{1}{section*.1}\protected@file@percent }
\@writefile{toc}{\contentsline {section}{\numberline {1.2}B with \emph  {style}}{1}{section.1.2}\protected@file@percent }
\@writefile{lof}{\contentsline {figure}{\numberline {1.1}{\ignorespaces F one}}{1}{figure.1.1}\protected@file@percent }`;
const CH2_AUX = String.raw`\@writefile{toc}{\contentsline {chapter}{\numberline {2}Second}{3}{chapter.2}\protected@file@percent }
\@writefile{toc}{\contentsline {section}{\numberline {2.1}C}{3}{section.2.1}\protected@file@percent }
\@writefile{lof}{\contentsline {figure}{\numberline {2.1}{\ignorespaces F2}}{3}{figure.2.1}\protected@file@percent }
\@writefile{lot}{\contentsline {table}{\numberline {2.1}{\ignorespaces T2}}{4}{table.2.1}\protected@file@percent }`;
const CH3_AUX = String.raw`\@writefile{toc}{\contentsline {chapter}{\numberline {A}Extra}{5}{appendix.A}\protected@file@percent }
\@writefile{toc}{\contentsline {section}{\numberline {A.1}D}{5}{section.A.1}\protected@file@percent }`;

const compiled = [CH1_AUX, CH2_AUX, CH3_AUX].flatMap((aux) => parseAuxContents(aux) as CompiledEntry[]);

const book = (ch2: string) => {
	const main = parseOutlineRaw(String.raw`\documentclass{book}\begin{document}\include{ch1}\include{ch2}\appendix\include{ch3}`);
	return assembleProjectOutline(
		main,
		'C:/p/main.tex',
		'C:/p',
		'C:/p',
		{
			'C:/p/ch1.tex': parseOutlineRaw(String.raw`\chapter{First}
\section[Short A]{A long title for A}
\subsection{A1}
\subsubsection{A1a}
\section*{Unnumbered}
\section{B with \emph{style}}
\begin{figure}\caption[F one]{The first figure}\end{figure}`),
			'C:/p/ch2.tex': parseOutlineRaw(ch2),
			'C:/p/ch3.tex': parseOutlineRaw(String.raw`\chapter{Extra}
\section{D}`)
		},
		compiled
	);
};

describe('the numbers the last compile printed', () => {
	it('reads the .aux in order, the included files where the main one names them', () => {
		expect(parseAuxContents(MAIN_AUX)).toEqual([{ include: 'ch1.aux' }, { include: 'ch2.aux' }, { include: 'ch3.aux' }]);
		expect(parseAuxContents(CH2_AUX).map((e) => ('kind' in e ? [e.kind, e.number, e.title] : e))).toEqual([
			['heading', '2', 'Second'],
			['heading', '2.1', 'C'],
			['figure', '2.1', String.raw`{\ignorespaces F2}`],
			['table', '2.1', String.raw`{\ignorespaces T2}`]
		]);
	});

	it('puts them on a book as its class numbered it', () => {
		const outline = book(String.raw`\chapter{Second}
\section{C}
\begin{figure}\caption{F2}\end{figure}
\begin{table}\caption{T2}\end{table}`);
		expect(outline.map((i) => [i.level, i.number, i.text])).toEqual([
			[1, '1', 'First'],
			[2, '1.1', 'A long title for A'],
			[3, '1.1.1', 'A1'],
			[4, undefined, 'A1a'],
			[2, undefined, 'Unnumbered'],
			[2, '1.2', 'B with style'],
			[3, '1.1', 'The first figure'],
			[1, '2', 'Second'],
			[2, '2.1', 'C'],
			[3, '2.1', 'F2'],
			[3, '2.1', 'T2'],
			[1, 'A', 'Extra'],
			[2, 'A.1', 'D']
		]);
	});

	it('keeps the number on a heading being renamed, and matches accents, math and Chinese as the .aux writes them', () => {
		const aux = String.raw`\@writefile{toc}{\contentsline {section}{\numberline {1}Café crème}{1}{section.1}\protected@file@percent }
\@writefile{toc}{\contentsline {section}{\numberline {2}\"Uber \emph  {alles}}{1}{section.2}\protected@file@percent }
\@writefile{toc}{\contentsline {section}{\numberline {3}The $\alpha ^2$ case}{1}{section.3}\protected@file@percent }
\@writefile{toc}{\contentsline {section}{\numberline {4}引言}{1}{}\protected@file@percent }
\@writefile{toc}{\contentsline {section}{\numberline {5}Intro}{1}{}\protected@file@percent }
\@writefile{toc}{\contentsline {section}{\numberline {6}End}{1}{}\protected@file@percent }`;
		const src = String.raw`\section{Café crème}
\section{\"Uber \emph{alles}}
\section{The $\alpha^2$ case}
\section{引言}
\section{Introduction, being typed}
\section{End}`;
		const outline = assembleProjectOutline(
			parseOutlineRaw(src),
			'C:/p/a.tex',
			'C:/p',
			'C:/p',
			{},
			parseAuxContents(aux) as CompiledEntry[]
		);
		expect(outline.map((i) => i.number)).toEqual(['1', '2', '3', '4', '5', '6']);
	});

	it('reads the number of a \\part, which the standard classes write without \\numberline', () => {
		const aux = String.raw`\@writefile{toc}{\contentsline {part}{I\hspace  {1em}Basics}{1}{}\protected@file@percent }`;
		expect(parseAuxContents(aux)).toEqual([{ kind: 'heading', number: 'I', title: 'Basics' }]);
	});

	it('gives none of many headings pasted since the compile a number, and keeps the old ones theirs', () => {
		const pasted = Array.from({ length: 12 }, (_, i) => `\\section{Pasted ${i}}`).join('\n');
		const outline = book(String.raw`\chapter{Second}
${pasted}
\section{C}`);
		const ch2 = outline.filter((i) => i.file === 'C:/p/ch2.tex' && i.kind !== 'figure' && i.kind !== 'table');
		expect(ch2.filter((i) => i.text.startsWith('Pasted')).every((i) => i.number === undefined)).toBe(true);
		expect(ch2.filter((i) => !i.text.startsWith('Pasted')).map((i) => [i.number, i.text])).toEqual([
			['2', 'Second'],
			['2.1', 'C']
		]);
		expect(outline.find((i) => i.text === 'D')?.number).toBe('A.1');
	});

	it('leaves a heading written since the compile without a number, and the ones after it numbered', () => {
		const outline = book(String.raw`\chapter{Second}
\section{New since}
\section{C}`);
		expect(outline.filter((i) => i.file === 'C:/p/ch2.tex').map((i) => [i.number, i.text])).toEqual([
			['2', 'Second'],
			[undefined, 'New since'],
			['2.1', 'C']
		]);
	});

	it('numbers a float other than a figure or table from its own list file', () => {
		const aux = String.raw`\@writefile{loa}{\contentsline {algorithm}{\numberline {1}{\ignorespaces Search}}{1}{algorithm.1}\protected@file@percent }`;
		const outline = assembleProjectOutline(
			parseOutlineRaw('\\begin{algorithm}\\caption{Search}\\end{algorithm}'),
			'C:/p/a.tex',
			'C:/p',
			'C:/p',
			{},
			parseAuxContents(aux) as CompiledEntry[]
		);
		expect(outline).toMatchObject([{ kind: 'algorithm', text: 'Search', number: '1' }]);
	});
});
