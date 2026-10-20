import { describe, expect, it } from 'vitest';
import { undefinedCommandCheck } from '$lib/languages/latex/intellisense/checks/rules/undefinedCommandCheck';
import { checkInput } from '../checkInput';

const document = (body: string, preamble = '') => `\\documentclass{article}\n${preamble}\\begin{document}\n${body}\n\\end{document}\n`;

describe('undefinedCommandCheck', () => {
	it('warns about \\toprule without booktabs and offers the package', async () => {
		const text = document('\\toprule');
		const [problem, ...more] = undefinedCommandCheck.run(await checkInput(text));
		expect(more).toEqual([]);
		expect(problem).toMatchObject({ anchor: '\\toprule', at: text.indexOf('\\toprule'), fix: { kind: 'add-package', name: 'booktabs' } });
		expect(undefinedCommandCheck.run(await checkInput(document('\\toprule', '\\usepackage{booktabs}\n')))).toEqual([]);
	});

	it('accepts what the document defines itself, here or in another file', async () => {
		const preamble =
			'\\newcommand{\\mine}{x}\\def\\other#1{#1}\\newif\\iffancy\\newif{\\ifbraced}\\let\\alias\\mine\\def\\bal#1\\eal{#1}\\DeclareSIUnit\\molar{M}\n\\newtheorem{claim}{Claim}\n';
		const body =
			'\\mine \\other{a} \\iffancy\\fancytrue\\fi \\bracedfalse \\alias \\begin{claim}x\\end{claim} \\theclaim \\fromElsewhere \\bal x\\eal \\molar';
		const input = await checkInput(document(body, preamble), { elsewhere: '\\newcommand{\\fromElsewhere}{y}' });
		expect(undefinedCommandCheck.run(input)).toEqual([]);
	});

	it('reads the code of a call that only names an environment or a counter', async () => {
		const preamble = '\\AtBeginEnvironment{itemize}{\\inhook}\n\\setcounter{page}{\\incounter}\n';
		const problems = undefinedCommandCheck.run(await checkInput(document('x', preamble)));
		expect(problems.map((p) => p.anchor)).toEqual(['\\inhook', '\\incounter']);
	});

	it('reads an undefined command once, skips definition bodies, comments and verbatim', async () => {
		const body = '\\typo \\typo % \\commented\n\\verb|\\inverb|\n\\newcommand{\\fine}{\\later}\\begin{nope}\\end{nope}';
		const problems = undefinedCommandCheck.run(await checkInput(document(body)));
		expect(problems.map((p) => p.anchor)).toEqual(['\\typo', 'nope']);
	});

	it('knows the engine primitives and the box dimensions from the data', async () => {
		const body = '\\pdfoutput=1 \\XeTeXinputencoding \\raisebox{\\height}{x} \\makebox[\\totalheight]{y}';
		expect(undefinedCommandCheck.run(await checkInput(document(body)))).toEqual([]);
	});

	it('stays quiet when a package the document loads has no data', async () => {
		const input = await checkInput(document('\\typo', '\\usepackage{nosuchpackagehere}\n'));
		expect(undefinedCommandCheck.run(input)).toEqual([]);
		expect(undefinedCommandCheck.run({ ...input, elsewhere: null })).toEqual([]);
	});

	it('counts what an ExplSyntaxOn region defines and skips the names it spells with _ and :', async () => {
		const preamble =
			'\\ExplSyntaxOn\n\\NewDocumentCommand \\mine { m } { \\tl_set:Nn \\l_tmpa_tl {#1} }\n\\newcommand \\other {x}\n' +
			'\\DeclareDocumentCommand \\third { } { \\mine {y} }\n\\cs_new:Npn \\fourth #1 { #1 }\n\\ExplSyntaxOff\n';
		const body = '\\mine{a} \\other \\third \\fourth{b} \\typo';
		const problems = undefinedCommandCheck.run(await checkInput(document(body, preamble)));
		expect(problems.map((p) => p.anchor)).toEqual(['\\typo']);
	});

	it('checks a document whose package is a .sty in the folder, and reads what that file defines', async () => {
		const text = document('\\mine \\typo', '\\usepackage{mystyle}\n');
		const read = await checkInput(text, { elsewhere: '\\newcommand{\\mine}{x}', local: ['mystyle'] });
		expect(undefinedCommandCheck.run(read).map((p) => p.anchor)).toEqual(['\\typo']);
		expect(undefinedCommandCheck.run(await checkInput(text, { elsewhere: '\\newcommand{\\mine}{x}' }))).toEqual([]);
	});

	it('counts the operands of a tikz let clause', async () => {
		const body = '\\path let \\p1 = (0,0), \\n2 = {veclen(\\x1,\\y1)} in (\\p1) -- (\\x1,\\n2) \\typo;';
		const problems = undefinedCommandCheck.run(await checkInput(document(body, '\\usepackage{tikz}\n')));
		expect(problems.map((p) => p.anchor)).toEqual(['\\typo']);
	});

	it('points the add-package fix of a chapter file at the main file', async () => {
		const input = await checkInput(document('\\toprule'));
		const chapter = { ...input, text: '\\toprule', path: '/project/chapter.tex', isMain: false };
		expect(undefinedCommandCheck.run(chapter)[0].fix).toEqual({ kind: 'add-package', name: 'booktabs', into: '/project/main.tex' });
		expect(undefinedCommandCheck.run(input)[0].fix).toEqual({ kind: 'add-package', name: 'booktabs' });
	});

	it('does not read what follows \\end{document}', async () => {
		const text = document('\\typo') + '\\later\n';
		expect(undefinedCommandCheck.run(await checkInput(text)).map((p) => p.anchor)).toEqual(['\\typo']);
	});

	it('reads the column names of every \\csvreader call, however close together', async () => {
		const first = '\\csvreader{a.csv}{X=\\Xa}{\\Xa}';
		const body = `${first}${' '.repeat(1950 - first.length)}\\csvreader{${'f'.repeat(100)}.csv}{Y=\\Yb}{\\Yb \\typo}`;
		expect(undefinedCommandCheck.run(await checkInput(document(body, '\\usepackage{csvsimple}\n'))).map((p) => p.anchor)).toEqual([
			'\\typo'
		]);
	});

	it('follows a definition wrapper through a second wrapper', async () => {
		const preamble =
			'\\makeatletter\n\\newcommand\\MyPairedDelimiter{\\@ifstar\\My@Paired@Star\\My@Paired@Delimiter}\n' +
			'\\newcommand\\My@Paired@Delimiter[3]{\\newcommand#1{\\left#2 ##1 \\right#3}}\n\\makeatother\n\\MyPairedDelimiter\\abs{|}{|}\n';
		expect(undefinedCommandCheck.run(await checkInput(document('\\abs{x} \\typo', preamble))).map((p) => p.anchor)).toEqual(['\\typo']);
	});

	it('counts \\typein[\\name], and leaves a name the document tests for', async () => {
		const body =
			'\\typein[\\filename]{Name}\\filename \\let\\Im\\undefined \\@ifundefined{fooj}{}{\\fooj} \\ifdefined\\barj \\barj\\fi \\typo';
		expect(undefinedCommandCheck.run(await checkInput(document(body))).map((p) => p.anchor)).toEqual(['\\typo']);
	});

	it('counts an environment a wrapper names or builds from its argument', async () => {
		const preamble =
			'\\newcommand{\\newsiamthm}[2]{\\newtheorem{#1}{#2}}\\newsiamthm{lemma}{Lemma}\n' +
			'\\newcommand{\\newreptheorem}[2]{\\newenvironment{rep#1}{x}{y}}\\newreptheorem{proposition}{Proposition}\n';
		const body = '\\begin{lemma}\\end{lemma}\\begin{repproposition}\\end{repproposition}\\begin{nope}\\end{nope}';
		expect(undefinedCommandCheck.run(await checkInput(document(body, preamble))).map((p) => p.anchor)).toEqual(['nope']);
	});

	it('counts the names a definer derives from an argument', async () => {
		const preamble =
			'\\usepackage{thmtools,enumitem,multibib,manyfoot,tcolorbox}\\tcbuselibrary{theorems}\n\\newlist{steps}{enumerate}{3}\n' +
			'\\newcites{Supp}{More}\n\\DeclareNewFootnote{Num}\n\\newtcbtheorem{claim}{Claim}{}{cl}\n';
		const body =
			'\\begin{restatable}{theorem}{lem}x\\end{restatable}\n\\lem* \\stepsi \\thestepsii \\labelstepsiii \\citeSupp{a} \\footinsNum \\footnoteNum{b}' +
			'\n\\begin{claim*}{T}{l}x\\end{claim*} \\typo';
		const problems = undefinedCommandCheck.run(await checkInput(document(body, preamble)));
		expect(problems.map((p) => p.anchor)).toEqual(['\\typo']);
	});
});
