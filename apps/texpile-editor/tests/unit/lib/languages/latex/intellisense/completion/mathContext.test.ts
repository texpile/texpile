import { afterEach, describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { modeAt } from '$lib/languages/latex/intellisense/completion/mathContext';
import { latexCompletionSource } from '$lib/languages/latex/intellisense/completion/dispatch';
import { documentPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { updateSettings } from '$lib/settings';

const PREAMBLE = '\\documentclass{article}\n';

// the cursor is at the |
async function modeOf(marked: string, preamble = PREAMBLE + '\\begin{document}\n') {
	const doc = preamble + marked.replaceAll('|', '');
	const state = EditorState.create({ doc });
	return modeAt(state, preamble.length + marked.indexOf('|'), await documentPackages(doc));
}

afterEach(() => updateSettings({ completionByMode: true }));

describe('mode at the cursor', () => {
	it('finds inline math inside a text argument', async () => {
		expect(await modeOf('\\textbf{ $\\alph|')).toBe('math');
		expect(await modeOf('\\footnote{the map $f:\\alph|')).toBe('math');
		expect(await modeOf('\\mbox{$\\alph|')).toBe('math');
		expect(await modeOf('\\tikz{\\node{$\\alph|')).toBe('math');
		expect(await modeOf('$\\text{if $\\alph|')).toBe('math');
	});

	it('keeps the argument text once its math has closed', async () => {
		expect(await modeOf('\\textbf{ $x$ and \\alph|')).toBe('text');
		expect(await modeOf('$\\text{if $x$ then \\alph|')).toBe('text');
	});

	it('reads the environments of the loaded packages', async () => {
		expect(await modeOf('\\begin{prooftree}\n\\alph|', `\\documentclass{article}\n\\usepackage{prooftree}\n\\begin{document}\n`)).toBe(
			'math'
		);
		expect(await modeOf('\\begin{prooftree}\n\\alph|')).toBe('text');
		expect(await modeOf('\\begin{mathpar}\n\\alph|')).toBe('math');
	});

	it('reads an environment the document defines as math when its begin code opens math', async () => {
		const preamble = PREAMBLE + '\\newenvironment{myeq}{\\begin{equation}}{\\end{equation}}\n\\begin{document}\n';
		expect(await modeOf('\\begin{myeq}\n\\alph|', preamble)).toBe('math');
		expect(await modeOf('\\begin{myeq}\nx\n\\end{myeq}\n\\alph|', preamble)).toBe('text');
	});

	it('reads a command the document defines as opening math', async () => {
		const preamble = PREAMBLE + '\\newcommand{\\be}{\\begin{equation}}\\newcommand{\\ee}{\\end{equation}}\n\\begin{document}\n';
		expect(await modeOf('\\be\n\\alph|', preamble)).toBe('math');
		expect(await modeOf('\\be x \\ee\n\\alph|', preamble)).toBe('text');
		const wrapper = PREAMBLE + '\\newcommand{\\inl}[1]{$#1$}\n\\begin{document}\n';
		expect(await modeOf('\\inl{\\alph|', wrapper)).toBeNull();
		expect(await modeOf('\\inl{x} \\alph|', wrapper)).toBe('text');
	});

	it('does not read the begin of a definition in the paragraph as an open environment', async () => {
		expect(await modeOf('\\newcommand{\\be}{\\begin{equation}}\n\\alph|')).toBe('text');
	});

	it('is unknown inside the body of a \\def, \\gdef, \\edef, \\xdef and \\let', async () => {
		for (const def of ['\\def\\foo#1{', '\\gdef\\foo{', '\\edef\\foo{', '\\xdef\\foo#1#2{'])
			expect(await modeOf(`${def} \\alph|`)).toBeNull();
		expect(await modeOf('\\def\\foo#1{x} \\alph|')).toBe('text');
	});

	it('does not count the text of a verbatim command or a link address', async () => {
		expect(await modeOf('\\verb!$! and \\alph|')).toBe('text');
		expect(await modeOf('\\url{http://a.org/$x} \\alph|')).toBe('text');
		expect(await modeOf('\\href{http://a.org/a%b$}{text} \\alph|')).toBe('text');
		expect(await modeOf('\\lstinline!%! $\\alph|')).toBe('math');
	});

	it('takes the definition of the document over the common index for the mode of an argument', async () => {
		const preamble = PREAMBLE + '\\newcommand{\\abs}[2]{#1}\n\\begin{document}\n';
		expect(await modeOf('\\abs{\\alph|', preamble)).toBe('text');
		expect(await modeOf('\\abs{\\alph|')).toBe('math');
	});
});

describe('ranking by mode', () => {
	const complete = (doc: string) => latexCompletionSource(new CompletionContext(EditorState.create({ doc }), doc.length, false));

	it('boosts math commands inside an argument that states math', async () => {
		updateSettings({ completionByMode: false });
		const alpha = (await complete('\\ensuremath{\\alph'))?.options.find((o) => o.label === '\\alpha');
		expect(alpha?.boost ?? 0).toBeGreaterThan(0);
	});
});
