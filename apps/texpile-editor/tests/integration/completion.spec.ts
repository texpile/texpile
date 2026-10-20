import { useTexpile } from './driver/useTexpile';
import { test } from '@playwright/test';
import { checkCase, type Case } from './driver/completionHelpers';

const texpile = useTexpile();

const INTRO = '\\section{Introduction}\\label{sec:intro}\n';
const CHAPTER = '\\chapter{Plain}\n';
const FRAME = '\\begin{frame}{One}\n';
const RESULTS = '\\section{Results}\\label{sec:results}\n';
function group(name: string, cases: Case[]): void {
	for (const c of cases) test(`${name}: ${c.name}`, async () => void (await checkCase(texpile().source, c)));
}

group('commands', [
	{ name: 'siunitx \\qty where it is loaded', file: 'main.tex', anchor: INTRO, typed: '\\qty', has: ['\\qty'] },
	{ name: 'tcolorbox \\tcbset', file: 'main.tex', anchor: INTRO, typed: '\\tcbs', hasPrefix: ['\\tcbset'] },
	{ name: 'booktabs \\toprule', file: 'main.tex', anchor: INTRO, typed: '\\topr', hasPrefix: ['\\toprule'] },
	{
		name: 'mathtools brings amsopn \\DeclareMathOperator',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\DeclareMathOp',
		hasPrefix: ['\\DeclareMathOperator']
	},
	{ name: 'tikz brings pgf \\pgfmathsetmacro', file: 'main.tex', anchor: INTRO, typed: '\\pgfmathsetm', hasPrefix: ['\\pgfmathsetmacro'] },
	{ name: 'xcolor[table] brings \\cellcolor', file: 'main.tex', anchor: INTRO, typed: '\\cellc', hasPrefix: ['\\cellcolor'] },
	{ name: 'biblatex[natbib=true] brings \\citep', file: 'main.tex', anchor: INTRO, typed: '\\citep', hasPrefix: ['\\citep'] },
	{ name: 'biblatex \\textcite', file: 'main.tex', anchor: INTRO, typed: '\\textci', hasPrefix: ['\\textcite'] },
	{ name: "the document's own \\vect", file: 'main.tex', anchor: INTRO, typed: '\\vec', hasPrefix: ['\\vect'] },
	{ name: "a fragment gets the main file's \\note", file: 'chapters/results.tex', anchor: RESULTS, typed: '\\not', hasPrefix: ['\\note'] },
	{ name: "the folder's own package gives \\qamark", file: 'main.tex', anchor: INTRO, typed: '\\qam', hasPrefix: ['\\qamark'] },
	{ name: "the folder's own package gives \\qadone", file: 'main.tex', anchor: INTRO, typed: '\\qad', hasPrefix: ['\\qadone'] },
	{
		name: "no internals of the folder's own package",
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\qa',
		hasPrefix: ['\\qamark'],
		lacksRe: [/@/]
	},
	{
		name: 'a package file in .texpile/packages gives \\inhousecite and \\inhouselogo',
		file: 'plain.tex',
		anchor: CHAPTER,
		typed: '\\inhouse',
		hasPrefix: ['\\inhousecite', '\\inhouselogo']
	},
	{ name: 'the beamer class gives \\frametitle', file: 'talk.tex', anchor: FRAME, typed: '\\framet', hasPrefix: ['\\frametitle'] },
	{ name: 'the report class gives \\chapter', file: 'plain.tex', anchor: CHAPTER, typed: '\\chap', hasPrefix: ['\\chapter'] },
	{ name: 'the article class has no \\chapter', file: 'main.tex', anchor: INTRO, typed: '\\chap', lacksRe: [/^\\chapter(\W|$)/] },
	{ name: 'the article class has no \\frametitle', file: 'main.tex', anchor: INTRO, typed: '\\framet', lacksRe: [/^\\frametitle/] }
]);

test('commands: \\qty is not offered as a plain command where siunitx is not loaded', async () => {
	const rows = await checkCase(texpile().source, { name: '', file: 'plain.tex', anchor: CHAPTER, typed: '\\qty' });
	const qty = rows.find((r) => r.label === '\\qty');
	test.info().annotations.push({ type: 'qty', description: JSON.stringify(qty ?? null) });
	if (qty) expectPackageSuggestion(qty.detail, '\\qty');
});

test('commands: \\cellcolor without the table option comes only as a colortbl suggestion', async () => {
	const rows = await checkCase(texpile().source, { name: '', file: 'plain.tex', anchor: CHAPTER, typed: '\\cellc' });
	for (const r of rows.filter((x) => x.label.startsWith('\\cellcolor'))) expectPackageSuggestion(r.detail, r.label, 'colortbl');
});

function expectPackageSuggestion(detail: string, label: string, pkg?: string): void {
	const ok = detail !== '' && (pkg === undefined || detail === pkg);
	if (!ok)
		throw new Error(
			`${label} listed with detail ${JSON.stringify(detail)}${pkg ? `, expected ${pkg}` : ', expected the package that adds it'}`
		);
}

group('mode', [
	{ name: 'in inline math \\frac comes first', file: 'main.tex', anchor: 'Speed is $v^{2}', typed: ' + \\fr', first: '\\frac' },
	{ name: 'in text there is no \\frac', file: 'main.tex', anchor: 'Speed is', typed: ' \\fr', lacksPrefix: ['\\frac'] },
	{ name: 'in an equation \\alpha', file: 'main.tex', anchor: 'E = mc^2', typed: ' + \\alp', hasPrefix: ['\\alpha'] },
	{ name: 'in text there is no \\alpha', file: 'main.tex', anchor: 'Speed is', typed: ' \\alp', lacksPrefix: ['\\alpha'] },
	{ name: 'in math amsmath \\text', file: 'main.tex', anchor: 'Speed is $v^{2}', typed: ' \\tex', hasPrefix: ['\\text'] },
	{ name: 'in an equation siunitx \\qty', file: 'main.tex', anchor: 'E = mc^2', typed: ' \\qty', hasPrefix: ['\\qty'] }
]);

group('envs', [
	{ name: 'tcolorbox environment', file: 'main.tex', anchor: INTRO, typed: '\\begin{tcolorb', hasPrefix: ['tcolorbox'] },
	{ name: 'algpseudocode algorithmic', file: 'main.tex', anchor: INTRO, typed: '\\begin{algorithmi', hasPrefix: ['algorithmic'] },
	{ name: "the document's own theorem", file: 'main.tex', anchor: INTRO, typed: '\\begin{theo', hasPrefix: ['theorem'] },
	{ name: "the folder package's qabox", file: 'main.tex', anchor: INTRO, typed: '\\begin{qab', hasPrefix: ['qabox'] },
	{ name: 'enumitem[inline] enumerate*', file: 'main.tex', anchor: INTRO, typed: '\\begin{enumerate*', hasPrefix: ['enumerate*'] },
	{
		name: 'enumitem without inline has no enumerate*',
		file: 'plain.tex',
		anchor: CHAPTER,
		typed: '\\begin{enumerate*',
		lacksPrefix: ['enumerate*']
	},
	{ name: 'a half-typed name is not offered back', file: 'main.tex', anchor: INTRO, typed: '\\begin{frob', lacks: ['frob'] },
	{
		name: '\\end{ offers the open itemize first',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\begin{itemize}\n\\item a\n',
		typed: '\\end{',
		first: 'itemize'
	},
	{
		name: '\\end{ offers the open tcolorbox first',
		file: 'chapters/results.tex',
		anchor: RESULTS,
		insert: '\\begin{tcolorbox}\nx\n',
		typed: '\\end{',
		first: 'tcolorbox'
	},
	{ name: 'beamer block', file: 'talk.tex', anchor: FRAME, typed: '\\begin{bloc', hasPrefix: ['block'] },
	{
		name: 'the inhouse package file gives its inhousebox',
		file: 'plain.tex',
		anchor: CHAPTER,
		typed: '\\begin{inhouseb',
		hasPrefix: ['inhousebox']
	}
]);

group('packages', [
	{
		name: 'package names: nicematrix',
		file: 'main.tex',
		anchor: '\\usepackage{qatools}\n',
		typed: '\\usepackage{nicema',
		has: ['nicematrix']
	},
	{
		name: 'package names: tikzpeople',
		file: 'main.tex',
		anchor: '\\usepackage{qatools}\n',
		typed: '\\usepackage{tikzpeo',
		has: ['tikzpeople']
	},
	{
		name: 'geometry options: landscape',
		file: 'main.tex',
		anchor: '\\usepackage[',
		replace: 'margin=2cm',
		typed: 'lan',
		hasPrefix: ['landscape']
	},
	{
		name: 'babel options: french',
		file: 'main.tex',
		anchor: '\\usepackage[english,',
		replace: 'ngerman',
		typed: 'fren',
		hasPrefix: ['french']
	},
	{ name: 'article options: a4paper', file: 'main.tex', anchor: '\\documentclass[', replace: '11pt', typed: 'a4', has: ['a4paper'] },
	{
		name: 'beamer options: handout',
		file: 'talk.tex',
		anchor: '\\documentclass[',
		replace: 'aspectratio=169',
		typed: 'han',
		hasPrefix: ['handout']
	},
	{
		name: "beamer does not offer article's a4paper",
		file: 'talk.tex',
		anchor: '\\documentclass[',
		replace: 'aspectratio=169',
		typed: 'a4p',
		lacks: ['a4paper']
	},
	{ name: 'class names: scrartcl', file: 'plain.tex', anchor: '\\documentclass{', replace: 'report', typed: 'scrar', has: ['scrartcl'] },
	{ name: 'tikz libraries: positioning', file: 'main.tex', anchor: '\\usetikzlibrary{arrows.meta', typed: ',positi', has: ['positioning'] }
]);

group('keys', [
	{
		name: 'graphicx \\includegraphics: angle',
		file: 'chapters/results.tex',
		anchor: '\\includegraphics[width=0.4\\textwidth',
		typed: ',ang',
		hasPrefix: ['angle']
	},
	{ name: 'hyperref \\hypersetup: colorlinks', file: 'main.tex', anchor: INTRO, typed: '\\hypersetup{colorl', hasPrefix: ['colorlinks'] },
	{ name: 'tcolorbox \\tcbset: colback', file: 'main.tex', anchor: INTRO, typed: '\\tcbset{colba', hasPrefix: ['colback'] },
	{ name: 'siunitx \\sisetup: round-mode', file: 'main.tex', anchor: INTRO, typed: '\\sisetup{round-m', hasPrefix: ['round-mode'] },
	{
		name: 'tcolorbox environment options: colframe',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\begin{tcolorbox}[colfr',
		hasPrefix: ['colframe']
	},
	{ name: 'enumitem enumerate options: label', file: 'main.tex', anchor: INTRO, typed: '\\begin{enumerate}[lab', hasPrefix: ['label'] },
	{ name: 'listings language values: Python', file: 'main.tex', anchor: INTRO, typed: '\\lstset{language=Pyt', has: ['language=Python'] },
	{ name: 'enumitem \\setlist: leftmargin', file: 'main.tex', anchor: INTRO, typed: '\\setlist{leftm', hasPrefix: ['leftmargin'] },
	{ name: 'geometry \\geometry: landscape', file: 'main.tex', anchor: INTRO, typed: '\\geometry{lands', hasPrefix: ['landscape'] }
]);
