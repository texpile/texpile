import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { parseAuxContents } from '$lib/editor/visual/extensions/tableofcontents/compiled/auxContents';
import type { CompiledEntry } from '$lib/editor/visual/extensions/tableofcontents/compiled/compiledNumbers';
import { parseAuxLabels } from '$lib/workspace/auxLabels';
import { documentNumbers, type NumberAnchors } from '$lib/languages/latex/visual/extensions/numbers/documentNumbers';
import { numberingSchemeOf, type NumberingScheme } from '$lib/languages/latex/visual/extensions/numbers/numberingScheme';
import { loadedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { packageUsesIn } from '$lib/languages/latex/intellisense/packages/packageUses';
import { loadedRegistry } from '$lib/languages/latex/knowledge/registries/registries';
import { latexFootnoteMarks } from '$lib/languages/latex/visual/extensions/drawn/latexFootnoteMarks';
import { numberedFilesOf } from '$lib/workspace/document/numberedFiles';
import { pathKey } from '$lib/workspace/fileSystem';

// paper.aux is what pdflatex wrote for paper.tex; PRINTED is what its PDF shows
const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');
const tex = fixture('paper.tex');
const aux = fixture('paper.aux');
const COMPILED: NumberAnchors = {
	contents: parseAuxContents(aux).filter((p): p is CompiledEntry => !('include' in p)),
	labels: parseAuxLabels(aux).numbers
};
const NEVER: NumberAnchors = { contents: [], labels: {} };
const PRINTED = [
	'heading 1',
	'heading 1.1',
	'inline_latex 1',
	'inline_latex 2',
	'block_math (1.1.1)',
	'block_math (1.1.2)',
	'block_math (1.1.3) (1.1.4)',
	'block_math (1.1.5a) (1.1.5b)',
	'block_math (*)',
	'image 1.1',
	'image 1.2',
	'table_wrapper 1.1',
	'block_math (1.1.10)',
	'heading 1.2',
	'block_math (1.2.1)',
	'heading A',
	'heading A.1',
	'block_math (A.1.1)',
	'image A.1'
];

// how a document numbers, as the project reads it from its main file and the package data
async function schemeOf(main: string): Promise<NumberingScheme> {
	const loaded = await loadedPackages(packageUsesIn(main));
	return numberingSchemeOf(loadedRegistry(loaded, 'counters'), loadedRegistry(loaded, 'counterForms'), main);
}

let SCHEME: NumberingScheme;
beforeAll(async () => {
	SCHEME = await schemeOf(tex);
});

function shown(text: string, anchors: NumberAnchors, standalone = true, scheme = SCHEME): string[] {
	const doc = parseLatexFile(text).doc;
	const context = { anchors, scheme, standalone };
	return [...documentNumbers(doc, latexFootnoteMarks, context)].map(([pos, n]) => `${doc.nodeAt(pos)!.type.name} ${n.join(' ')}`);
}

describe('documentNumbers', () => {
	it('shows what the compile printed: the appendix, \\numberwithin, subequations, a \\tag and a \\setcounter', () => {
		expect(shown(tex, COMPILED)).toEqual(PRINTED);
	});

	it('counts the same numbers in a paper never compiled', () => {
		expect(shown(tex, NEVER)).toEqual(PRINTED);
	});

	it('shows nothing it counted in a file read in from the middle, until an anchor says where it stands', () => {
		const chapter =
			'\\section{Middle}\n\\begin{equation}x\\end{equation}\n\\section{Behavioral: input output relations}\n\\begin{equation}y\\end{equation}\n';
		expect(shown(chapter, NEVER, false)).toEqual([]);
		expect(shown(chapter, COMPILED, false)).toEqual(['heading 1.1', 'block_math (1.1.1)']);
	});

	it('prints the class own way: an IEEE paper never compiled, and its .aux read plainly', async () => {
		const ieee =
			'\\documentclass{IEEEtran}\n\\begin{document}\n\\section{One}\n\\subsection{Two}\n\\subsection{Three}\n\\begin{table}\\caption{T}\\begin{tabular}{c}x\\end{tabular}\\end{table}\n\\end{document}\n';
		const scheme = await schemeOf(ieee);
		expect(shown(ieee, NEVER, true, scheme)).toEqual(['heading I', 'heading I-A', 'heading I-B', 'table_wrapper I']);
		const compiled = { contents: [{ kind: 'heading', title: 'Two', number: '\\protect \\mbox {I-A}' }], labels: {} };
		expect(shown(ieee, compiled, true, scheme)).toEqual(['heading I', 'heading I-A', 'heading I-B', 'table_wrapper I']);
	});

	it("numbers revtex's prl as TeX does: no section numbers, the appendix's equations going on", async () => {
		const paper = (options: string) =>
			`\\documentclass[${options}]{revtex4}\n\\begin{document}\n\\section{One}\n\\begin{equation}a\\end{equation}\n\\begin{equation}b\\end{equation}\n\\appendix\n\\section{App}\n\\begin{equation}c\\end{equation}\n\\end{document}\n`;
		const prl = paper('aps,prl');
		expect(shown(prl, NEVER, true, await schemeOf(prl))).toEqual(['block_math (1)', 'block_math (2)', 'block_math (3)']);
		const pra = paper('aps,pra');
		expect(shown(pra, NEVER, true, await schemeOf(pra))).toEqual([
			'heading I',
			'block_math (1)',
			'block_math (2)',
			'heading A',
			'block_math (A1)'
		]);
	});

	it('reads what the document says itself, and shows nothing for math it cannot see', async () => {
		const own = [
			'\\documentclass{article}',
			'\\begin{document}',
			'\\section{One}',
			'\\makeatletter\\@addtoreset{equation}{section}\\def\\theequation{\\thesection.\\arabic{equation}}\\makeatother',
			'\\begin{equation}a\\end{equation}',
			'\\begin{equation}b\\nonumber\\end{equation}',
			'\\begin{equation}c\\end{equation}',
			'\\section{Two}',
			'\\begin{equation}d\\end{equation}',
			'Text\\footnote{with \\begin{equation}e\\end{equation} inside}.',
			'\\begin{equation}f\\end{equation}',
			'\\end{document}'
		].join('\n');
		expect(shown(own, NEVER, true, await schemeOf(own))).toEqual([
			'heading 1',
			'block_math (1.1)',
			'block_math (1.2)',
			'heading 2',
			'block_math (2.1)',
			'inline_latex 1'
		]);
	});

	it('counts eqnarray rows as TeX does, and leaves footnotes a folder numbers its own way to the compile', async () => {
		const rows = [
			'\\documentclass{article}',
			'\\makeatletter\\def\\footnote#1{\\stepcounter{myfoot}}\\makeatother',
			'\\begin{document}',
			'\\begin{eqnarray}a\\nonumber\\\\ b\\nonumber\\end{eqnarray}',
			'\\begin{equation}c\\end{equation}',
			'\\begin{eqnarray}d\\\\ e\\\\\n\\end{eqnarray}',
			'Text\\footnote{note}.',
			'\\end{document}'
		].join('\n');
		expect(shown(rows, NEVER, true, await schemeOf(rows))).toEqual(['block_math (1)', 'block_math (2) (3) (4)']);
	});

	it('counts what a file reads in, and starts a file read in where the main file reads it', async () => {
		const main = '\\documentclass{article}\n\\begin{document}\n\\section{A}\n\\input{chapter}\n\\section{C}\n\\end{document}\n';
		const chapter = '\\section{B}\n\\begin{equation}x\\end{equation}\n';
		const texts = {
			[pathKey('/p/main.tex')]: { path: '/p/main.tex', text: main },
			[pathKey('/p/chapter.tex')]: { path: '/p/chapter.tex', text: chapter }
		};
		const files = numberedFilesOf({ start: '/p/main.tex', root: '/p', texts }, { macros: [], environments: [] });
		const scheme = await schemeOf(main);
		const numbersOf = (text: string, path: string, standalone: boolean, withFiles = true) => {
			const doc = parseLatexFile(text).doc;
			const context = { anchors: NEVER, scheme, standalone, path, files: withFiles ? files : null };
			return [...documentNumbers(doc, latexFootnoteMarks, context)].map(([pos, n]) => `${doc.nodeAt(pos)!.type.name} ${n.join(' ')}`);
		};
		expect(numbersOf(main, '/p/main.tex', true)).toEqual(['heading 1', 'heading 3']);
		expect(numbersOf(chapter, '/p/chapter.tex', false)).toEqual(['heading 2', 'block_math (1)']);
		expect(numbersOf(main, '/p/main.tex', true, false)).toEqual(['heading 1']);
	});

	it('numbers no chapter of the front matter, and prints what the folder class sets as it loads', async () => {
		const main =
			'\\documentclass{thesis}\n\\begin{document}\n\\frontmatter\n\\chapter{Abstract}\n\\mainmatter\n\\chapter{Intro}\nText\\footnote{a}.\n\\end{document}\n';
		const cls =
			'\\LoadClass{book}\n\\renewcommand{\\thefootnote}{\\fnsymbol{footnote}}\n\\if@draft\\renewcommand{\\thechapter}{\\Roman{chapter}}\\fi\n';
		const loaded = await loadedPackages([...packageUsesIn(main), ...packageUsesIn(cls)]);
		const scheme = numberingSchemeOf(loadedRegistry(loaded, 'counters'), loadedRegistry(loaded, 'counterForms'), main, false, [cls]);
		expect(shown(main, NEVER, true, scheme)).toEqual(['heading 1', 'inline_latex *']);
	});
	it('gives a float no number until it has a caption', async () => {
		const floats = [
			'\\documentclass{article}\n\\begin{document}',
			'\\begin{figure}\\includegraphics{a}\\end{figure}',
			'\\includegraphics{b}',
			'\\begin{table}\\begin{tabular}{c}x\\end{tabular}\\end{table}',
			'\\begin{figure}\\includegraphics{c}\\caption{C}\\end{figure}',
			'\\begin{table}\\caption{T}\\begin{tabular}{c}x\\end{tabular}\\end{table}',
			'\\end{document}'
		].join('\n');
		expect(shown(floats, NEVER, true, await schemeOf(floats))).toEqual(['image 1', 'table_wrapper 1']);
	});
	it('counts past an .aux written before a float was added', async () => {
		const figure = (name: string, label: string) =>
			`\\begin{figure}\\includegraphics{${name}}\\caption{${name}}\\label{${label}}\\end{figure}`;
		const grown = [
			'\\documentclass{article}\n\\begin{document}',
			figure('a', 'fig:a'),
			figure('new', 'fig:new'),
			figure('b', 'fig:b'),
			'\\end{document}'
		].join('\n');
		const compiled = { contents: [], labels: { 'fig:a': '1', 'fig:b': '2' } };
		expect(shown(grown, compiled, true, await schemeOf(grown))).toEqual(['image 1', 'image 2', 'image 3']);
	});
	it('starts the appendix at IEEEtran appendices', async () => {
		const ieee =
			'\\documentclass{IEEEtran}\n\\begin{document}\n\\section{One}\n\\appendices\n\\section{Two}\n\\subsection{Three}\n\\end{document}\n';
		expect(shown(ieee, NEVER, true, await schemeOf(ieee))).toEqual(['heading I', 'heading A', 'heading A']);
	});
	it('numbers the levels down to secnumdepth, as the class sets it and the document changes it', async () => {
		const headings = (preamble: string) =>
			`\\documentclass{article}\n${preamble}\\begin{document}\n\\section{A}\n\\subsection{B}\n\\section{C}\n\\subsection{D}\n\\end{document}\n`;
		const deep = headings('');
		const shallow = headings('\\setcounter{secnumdepth}{1}\n');
		expect(shown(deep, NEVER, true, await schemeOf(deep))).toEqual(['heading 1', 'heading 1.1', 'heading 2', 'heading 2.1']);
		expect(shown(shallow, NEVER, true, await schemeOf(shallow))).toEqual(['heading 1', 'heading 2']);
	});
	it('shows no number after math it cannot count: dmath, and an environment of the document that wraps equation', async () => {
		const wrapped = [
			'\\documentclass{article}\n\\newenvironment{myeq}{\\begin{equation}}{\\end{equation}}\n\\begin{document}',
			'\\begin{equation}a\\end{equation}',
			'\\begin{dmath}b\\end{dmath}',
			'\\begin{equation}c\\end{equation}',
			'\\begin{myeq}d\\end{myeq}',
			'\\begin{equation}e\\end{equation}',
			'\\end{document}'
		].join('\n');
		expect(shown(wrapped, NEVER, true, await schemeOf(wrapped))).toEqual(['block_math (1)']);
	});
	it('reads the definitions of a file the preamble reads in', async () => {
		const main = [
			'\\documentclass{article}\n\\input{macros}\n\\begin{document}',
			'\\section{A}',
			'\\begin{equation}a\\end{equation}',
			'\\beq b\\end{equation}',
			'\\begin{equation}c\\end{equation}',
			'\\end{document}'
		].join('\n');
		const macros = '\\newcommand{\\beq}{\\begin{equation}}\n\\numberwithin{equation}{section}\n';
		const loaded = await loadedPackages(packageUsesIn(main));
		const scheme = numberingSchemeOf(loadedRegistry(loaded, 'counters'), loadedRegistry(loaded, 'counterForms'), main, false, [], [macros]);
		expect(shown(main, NEVER, true, scheme)).toEqual(['heading 1', 'block_math (1.1)']);
	});
	it('prints a \\tag with nested braces or math in place of the number', async () => {
		const tagged =
			'\\documentclass{article}\n\\begin{document}\n\\begin{equation}a\\tag{$x_{1}$}\\end{equation}\n\\begin{equation}b\\end{equation}\n\\end{document}\n';
		expect(shown(tagged, NEVER, true, await schemeOf(tagged))).toEqual(['block_math (x_1)', 'block_math (1)']);
	});

	it('restarts a counter at \\counterwithin* and \\@addtoreset, and at no \\renewcommand of its form', async () => {
		const sections = (preamble: string) =>
			`\\documentclass{article}\n\\makeatletter\n${preamble}\n\\makeatother\n\\begin{document}\n\\section{A}\n\\begin{equation}a\\end{equation}\n\\begin{equation}b\\end{equation}\n\\section{B}\n\\begin{equation}c\\end{equation}\n\\end{document}\n`;
		const numbers = async (preamble: string) => shown(sections(preamble), NEVER, true, await schemeOf(sections(preamble)));
		const restarted = ['heading 1', 'block_math (1)', 'block_math (2)', 'heading 2', 'block_math (1)'];
		expect(await numbers('\\counterwithin*{equation}{section}')).toEqual(restarted);
		expect(await numbers('\\@addtoreset{equation}{section}')).toEqual(restarted);
		expect(await numbers('\\renewcommand{\\theequation}{\\thesection.\\arabic{equation}}')).toEqual([
			'heading 1',
			'block_math (1.1)',
			'block_math (1.2)',
			'heading 2',
			'block_math (2.3)'
		]);
	});
	it('restarts footnotes at each chapter of a book, and counts a minipage footnotes apart in letters', async () => {
		const book = [
			'\\documentclass{book}\n\\begin{document}\n\\chapter{A}',
			'One\\footnote{a}.',
			'\\begin{minipage}{5cm}\nIn\\footnote{b}.\nAgain\\footnote{c}.\n\\end{minipage}',
			'Two\\footnote{d}.',
			'\\chapter{B}',
			'Three\\footnote{e}.',
			'\\end{document}'
		].join('\n');
		expect(shown(book, NEVER, true, await schemeOf(book))).toEqual([
			'heading 1',
			'inline_latex 1',
			'inline_latex a',
			'inline_latex b',
			'inline_latex 2',
			'heading 2',
			'inline_latex 1'
		]);
	});
	it('prints an appendix as its letter in elsarticle, without the word the class puts before it', async () => {
		const article = '\\documentclass{elsarticle}\n\\begin{document}\n\\section{One}\n\\appendix\n\\section{Two}\n\\end{document}\n';
		expect(shown(article, NEVER, true, await schemeOf(article))).toEqual(['heading 1', 'heading A']);
	});
	it('leaves a report footnote to the compile when the folder defines \\footnote, chapter restarts included', async () => {
		const thesis = [
			'\\documentclass{report}\n\\makeatletter\\def\\footnote#1{\\stepcounter{myfoot}}\\makeatother\n\\begin{document}',
			'\\chapter{A}\nText\\footnote{one}.\n\\chapter{B}\nText\\footnote{two}.',
			'\\end{document}'
		].join('\n');
		expect(shown(thesis, NEVER, true, await schemeOf(thesis))).toEqual(['heading 1', 'heading 2']);
	});
});
