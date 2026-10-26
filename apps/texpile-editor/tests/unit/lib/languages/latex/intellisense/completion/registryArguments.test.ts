import { describe, expect, it, vi } from 'vitest';
import { CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
import { EditorState } from '@codemirror/state';
import { registryArgumentCompletionSource } from '$lib/languages/latex/intellisense/completion/registryArguments';

// the data gives no environment a column spec role yet
vi.mock('$lib/languages/latex/knowledge/data/commands.json', async (original) => {
	const data = (await original<{ default: { environments: object } }>()).default;
	const spec = { args: [{ kind: 'o' }, { kind: 'm', role: 'colspec' }] };
	return { default: { ...data, environments: { ...data.environments, tabular: spec } } };
});

// the cursor sits at the end of `doc`
async function offered(doc: string, explicit = true): Promise<{ from: number; labels: string[] } | null> {
	const result: CompletionResult | null = await registryArgumentCompletionSource(
		new CompletionContext(EditorState.create({ doc }), doc.length, explicit)
	);
	return result && { from: result.from, labels: result.options.map((o) => o.label) };
}

describe('registryArgumentCompletionSource', () => {
	it('offers the loaded colors and the ones the document defines, after the last ! of a mix', async () => {
		const preamble = '\\usepackage[dvipsnames]{xcolor}\n\\definecolor{brand}{rgb}{1,0,0}\n';
		const plain = await offered(`${preamble}\\textcolor{`);
		expect(plain?.labels).toEqual(expect.arrayContaining(['brand', 'teal', 'Apricot']));
		const mixed = await offered(`${preamble}\\textcolor{red!50!bra`);
		expect(mixed?.labels).toEqual(['brand']);
		expect(mixed?.from).toBe(preamble.length + '\\textcolor{red!50!'.length);
	});

	it("offers environments in a hook's environment argument, the document's own among them", async () => {
		const labels = (await offered('\\documentclass{article}\n\\newenvironment{notebox}{}{}\n\\AtBeginEnvironment{'))?.labels;
		expect(labels).toEqual(expect.arrayContaining(['itemize', 'notebox']));
	});

	it("offers languages in an environment's argument, as in a command's", async () => {
		const preamble = '\\usepackage[english,ngerman]{babel}\n';
		expect((await offered(`${preamble}\\begin{otherlanguage}{ng`))?.labels).toContain('ngerman');
		expect((await offered(`${preamble}\\begin{otherlanguage}[x]{ng`))?.labels).toContain('ngerman');
		expect((await offered(`${preamble}\\begin{otherlanguage*}{ng`))?.labels).toContain('ngerman');
	});

	it('offers a page style only when a loaded file provides it', async () => {
		expect((await offered('\\pagestyle{'))?.labels).not.toContain('fancy');
		expect((await offered('\\usepackage{fancyhdr}\n\\pagestyle{'))?.labels).toEqual(expect.arrayContaining(['empty', 'fancy']));
	});

	it('offers a counter a document makes but not the theorem that shares one', async () => {
		const labels = (await offered('\\newcounter{steps}\n\\newtheorem{thm}{Theorem}\n\\newtheorem{lem}[thm]{Lemma}\n\\setcounter{'))?.labels;
		expect(labels).toEqual(expect.arrayContaining(['steps', 'thm', 'section']));
		expect(labels).not.toContain('lem');
	});

	it('offers a .bst style whether or not a package loads it, and nothing while a name is being defined', async () => {
		expect((await offered('\\bibliographystyle{'))?.labels).toEqual(expect.arrayContaining(['plain', 'unsrt']));
		expect(await offered('\\newcounter{ste')).toBeNull();
	});

	it('offers the column types of the loaded files and the document at the cursor, one character at a time', async () => {
		const preamble = '\\usepackage{array}\n\\newcolumntype{C}{>{\\centering}p{1cm}}\n';
		const spec = await offered(`${preamble}\\begin{tabular}{`);
		expect(spec?.labels).toEqual(expect.arrayContaining(['C', 'l', 'r', 'p', 'm', '|']));
		expect(spec?.from).toBe(`${preamble}\\begin{tabular}{`.length);
		expect((await offered(`${preamble}\\begin{tabular}{lc`))?.from).toBe(`${preamble}\\begin{tabular}{lc`.length);
		expect(await offered(`${preamble}\\begin{tabular}{lc`, false)).toBeNull();
		expect(await offered(`${preamble}\\begin{tabular}{p{2`)).toBeNull();
	});
});
