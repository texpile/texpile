import { useTexpile } from './driver/useTexpile';
import { test } from '@playwright/test';
import { checkCase, type Case } from './driver/completionHelpers';

const texpile = useTexpile({
	files: {
		'figures/photo.png': 'png',
		'figures/chart.pdf': 'pdf',
		'data/table.csv': 'a,b'
	}
});

const INTRO = '\\section{Introduction}\\label{sec:intro}\n';
const SPEED = 'Speed is';
const BODY = 'Body text.';
const CHAPTER = '\\chapter{Plain}\n';
function group(name: string, cases: Case[]): void {
	for (const c of cases) test(`${name}: ${c.name}`, async () => void (await checkCase(texpile().source, c)));
}

group('registries', [
	{ name: "colors: the document's own brandblue", file: 'main.tex', anchor: SPEED, typed: ' \\textcolor{brandb', has: ['brandblue'] },
	{
		name: 'colors: dvipsnames needs its option, so no Apricot',
		file: 'main.tex',
		anchor: SPEED,
		typed: ' \\textcolor{Ap',
		lacks: ['Apricot']
	},
	{ name: 'colors: xcolor cyan', file: 'main.tex', anchor: SPEED, typed: ' \\textcolor{cy', has: ['cyan'] },
	{ name: "counters: the document's own step", file: 'main.tex', anchor: SPEED, typed: ' \\setcounter{st', has: ['step'] },
	{ name: 'counters: section', file: 'main.tex', anchor: SPEED, typed: ' \\setcounter{sec', has: ['section'] },
	{ name: 'page styles: fancyhdr fancy', file: 'main.tex', anchor: SPEED, typed: ' \\pagestyle{fan', has: ['fancy'] },
	{ name: 'page styles: plain', file: 'main.tex', anchor: SPEED, typed: ' \\pagestyle{pl', has: ['plain'] },
	{ name: 'languages: babel ngerman', file: 'main.tex', anchor: SPEED, typed: ' \\selectlanguage{ng', has: ['ngerman'] },
	{ name: 'bib styles: natbib plainnat', file: 'plain.tex', anchor: 'Text.', typed: ' \\bibliographystyle{plainn', has: ['plainnat'] },
	{ name: 'beamer themes: Berlin', file: 'talk.tex', anchor: '\\usetheme{', replace: 'Madrid', typed: 'Ber', has: ['Berlin'] }
]);

group('names', [
	{ name: 'cite keys: knuth1984', file: 'main.tex', anchor: SPEED, typed: ' \\cite{knu', has: ['knuth1984'] },
	{
		name: 'textcite keys in a fragment: lamport1986',
		file: 'chapters/results.tex',
		anchor: BODY,
		typed: ' \\textcite{lam',
		has: ['lamport1986']
	},
	{ name: 'ref: a label from another file', file: 'main.tex', anchor: SPEED, typed: ' \\ref{fig', has: ['fig:plot'] },
	{ name: 'cref in a fragment: eq:energy from main', file: 'chapters/results.tex', anchor: BODY, typed: ' \\cref{eq', has: ['eq:energy'] },
	{ name: 'eqref offers labels', file: 'main.tex', anchor: SPEED, typed: ' \\eqref{', has: ['eq:energy'] },
	{ name: 'glossaries \\gls: latex', file: 'main.tex', anchor: SPEED, typed: ' \\gls{la', has: ['latex'] },
	{ name: 'acro \\ac in a fragment: cpu', file: 'chapters/results.tex', anchor: BODY, typed: ' \\ac{c', has: ['cpu'] },
	{
		name: '\\input paths: chapters/',
		file: 'main.tex',
		anchor: '\\input{',
		replace: 'chapters/results',
		typed: 'ch',
		hasPrefix: ['chapters']
	},
	{
		name: '\\includegraphics paths: figures/photo.png',
		file: 'chapters/results.tex',
		anchor: '\\includegraphics[width=0.4\\textwidth]{',
		replace: 'figures/plot.png',
		typed: 'figures/ph',
		hasPrefix: ['figures/photo']
	},
	{
		name: '\\addbibresource paths: refs.bib',
		file: 'main.tex',
		anchor: '\\addbibresource{',
		replace: 'refs.bib',
		typed: 'r',
		hasPrefix: ['refs.bib']
	},
	{ name: 'superscripts used before: 2', file: 'main.tex', anchor: 'and $x_{max}$', typed: ' and $y^{', has: ['2'] },
	{ name: 'subscripts used before: max', file: 'main.tex', anchor: 'and $x_{max}$', typed: ' and $y_{', has: ['max'] }
]);

group('more registries', [
	{ name: 'colors: \\color takes the same names', file: 'main.tex', anchor: SPEED, typed: ' {\\color{brandb', has: ['brandblue'] },
	{
		name: 'colors: after ! the next color is named',
		file: 'main.tex',
		anchor: SPEED,
		typed: ' \\textcolor{red!50!brandb',
		has: ['brandblue']
	},
	{
		name: 'colors: \\definecolor names a new color so offers none',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\definecolor{brandb',
		none: true
	},
	{
		name: 'colors: a color defined just now is offered',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\definecolor{zzcolor}{RGB}{1,2,3}\n',
		typed: '\\textcolor{zzc',
		has: ['zzcolor']
	},
	{
		name: 'colors: dvipsnames appear once the option is loaded',
		file: 'plain.tex',
		anchor: 'Text.',
		edit: { anchor: '\\usepackage{xcolor}\n', insert: '\\usepackage[dvipsnames]{xcolor}\n' },
		typed: ' \\textcolor{Apr',
		has: ['Apricot']
	},
	{ name: 'counters: \\addtocounter', file: 'main.tex', anchor: SPEED, typed: ' \\addtocounter{page', has: ['page'] },
	{ name: 'counters: \\stepcounter', file: 'main.tex', anchor: SPEED, typed: ' \\stepcounter{subsec', has: ['subsection'] },
	{ name: 'counters: \\value', file: 'main.tex', anchor: SPEED, typed: ' \\value{equa', has: ['equation'] },
	{
		name: 'counters: \\newcounter names a new counter so offers none',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\newcounter{sec',
		none: true
	},
	{
		name: 'counters: one defined just now is offered',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\newcounter{zzcount}\n',
		typed: '\\setcounter{zzc',
		has: ['zzcount']
	},
	{
		name: 'counters: the theorem counter from \\newtheorem',
		file: 'main.tex',
		anchor: SPEED,
		typed: ' \\setcounter{theor',
		has: ['theorem']
	},
	{ name: 'page styles: \\thispagestyle empty', file: 'main.tex', anchor: SPEED, typed: ' \\thispagestyle{emp', has: ['empty'] },
	{ name: 'page styles: headings', file: 'main.tex', anchor: SPEED, typed: ' \\pagestyle{head', has: ['headings'] },
	{ name: 'languages: \\foreignlanguage', file: 'main.tex', anchor: SPEED, typed: ' \\foreignlanguage{engl', has: ['english'] },
	{
		name: 'languages: otherlanguage environment argument',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\begin{otherlanguage}{ng',
		has: ['ngerman']
	},
	{
		name: 'languages: the loaded ones carry their tag',
		file: 'main.tex',
		anchor: SPEED,
		typed: ' \\selectlanguage{english',
		has: ['english']
	},
	{ name: 'bib styles: IEEEtran', file: 'main.tex', anchor: SPEED, typed: ' \\bibliographystyle{ieee', has: ['IEEEtran'] },
	{ name: 'bib styles: plain', file: 'main.tex', anchor: SPEED, typed: ' \\bibliographystyle{pla', has: ['plain'] },
	{ name: 'beamer: \\usecolortheme', file: 'talk.tex', anchor: '\\usetheme{Madrid}\n', typed: '\\usecolortheme{be', hasPrefix: ['beaver'] },
	{
		name: 'beamer: \\usefonttheme',
		file: 'talk.tex',
		anchor: '\\usetheme{Madrid}\n',
		typed: '\\usefonttheme{prof',
		hasPrefix: ['professionalfonts']
	},
	{
		name: 'beamer: \\useoutertheme',
		file: 'talk.tex',
		anchor: '\\usetheme{Madrid}\n',
		typed: '\\useoutertheme{infol',
		hasPrefix: ['infolines']
	},
	{ name: 'beamer: themes are not offered in an article', file: 'main.tex', anchor: INTRO, typed: '\\usetheme{Berl', lacks: ['Berlin'] }
]);

group('more names', [
	{ name: 'cite: \\citep', file: 'main.tex', anchor: SPEED, typed: ' \\citep{knu', has: ['knuth1984'] },
	{ name: 'cite: \\citet', file: 'main.tex', anchor: SPEED, typed: ' \\citet{lam', has: ['lamport1986'] },
	{ name: 'cite: \\parencite', file: 'main.tex', anchor: SPEED, typed: ' \\parencite{knu', has: ['knuth1984'] },
	{ name: 'cite: \\autocite', file: 'main.tex', anchor: SPEED, typed: ' \\autocite{lam', has: ['lamport1986'] },
	{ name: 'cite: \\footcite', file: 'main.tex', anchor: SPEED, typed: ' \\footcite{knu', has: ['knuth1984'] },
	{ name: 'cite: \\nocite', file: 'main.tex', anchor: SPEED, typed: ' \\nocite{knu', has: ['knuth1984'] },
	{ name: 'cite: the optional argument before the keys', file: 'main.tex', anchor: SPEED, typed: ' \\cite[p.~5]{knu', has: ['knuth1984'] },
	{ name: 'cite: the second key of a list', file: 'main.tex', anchor: SPEED, typed: ' \\cite{knuth1984,lam', has: ['lamport1986'] },
	{ name: 'cite: both keys on an empty argument', file: 'main.tex', anchor: SPEED, typed: ' \\cite{', has: ['knuth1984', 'lamport1986'] },
	{ name: 'cite: an author surname finds the key', file: 'main.tex', anchor: SPEED, typed: ' \\cite{Lamport', has: ['lamport1986'] },
	{ name: 'cite: a title word finds the key', file: 'main.tex', anchor: SPEED, typed: ' \\cite{TeXbook', has: ['knuth1984'] },
	{ name: 'cite: nothing outside a cite argument', file: 'main.tex', anchor: SPEED, typed: ' \\textbf{knu', lacks: ['knuth1984'] },
	{ name: 'cite: a bare word is not a key list', file: 'main.tex', anchor: SPEED, typed: ' knuth1', none: true },
	{ name: 'cite: keys in the fragment too', file: 'chapters/results.tex', anchor: BODY, typed: ' \\cite{knu', has: ['knuth1984'] },
	{ name: 'ref: \\autoref', file: 'main.tex', anchor: SPEED, typed: ' \\autoref{sec:', has: ['sec:intro', 'sec:results'] },
	{ name: 'ref: \\pageref', file: 'main.tex', anchor: SPEED, typed: ' \\pageref{thm', has: ['thm:main'] },
	{ name: 'ref: \\Cref', file: 'main.tex', anchor: SPEED, typed: ' \\Cref{fig', has: ['fig:plot'] },
	{ name: 'ref: \\vref', file: 'main.tex', anchor: SPEED, typed: ' \\vref{eq', has: ['eq:energy'] },
	{
		name: 'ref: the second label of a \\cref list',
		file: 'main.tex',
		anchor: SPEED,
		typed: ' \\cref{sec:intro,sec:res',
		has: ['sec:results']
	},
	{
		name: 'ref: a label typed just now is offered',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\label{zz:fresh}\n',
		typed: 'See \\ref{zz:',
		has: ['zz:fresh']
	},
	{ name: 'ref: \\label defines a name so offers none', file: 'main.tex', anchor: INTRO, typed: '\\label{sec:', none: true },
	{
		name: 'ref: a label inside a comment is not offered',
		file: 'main.tex',
		anchor: INTRO,
		insert: '% \\label{zz:gone}\n',
		typed: 'See \\ref{zz:',
		lacks: ['zz:gone']
	},
	{ name: 'glossary: \\Gls', file: 'main.tex', anchor: SPEED, typed: ' \\Gls{la', has: ['latex'] },
	{ name: 'glossary: \\glspl', file: 'main.tex', anchor: SPEED, typed: ' \\glspl{la', has: ['latex'] },
	{
		name: 'glossary: an entry defined just now',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\newglossaryentry{zzterm}{name={zz},description={d}}\n',
		typed: 'See \\gls{zz',
		has: ['zzterm']
	},
	{ name: 'acro: \\acs', file: 'main.tex', anchor: SPEED, typed: ' \\acs{cp', has: ['cpu'] },
	{ name: 'acro: \\acl', file: 'main.tex', anchor: SPEED, typed: ' \\acl{cp', has: ['cpu'] },
	{ name: 'acro: \\acf', file: 'main.tex', anchor: SPEED, typed: ' \\acf{cp', has: ['cpu'] },
	{ name: 'acro: an acronym only, so no glossary entry', file: 'main.tex', anchor: SPEED, typed: ' \\ac{la', lacks: ['latex'] },
	{
		name: 'acro: a new acronym defined just now',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\DeclareAcronym{zzac}{short=ZZ,long=zed zed}\n',
		typed: 'See \\ac{zz',
		has: ['zzac']
	},
	{ name: 'paths: \\include', file: 'main.tex', anchor: INTRO, typed: '\\include{chap', hasPrefix: ['chapters'] },
	{
		name: 'paths: \\input inside a folder',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\input{chapters/res',
		hasPrefix: ['chapters/results']
	},
	{
		name: 'paths: \\includegraphics lists the images',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\includegraphics{figures/',
		hasPrefix: ['figures/photo', 'figures/chart']
	},
	{
		name: 'paths: \\includegraphics lists no .tex or .bib',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\includegraphics{',
		lacksRe: [/\.(tex|bib)$/]
	},
	{
		name: 'paths: \\addbibresource lists no .tex',
		file: 'main.tex',
		anchor: '\\addbibresource{',
		replace: 'refs.bib',
		typed: '',
		explicit: true,
		lacksRe: [/\.tex$/]
	},
	{ name: 'paths: \\bibliography', file: 'main.tex', anchor: INTRO, typed: '\\bibliography{ref', hasPrefix: ['refs'] },
	{
		name: "paths: the folder's own package in \\usepackage",
		file: 'main.tex',
		anchor: '\\usepackage{qatools}\n',
		typed: '\\usepackage{qatoo',
		has: ['qatools']
	},
	{
		name: 'paths: \\RequirePackage names a package',
		file: 'main.tex',
		anchor: '\\usepackage{qatools}\n',
		typed: '\\RequirePackage{tikzpeo',
		has: ['tikzpeople']
	},
	{
		name: 'paths: \\PassOptionsToPackage names a package in its second argument',
		file: 'main.tex',
		anchor: '\\documentclass[11pt]{article}\n',
		typed: '\\PassOptionsToPackage{dvipsnames}{xcol',
		has: ['xcolor']
	},
	{
		name: 'paths: \\documentclass names a class',
		file: 'plain.tex',
		anchor: '\\documentclass{',
		replace: 'report',
		typed: 'beam',
		has: ['beamer']
	},
	{
		name: 'paths: the second package of a list',
		file: 'main.tex',
		anchor: '\\usepackage{qatools}\n',
		typed: '\\usepackage{amsmath,amsth',
		has: ['amsthm']
	},
	{
		name: 'paths: an option list is not the package name',
		file: 'main.tex',
		anchor: '\\usepackage{qatools}\n',
		typed: '\\usepackage[',
		none: true
	},
	{
		name: 'options: xcolor offers dvipsnames',
		file: 'main.tex',
		anchor: '\\usepackage[',
		nth: 2,
		replace: 'table',
		typed: 'dvips',
		hasPrefix: ['dvipsnames']
	},
	{
		name: 'options: the release date slot offers a date',
		file: 'main.tex',
		anchor: '\\usepackage{qatools}\n',
		typed: '\\usepackage{xcolor}[',
		hasPrefix: ['YYYY/MM/DD']
	},
	{ name: 'options: article font size', file: 'main.tex', anchor: '\\documentclass[', replace: '11pt', typed: '12', hasPrefix: ['12pt'] },
	{
		name: 'options: a later option in the class list',
		file: 'main.tex',
		anchor: '\\documentclass[11pt',
		typed: ',two',
		hasPrefix: ['twocolumn', 'twoside']
	},
	{
		name: 'script: nested superscripts are mined whole',
		file: 'main.tex',
		anchor: INTRO,
		insert: '$a^{\\mathrm{T}}$ ',
		typed: '$b^{',
		has: ['\\mathrm{T}']
	},
	{ name: 'script: nothing offered after a plain caret', file: 'main.tex', anchor: SPEED, typed: ' $y^', none: true }
]);

group('folder package and package file', [
	{
		name: 'the .texpile package file gives \\inhousecite with its argument signature',
		file: 'plain.tex',
		anchor: CHAPTER,
		typed: '\\inhousec',
		hasPrefix: ['\\inhousecite']
	},
	{
		name: 'the .texpile package file gives no command to a document that does not load it',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\inhouselo',
		lacksPrefix: ['\\inhouselogo']
	},
	{
		name: 'the folder package is not offered to a document that does not load it',
		file: 'plain.tex',
		anchor: CHAPTER,
		typed: '\\qamar',
		lacksPrefix: ['\\qamark']
	}
]);
