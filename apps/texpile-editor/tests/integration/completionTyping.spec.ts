import { expect, test } from '@playwright/test';
import { useTexpile } from './driver/useTexpile';
import { checkCase, acceptCompletion, expectLineStart, labels, openFile, probe, type Case } from './driver/completionHelpers';

const texpile = useTexpile();

const INTRO = '\\section{Introduction}\\label{sec:intro}\n';
const CHAPTER = '\\chapter{Plain}\n';
const SPEED = 'Speed is';
const SPEED_LINE = 'Speed is $v^{2}$ and $x_{max}$.';
function group(name: string, cases: Case[]): void {
	for (const c of cases) test(`${name}: ${c.name}`, async () => void (await checkCase(texpile().source, c)));
}

test.describe('accepting a completion', () => {
	test('Enter takes \\toprule and leaves the caret after it', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(source, { file: 'main.tex', anchor: INTRO, typed: '\\topr' }, { pick: '\\toprule' });
		expect(r.line).toBe('\\toprule|');
	});

	test('a command with an argument gets braces and the caret between them', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(source, { file: 'main.tex', anchor: INTRO, typed: '\\textb' }, { pick: '\\textbf' });
		expect(r.line).toBe('\\textbf{|}');
	});

	test('text typed after \\textbf lands inside its braces', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(
			source,
			{ file: 'main.tex', anchor: INTRO, typed: '\\textb' },
			{ pick: '\\textbf', follow: () => source.type('bold') }
		);
		expect(r.text).toContain('\\textbf{bold}');
	});

	test('\\frac has two fields and Tab moves from the first to the second', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(
			source,
			{ file: 'main.tex', anchor: 'Speed is $v^{2}', typed: ' + \\fr' },
			{
				pick: '\\frac',
				follow: async () => {
					await source.type('a');
					await source.press('Tab');
					await source.type('b');
				}
			}
		);
		expect(r.text).toContain('Speed is $v^{2} + \\frac{a}{b}$');
	});

	test('in a field of \\frac, Tab takes the open list first and moves to the next field after', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(
			source,
			{ file: 'main.tex', anchor: 'Speed is $v^{2}', typed: ' + \\fr' },
			{
				pick: '\\frac',
				follow: async () => {
					await source.type('\\alp');
					await expect.poll(async () => (await source.completions()).map((c) => c.label)).toContain('\\alpha');
					await source.press('Tab');
					await source.press('Tab');
					await source.type('b');
				}
			}
		);
		expect(r.text).toContain('Speed is $v^{2} + \\frac{\\alpha}{b}$');
	});

	test("the document's \\note takes its one required argument", async () => {
		const { source } = texpile();
		const r = await acceptCompletion(source, { file: 'main.tex', anchor: INTRO, typed: '\\not' }, { pick: '\\note' });
		expect(r.line).toBe('\\note{|}');
	});

	test("the folder package's \\qamark takes its required argument", async () => {
		const { source } = texpile();
		const r = await acceptCompletion(source, { file: 'main.tex', anchor: INTRO, typed: '\\qamar' }, { pick: '\\qamark' });
		expect(r.line).toBe('\\qamark{|}');
	});

	test('a package file command gets the braces of its required argument', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(source, { file: 'plain.tex', anchor: CHAPTER, typed: '\\inhousec' }, { pick: '\\inhousecite' });
		expect(r.line).toBe('\\inhousecite{|}');
	});

	test('a fresh \\begin{itemize accepted builds the block with its first \\item', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(source, { file: 'main.tex', anchor: INTRO, typed: '\\begin{itemiz' }, { pick: 'itemize' });
		expect(r.text).toMatch(/\\begin\{itemize\}\n\s+\\item \n\\end\{itemize\}/);
		expect(r.line.trimStart()).toBe('\\item |');
	});

	test('a \\begin{center} typed by hand offers its \\end{center}', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(source, { file: 'main.tex', anchor: INTRO, typed: '\\begin{center}' });
		expect(labels(r.rows)).toEqual(['\\end{center}']);
		expect(r.text).toContain('\\begin{center}\n\n\\end{center}');
		expect(r.line).toBe('|');
	});

	test('accepting a package name fills the braces', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(
			source,
			{ file: 'main.tex', anchor: '\\usepackage{qatools}\n', typed: '\\usepackage{nicema' },
			{ pick: 'nicematrix' }
		);
		expect(r.line).toBe('\\usepackage{nicematrix|}');
	});

	test('accepting a key adds it and a comma continues the list', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(
			source,
			{ file: 'chapters/results.tex', anchor: '\\includegraphics[width=0.4\\textwidth', typed: ',ang' },
			{ pick: 'angle=' }
		);
		expect(r.line.trimStart()).toMatch(/^\\includegraphics\[width=0\.4\\textwidth,angle=\|/);
	});

	test('a cite key replaces only the typed part', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(source, { file: 'main.tex', anchor: 'Speed is', typed: ' \\cite{knu' }, { pick: 'knuth1984' });
		expectLineStart(r, 'Speed is \\cite{knuth1984|}');
	});

	test('the arrow keys move the choice and Enter takes that row', async () => {
		const { source } = texpile();
		const first = await probe(source, { file: 'main.tex', anchor: INTRO, typed: '\\topr' });
		const r = await acceptCompletion(
			source,
			{ file: 'main.tex', anchor: INTRO, typed: '\\topr', insert: '' },
			{ pick: first.length > 1 ? first[1].label : first[0].label }
		);
		expect(r.line.replaceAll('|', '')).toBe(first.length > 1 ? first[1].label : first[0].label);
	});

	test('moving the caret with an arrow key closes the list', async () => {
		const { source } = texpile();
		await openFile(source, 'main.tex');
		const before = await source.text();
		await source.caretAfter(INTRO);
		await source.type('\\topr');
		await expect.poll(() => source.completions().then((r) => r.length)).toBeGreaterThan(0);
		await source.press('ArrowLeft');
		await expect.poll(() => source.completions().then((r) => r.length)).toBe(0);
		await source.restore(before);
	});

	test('a beamer command from the class is inserted with an argument group', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(
			source,
			{ file: 'talk.tex', anchor: '\\begin{frame}{One}\n', typed: '\\framet' },
			{ pick: '\\frametitle' }
		);
		expect(r.line.trimStart()).toMatch(/^\\frametitle[<{]/);
	});

	test('Escape closes the list and keeps what was typed', async () => {
		const { source } = texpile();
		await openFile(source, 'main.tex');
		const before = await source.text();
		await source.caretAfter(INTRO);
		await source.type('\\topr');
		await expect.poll(() => source.completions().then((r) => r.length)).toBeGreaterThan(0);
		await source.press('Escape');
		await expect.poll(() => source.completions().then((r) => r.length)).toBe(0);
		expect(await source.text()).toBe(before.replace(INTRO, `${INTRO}\\topr`));
		await source.restore(before);
	});

	test('Tab takes the selected row like Enter', async () => {
		const { source } = texpile();
		const r = await acceptCompletion(source, { file: 'main.tex', anchor: INTRO, typed: '\\topr' }, { pick: '\\toprule', key: 'Tab' });
		expect(r.line, 'Tab with the list open should accept the row instead of indenting the typed name').toBe('\\toprule|');
	});
});

group('typing', [
	{ name: 'the match ignores case', file: 'main.tex', anchor: INTRO, typed: '\\TopR', hasPrefix: ['\\toprule'] },
	{ name: 'typing fast still lists \\toprule', file: 'main.tex', anchor: INTRO, typed: '\\topr', delay: 0, hasPrefix: ['\\toprule'] },
	{ name: 'a bare backslash lists commands on its own', file: 'main.tex', anchor: INTRO, typed: '\\', has: ['\\(', '\\['] },
	{
		name: 'Ctrl+Space opens the list for a bare backslash',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\',
		explicit: true,
		has: ['\\(', '\\[']
	},
	{
		name: 'Backspace into a name reopens the list',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\toprulexy',
		backspaces: 2,
		hasPrefix: ['\\toprule']
	},
	{
		name: 'Backspace down to the backslash lists commands',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\to',
		backspaces: 2,
		has: ['\\(', '\\[']
	},
	{ name: 'a name that matches nothing closes the list', file: 'main.tex', anchor: INTRO, typed: '\\zzzzqq', none: true },
	{ name: 'plain words offer nothing', file: 'main.tex', anchor: INTRO, typed: 'hello world', none: true },
	{ name: 'the end of a table row offers nothing', file: 'main.tex', anchor: INTRO, typed: 'a & b \\\\', none: true },
	{ name: 'an escaped percent is not a comment', file: 'main.tex', anchor: INTRO, typed: '100\\% \\topr', hasPrefix: ['\\toprule'] },
	{
		name: 'the line after a comment completes again',
		file: 'main.tex',
		anchor: INTRO,
		insert: '% note\n',
		typed: '\\topr',
		hasPrefix: ['\\toprule']
	},
	{ name: 'a command in a comment offers nothing', file: 'main.tex', anchor: INTRO, typed: '% \\topr', none: true },
	{ name: 'a comment after text offers nothing', file: 'main.tex', anchor: SPEED_LINE, typed: ' % \\topr', none: true },
	{ name: 'a cite key in a comment offers nothing', file: 'main.tex', anchor: INTRO, typed: '% \\cite{knu', none: true },
	{ name: 'a package name in a comment offers nothing', file: 'main.tex', anchor: INTRO, typed: '% \\usepackage{tikzpeo', none: true },
	{ name: 'inside \\verb| nothing completes', file: 'main.tex', anchor: INTRO, typed: '\\verb|\\topr', none: true },
	{
		name: 'after a closed \\verb completion is back',
		file: 'main.tex',
		anchor: INTRO,
		typed: '\\verb|x| \\topr',
		hasPrefix: ['\\toprule']
	},
	{ name: 'inside \\lstinline nothing completes', file: 'main.tex', anchor: INTRO, typed: '\\lstinline|\\topr', none: true },
	{
		name: 'inside a verbatim environment nothing completes',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\begin{verbatim}\n',
		typed: '\\topr',
		none: true
	},
	{
		name: 'inside lstlisting nothing completes',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\begin{lstlisting}\n',
		typed: '\\topr',
		none: true
	},
	{
		name: 'after a closed lstlisting completion is back',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\begin{lstlisting}\nx\n\\end{lstlisting}\n',
		typed: '\\topr',
		hasPrefix: ['\\toprule']
	},
	{
		name: 'a command typed inside lstlisting options still completes',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\begin{lstlisting}',
		typed: '[langua',
		hasPrefix: ['language']
	}
]);

group('math and text', [
	{ name: 'display math \\[ opens math mode', file: 'main.tex', anchor: SPEED, typed: ' \\[ \\fr', first: '\\frac' },
	{ name: 'double dollars open math mode', file: 'main.tex', anchor: SPEED, typed: ' $$ \\alp', hasPrefix: ['\\alpha'] },
	{
		name: 'an align environment is math',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\begin{align}\n',
		typed: '\\alp',
		hasPrefix: ['\\alpha']
	},
	{
		name: 'after the closing dollar the text mode is back',
		file: 'main.tex',
		anchor: SPEED,
		typed: ' and $x$ \\alp',
		lacksPrefix: ['\\alpha']
	},
	{ name: 'a text argument has no math commands', file: 'main.tex', anchor: SPEED, typed: ' \\textbf{\\alp', lacksPrefix: ['\\alpha'] },
	{
		name: 'a text argument holding math of its own has them',
		file: 'main.tex',
		anchor: SPEED,
		typed: ' \\textbf{$\\alp',
		hasPrefix: ['\\alpha']
	},
	{ name: '\\text inside math reads as text', file: 'main.tex', anchor: SPEED, typed: ' $x \\text{ \\alp', lacksPrefix: ['\\alpha'] },
	{
		name: 'a command definition body offers math and text commands',
		file: 'main.tex',
		anchor: '\\newcounter{step}\n',
		typed: '\\newcommand{\\zz}{\\alp',
		hasPrefix: ['\\alpha']
	},
	{
		name: 'math symbols outrank text-only commands in math',
		file: 'main.tex',
		anchor: SPEED,
		typed: ' $x = \\sigm',
		hasPrefix: ['\\sigma']
	},
	{ name: '\\left( offers the delimiter pair', file: 'main.tex', anchor: SPEED, typed: ' $x = \\left(', has: ['\\left('] },
	{
		name: 'a new line inside an equation is still math',
		file: 'main.tex',
		anchor: 'E = mc^2',
		typed: '\n\\lambd',
		hasPrefix: ['\\lambda']
	},
	{ name: 'a blank line ends inline math', file: 'main.tex', anchor: SPEED, typed: ' $x\n\n\\alp', lacksPrefix: ['\\alpha'] }
]);

group('definitions typed in the session', [
	{
		name: 'a \\newcommand just typed is offered',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\newcommand{\\zzfoo}[1]{#1}\n',
		typed: '\\zzf',
		hasPrefix: ['\\zzfoo']
	},
	{
		name: 'a \\DeclareMathOperator just typed is offered in math',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\DeclareMathOperator{\\zzop}{zz}\n',
		typed: '$\\zzo',
		hasPrefix: ['\\zzop']
	},
	{
		name: 'a \\newenvironment just typed is offered',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\newenvironment{zzenv}{}{}\n',
		typed: '\\begin{zzen',
		hasPrefix: ['zzenv']
	},
	{
		name: 'a \\def just typed is offered',
		file: 'main.tex',
		anchor: INTRO,
		insert: '\\def\\zzdef{x}\n',
		typed: '\\zzd',
		hasPrefix: ['\\zzdef']
	},
	{
		name: 'a command defined in a comment is not offered',
		file: 'main.tex',
		anchor: INTRO,
		insert: '% \\newcommand{\\zzgone}{x}\n',
		typed: '\\zzg',
		lacksPrefix: ['\\zzgone']
	}
]);
